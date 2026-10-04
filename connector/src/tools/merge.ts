/**
 * merge_member_records: merge records from several sources into one directory without contact
 * details (DESIGN §4.2, DESIGN.md v0.2 A1). Certain matches merge; uncertain ones are listed for
 * the manager and never merged. Emails are used for matching only and never returned.
 */
import { createHash } from "node:crypto";
import {
  ASKS_PRECEDENCE, DEACTIVATED_VALUES, IDENTITY_PRECEDENCE, OPT_IN_NO, OPT_IN_YES, SOURCE_KINDS, STATUS_VALUES, type SourceKind,
} from "../data/sources.js";
import {
  cmp, daysBetween, displayOrg, emailParts, findSensitive, firstNameRelation, fold, hasSensitive, idContactKind, isEmailLike, isHandleLabel, isPhoneLabel, isPhoneLike, isUrlLike,
  isPlaceholderName, jaroWinkler, nameKey, orgKey, parseDate, plain, scrubContacts, tidyName, toList, todayIso, type DateOrder, type EmailParts,
} from "../text/normalise.js";
import { InputError } from "./errors.js";

export interface MergeRecord {
  name?: string | null; first_name?: string | null; last_name?: string | null; organisation?: string | null; role?: string | null;
  location?: string | null; email?: string | null; source?: string | null; source_id?: string | number | null; source_ids?: string[] | null;
  joined?: string | null; last_active?: string | null; status?: string | null; asks?: string | string[] | null; offers?: string | string[] | null;
  tags?: string | string[] | null; opted_in?: boolean | string | null; notes?: string | null; inferred_fields?: string[] | null;
}
export interface MergeInput {
  records: MergeRecord[];
  precedence?: { identity?: string[]; asks_offers?: string[] };
  today?: string;
  merge_exact_names?: boolean;
  decisions?: { a: string; b: string; same: boolean }[];
  date_order?: DateOrder;
}
export interface DirectoryMember {
  member_id: string; name: string; organisation: string; role: string; location: string; email_domain: string; source_ids: string[];
  status: string; joined: string; last_active: string; last_active_source: string; asks: string[]; offers: string[]; tags: string[];
  opted_in: "yes" | "no" | "unknown"; opt_in_source: string; profile_quality: "full" | "partial" | "thin"; inferred_fields: string[];
  notes: string; conflicts: { field: string; values: { value: string; sources: string[] }[] }[]; updated: string;
}
type Ref = { id: string; name: string; organisation: string; sources: string[] };
export interface UncertainMatch { a: Ref; b: Ref | null; kind: string; reason: string; score: number }

/** Pairs are compared only within same-name groups and similar-name blocks up to this size; bigger ones are test or placeholder data. */
export const MAX_COMPARE_GROUP = 300;
/** Uncertain matches returned, strongest first; stats.uncertain_total always has the full count. */
export const MAX_UNCERTAIN = 500;

interface Prep {
  i: number; source: string; kind: SourceKind; name: string; nameKey: string; placeholder: boolean; first: string; last: string; partial: boolean;
  org: string; orgKey: string; role: string; location: string; email: EmailParts | null; ids: string[]; joined: string | null;
  lastActive: string | null; status: DirectoryMember["status"] | null; deactivated: boolean; optIn: "yes" | "no" | "unknown" | null;
  asks: string[]; offers: string[]; tags: string[]; notes: string; inferred: Set<string>; anchored: boolean;
}

/** Stable 10-character id from a seed, in base32 letters a–z and digits 2–7: never phone-shaped (no 0 or 1, never all digits). */
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const sha = (s: string) => {
  const bytes = createHash("sha256").update(s).digest();
  let bits = 0, acc = 0, out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5 && out.length < 10) { out += B32[(acc >> (bits - 5)) & 31]; bits -= 5; }
    if (out.length >= 10) break;
  }
  return /^[2-7]+$/.test(out) ? `a${out.slice(1)}` : out;
};
const yesSet = new Set(OPT_IN_YES), noSet = new Set(OPT_IN_NO);
const KNOWN_INFERABLE = new Set(["asks", "offers", "tags", "organisation", "role", "location", "notes"]);
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);

export function sourceLabel(s: string | null | undefined): string {
  const t = fold(String(s ?? "").trim()).replace(/[\s_]+/g, "-").replace(/[^a-z0-9.-]/g, "");
  return t || "unknown";
}
export function sourceKind(label: string): SourceKind {
  if (SOURCE_KINDS[label]) return SOURCE_KINDS[label];
  for (const part of label.split(/[-.]/)) if (SOURCE_KINDS[part]) return SOURCE_KINDS[part];
  return "other";
}

function optIn(v: unknown): "yes" | "no" | "unknown" | null {
  if (v === true) return "yes";
  if (v === false) return "no";
  if (v == null || v === "") return null;
  const s = fold(String(v)).trim();
  if (noSet.has(s)) return "no";
  if (yesSet.has(s)) return "yes";
  return "unknown";
}

const scrubText = (s: string, counter: { n: number }) => { const r = scrubContacts(s); counter.n += r.removed; return r.text; };
/** Drop sentences that mention a sensitive attribute (notes only). */
function redactSensitive(s: string, counter: { n: number }): string {
  return s.split(/(?<=[.!?;])\s+/).map((sent) => (hasSensitive(sent) ? (counter.n++, "[removed: personal detail]") : sent)).join(" ");
}

const ROLE_ORG_RE = /^(.+?)\s+(?:at|@)\s+(.+)$|^(.+?)\s*[|,]\s*(.+)$/i;
const indexList = (xs: number[]) => `${xs.slice(0, 10).map((i) => `records[${i}]`).join(", ")}${xs.length > 10 ? ` and ${xs.length - 10} more` : ""}`;

/** Keeps the strongest uncertain matches (score, then names, then ids) in bounded memory; admits() is checked before building one. */
class TopMatches {
  private items: { u: UncertainMatch; ak: string; bk: string }[] = [];
  private worst: { score: number; ak: string; bk: string; aid: string; bid: string } | null = null;
  constructor(private readonly k: number) {}
  private static order(x: { score: number; ak: string; bk: string; aid: string; bid: string }, y: typeof x): number {
    return y.score - x.score || cmp(x.ak, y.ak) || cmp(x.bk, y.bk) || cmp(x.aid, y.aid) || cmp(x.bid, y.bid);
  }
  static compare(x: { u: UncertainMatch; ak: string; bk: string }, y: typeof x): number { return TopMatches.order(TopMatches.flat(x), TopMatches.flat(y)); }
  private static flat(e: { u: UncertainMatch; ak: string; bk: string }) { return { score: e.u.score, ak: e.ak, bk: e.bk, aid: e.u.a.id, bid: e.u.b?.id ?? "" }; }
  admits(score: number, ak: string, bk: string, aid: string, bid: string): boolean {
    return !this.worst || TopMatches.order({ score, ak, bk, aid, bid }, this.worst) < 0;
  }
  add(u: UncertainMatch, ak: string, bk: string): void {
    this.items.push({ u, ak, bk });
    if (this.items.length >= 2 * this.k) this.trim();
  }
  private trim(): void {
    this.items.sort((x, y) => TopMatches.order(TopMatches.flat(x), TopMatches.flat(y)));
    this.items.length = Math.min(this.items.length, this.k);
    if (this.items.length === this.k) this.worst = TopMatches.flat(this.items[this.k - 1]);
  }
  result(): { u: UncertainMatch; ak: string; bk: string }[] { this.trim(); return this.items; }
}

export function mergeMemberRecords(input: MergeInput) {
  const today = parseDate(input.today ?? "") ?? todayIso();
  if (input.today && !parseDate(input.today)) throw new InputError(`today '${input.today}' is not a date; use YYYY-MM-DD`);
  const order = input.date_order ?? "DMY";
  const scrubbed = { n: 0 }, redacted = { n: 0 };
  let badDates = 0, sensitiveTags = 0, nameless = 0, unsafeSources = 0;
  const droppedIds: number[] = [];

  // ---- 1. prepare ----
  const recs: Prep[] = input.records.map((r, i) => {
    // A source label that is itself a contact detail would be echoed in source_ids and by_source.
    const unsafeSource = !!idContactKind(String(r.source ?? ""));
    if (unsafeSource) unsafeSources++;
    const source = unsafeSource ? "unknown" : sourceLabel(r.source);
    const kind = sourceKind(source);
    let rawName = (r.name ?? "").trim() || [r.first_name, r.last_name].filter((x) => x && String(x).trim()).join(" ").trim();
    if (rawName && (isEmailLike(rawName) || isPhoneLike(rawName))) rawName = "";
    if (!rawName) nameless++;
    const name = tidyName(scrubText(rawName, scrubbed));
    const nk = nameKey(name);
    const toks = nk.split(" ").filter(Boolean);
    let org = (r.organisation ?? "").trim(), role = (r.role ?? "").trim();
    if (!org && role) {
      const m = role.match(ROLE_ORG_RE);
      if (m) { role = (m[1] ?? m[3]).trim(); org = (m[2] ?? m[4]).trim(); }
    }
    org = scrubText(org, scrubbed); role = scrubText(role, scrubbed);
    const email = emailParts(r.email ?? null);
    // Source IDs that are really contact details (WhatsApp numbers, email addresses, profile links, handles) are dropped, never echoed.
    const ids: string[] = [];
    let dropped = false;
    const addId = (raw: unknown, prefixed: boolean) => {
      const s = raw == null ? "" : String(raw).trim();
      if (!s) return;
      const colon = prefixed ? s.indexOf(":") : -1;
      const prefix = colon > 0 ? s.slice(0, colon) : "", value = colon >= 0 ? s.slice(colon + 1) : s;
      // Judged by the ID's own prefix when it names a platform ("wa:", "linkedin:", "slack:"); otherwise (no prefix, or a generic one
      // such as "id:") by the record's source as well. The whole entry is checked for emails and links (they contain ":").
      const platformPrefix = prefix && (isPhoneLabel(prefix) || isHandleLabel(prefix) || sourceKind(sourceLabel(prefix)) !== "other");
      const labels = platformPrefix ? [prefix] : [prefix, source].filter(Boolean);
      if (isEmailLike(s) || isUrlLike(s) || idContactKind(value, { labels, handles: true }) || (prefix && idContactKind(prefix))) { dropped = true; return; }
      ids.push(colon >= 0 ? s : `${source}:${s}`);
    };
    addId(r.source_id, false);
    for (const x of r.source_ids ?? []) addId(x, true);
    if (dropped) droppedIds.push(i);
    const dateOf = (v: unknown) => { if (v == null || v === "") return null; const d = parseDate(v, order); if (!d) badDates++; return d; };
    const statusRaw = fold(String(r.status ?? "")).trim();
    const deactivated = kind === "chat" && DEACTIVATED_VALUES.includes(statusRaw);
    let status: Prep["status"] = STATUS_VALUES[statusRaw] ?? null;
    if (kind === "chat" && status !== "member") status = null; // chat presence can say "member", never "lapsed"
    const inferred = new Set((r.inferred_fields ?? []).map((f) => String(f).toLowerCase()).filter((f) => KNOWN_INFERABLE.has(f)));
    const asks = toList(r.asks).map((x) => scrubText(x, scrubbed));
    const offers = toList(r.offers).map((x) => scrubText(x, scrubbed));
    if (kind === "chat") { if (asks.length) inferred.add("asks"); if (offers.length) inferred.add("offers"); }
    const tags = toList(r.tags).map((t) => scrubText(t, scrubbed)).filter((t) => { if (hasSensitive(t)) { sensitiveTags++; return false; } return true; });
    const notes = r.notes ? redactSensitive(scrubText(String(r.notes).replace(/\s+/g, " ").trim(), scrubbed), redacted) : "";
    const last = toks.length > 1 ? toks[toks.length - 1] : "";
    return {
      i, source, kind, name, nameKey: nk, placeholder: isPlaceholderName(nk), first: toks[0] ?? "", last, partial: toks.length < 2 || last.length === 1,
      org, orgKey: orgKey(org), role, location: scrubText((r.location ?? "").trim(), scrubbed), email, ids, joined: dateOf(r.joined),
      lastActive: dateOf(r.last_active), status, deactivated, optIn: optIn(r.opted_in), asks, offers, tags, notes, inferred,
      anchored: kind !== "chat" || !!(email && !email.role) || !!orgKey(org),
    };
  });

  // ---- 2. certain matches (union-find) ----
  const parent = recs.map((_r, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb); };
  const firstByKey = new Map<string, number>();
  const link = (key: string, i: number) => { const j = firstByKey.get(key); if (j === undefined) firstByKey.set(key, i); else union(i, j); };
  for (const r of recs) {
    if (r.email && !r.email.role) link(`e:${r.email.key}`, r.i);
    for (const id of r.ids) link(`i:${id}`, r.i);
    if (r.nameKey && r.orgKey && !r.placeholder) link(`n:${r.nameKey}|${r.orgKey}`, r.i); // "Unknown" at Acme is not one person
  }

  const idPrec = (input.precedence?.identity ?? []).map(sourceLabel);
  const askPrec = (input.precedence?.asks_offers ?? []).map(sourceLabel);
  const rank = (r: Prep, custom: string[], def: readonly SourceKind[]) => {
    const c = custom.findIndex((x) => x === r.source || x === r.kind);
    return c >= 0 ? c : 100 + def.indexOf(r.kind);
  };
  const recency = (r: Prep) => r.lastActive ?? r.joined ?? "";
  const byIdentity = (a: Prep, b: Prep) => rank(a, idPrec, IDENTITY_PRECEDENCE) - rank(b, idPrec, IDENTITY_PRECEDENCE) || cmp(recency(b), recency(a)) || b.i - a.i;
  const byAsks = (a: Prep, b: Prep) => rank(a, askPrec, ASKS_PRECEDENCE) - rank(b, askPrec, ASKS_PRECEDENCE) || cmp(recency(b), recency(a)) || b.i - a.i;

  const clusters = () => {
    const m = new Map<number, Prep[]>();
    for (const r of recs) { const k = find(r.i); const rs = m.get(k); if (rs) rs.push(r); else m.set(k, [r]); }
    return [...m.values()];
  };
  const seedOf = (rs: Prep[]) => {
    const s = [...rs].sort(byIdentity);
    const withId = s.find((r) => r.ids.length);
    if (withId) return `id:${[...withId.ids].sort()[0]}`;
    // Seeds must be keys that also link records: never a placeholder name or a shared mailbox (info@, hello@ …), which match nobody.
    const named = s.find((r) => r.nameKey && r.orgKey && !r.placeholder);
    if (named) return `n:${named.nameKey}|${named.orgKey}`;
    const em = s.find((r) => r.email && !r.email.role);
    if (em) return `e:${em.email!.key}`;
    return `r:${s[0].source}:${s[0].i}:${s[0].nameKey}`;
  };
  const isAccount = (rs: Prep[]) => rs.every((r) => !r.anchored);
  const idOf = (rs: Prep[]) => (isAccount(rs) ? "u_" : "m_") + sha(seedOf(rs));

  // Decisions from an earlier run ("same person" merges; "different people" suppresses the pair).
  const different = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  if (input.decisions?.length) {
    const byId = new Map(clusters().map((rs) => [idOf(rs), rs[0].i]));
    input.decisions.forEach((d, k) => {
      const a = byId.get(d.a), b = byId.get(d.b);
      if (a === undefined) throw new InputError(`decisions[${k}].a '${d.a}' is not a member_id or account id from this set of records`);
      if (b === undefined) throw new InputError(`decisions[${k}].b '${d.b}' is not a member_id or account id from this set of records`);
      if (d.same) union(a, b); else different.add(pairKey(d.a, d.b));
    });
  }

  // ---- 3. accounts with no identity anchor (chat display names only) ----
  let groups = clusters();
  const anchoredExists = groups.some((rs) => !isAccount(rs));
  const exactMerged: string[] = [];
  if (anchoredExists && input.merge_exact_names) {
    const byName = new Map<string, Prep[][]>();
    const byLast = new Map<string, Prep[]>(); // anchored records by surname, for the similar-name check
    for (const rs of groups) {
      if (isAccount(rs)) continue;
      for (const k of new Set(rs.filter((r) => r.nameKey && !r.placeholder).map((r) => r.nameKey))) { const g = byName.get(k); if (g) g.push(rs); else byName.set(k, [rs]); }
      for (const r of rs) if (r.last) { const g = byLast.get(r.last); if (g) g.push(r); else byLast.set(r.last, [r]); }
    }
    const similarNameExists = (k: string) => {
      const toks = k.split(" ");
      const first = toks[0], last = toks[toks.length - 1];
      return (byLast.get(last) ?? []).some((r) => r.nameKey !== k && !!firstNameRelation(first, r.first));
    };
    for (const rs of groups) {
      if (!isAccount(rs)) continue;
      const k = rs[0].nameKey;
      const cands = k && !rs[0].partial && !rs[0].placeholder ? byName.get(k) ?? [] : [];
      if (cands.length === 1 && !similarNameExists(k)) { exactMerged.push(rs[0].name); union(rs[0].i, cands[0][0].i); }
    }
    groups = clusters();
  }

  const memberGroups = anchoredExists ? groups.filter((rs) => !isAccount(rs)) : groups;
  const accountGroups = anchoredExists ? groups.filter((rs) => isAccount(rs)) : [];

  // ---- 4. build members ----
  const built: { m: DirectoryMember; key: string }[] = []; // key: the name normalised once, reused for sorting and matching
  for (const rs of memberGroups) {
    const id = idOf(rs);
    const ident = [...rs].sort(byIdentity);
    const pick = (f: (r: Prep) => string) => ident.find((r) => !!f(r));
    const nameRec = pick((r) => (r.partial && r.kind === "chat" ? "" : r.name)) ?? pick((r) => r.name);
    const orgRec = pick((r) => r.org);
    const roleRec = pick((r) => r.role);
    const locRec = ident.find((r) => r.location && !r.location.includes("/")) ?? pick((r) => r.location);
    const statusRec = pick((r) => r.status ?? "");
    const askSorted = [...rs].sort(byAsks);
    const askRec = askSorted.find((r) => r.asks.length);
    const offerRec = askSorted.find((r) => r.offers.length);
    const actRecs = rs.filter((r) => r.lastActive && !r.deactivated).sort((a, b) => cmp(b.lastActive!, a.lastActive!) || byIdentity(a, b));
    const joinedDates = rs.map((r) => r.joined).filter((d): d is string => !!d).sort();
    const noRec = ident.find((r) => r.optIn === "no"), yesRec = ident.find((r) => r.optIn === "yes");
    const emailRec = ident.find((r) => r.email && !r.email.personal);
    const tagsSeen = new Map<string, string>();
    for (const r of ident) for (const t of r.tags) if (!tagsSeen.has(fold(t))) tagsSeen.set(fold(t), t);
    const notes: string[] = [], seenNotes = new Set<string>();
    for (const r of ident) {
      const note = r.notes ? `${r.source}: ${r.notes}` : "";
      if (note && !seenNotes.has(note)) { notes.push(note); seenNotes.add(note); }
      if (r.deactivated) { const d = `${r.source}: account deactivated (its activity is not used)`; notes.push(d); seenNotes.add(d); }
    }
    const conflicts: DirectoryMember["conflicts"] = [];
    const addConflict = (field: string, vals: { key: string; value: string; source: string }[]) => {
      const byKey = new Map<string, { value: string; sources: string[] }>();
      for (const v of vals) { if (!v.key) continue; const e = byKey.get(v.key) ?? { value: v.value, sources: [] }; if (!e.sources.includes(v.source)) e.sources.push(v.source); byKey.set(v.key, e); }
      if (byKey.size > 1) conflicts.push({ field, values: [...byKey.values()] });
    };
    addConflict("name", ident.filter((r) => r.name && !(r.partial && r.kind === "chat")).map((r) => ({ key: r.nameKey, value: r.name, source: r.source })));
    addConflict("organisation", ident.map((r) => ({ key: r.orgKey, value: displayOrg(r.org), source: r.source })));
    addConflict("role", ident.map((r) => ({ key: plain(r.role), value: r.role, source: r.source })));
    const emails = [...new Set(ident.filter((r) => r.email).map((r) => r.email!.key))];
    if (emails.length > 1) conflicts.push({ field: "email", values: emails.map((e, k) => ({ value: `address ${k + 1} (not shown)`, sources: [...new Set(ident.filter((r) => r.email?.key === e).map((r) => r.source))] })) });
    const inferred = new Set<string>();
    if (askRec?.inferred.has("asks")) inferred.add("asks");
    if (offerRec?.inferred.has("offers")) inferred.add("offers");
    for (const r of ident) for (const f of r.inferred) if (f !== "asks" && f !== "offers") inferred.add(f);
    const organisation = orgRec ? displayOrg(orgRec.org) : "";
    const role = roleRec?.role ?? "", asks = askRec?.asks ?? [], offers = offerRec?.offers ?? [];
    const filled = [organisation, role, asks.length ? "y" : "", offers.length ? "y" : ""].filter(Boolean).length;
    built.push({ key: nameRec?.nameKey ?? "", m: {
      member_id: id, name: nameRec?.name ?? "", organisation, role, location: locRec?.location ?? "",
      email_domain: emailRec?.email?.domain ?? "", source_ids: [...new Set(rs.flatMap((r) => r.ids.length ? r.ids : [r.source]))].sort(cmp),
      status: statusRec?.status ?? "", joined: joinedDates[0] ?? "", last_active: actRecs[0]?.lastActive ?? "", last_active_source: actRecs[0]?.source ?? "",
      asks, offers, tags: [...tagsSeen.values()], opted_in: noRec ? "no" : yesRec ? "yes" : "unknown", opt_in_source: (noRec ?? yesRec)?.source ?? "",
      profile_quality: filled === 4 ? "full" : filled >= 2 ? "partial" : "thin", inferred_fields: [...inferred].sort(cmp), notes: notes.join(" | "),
      conflicts, updated: today,
    } });
  }
  built.sort((a, b) => cmp(a.key, b.key) || cmp(a.m.member_id, b.m.member_id));
  const members = built.map((b) => b.m);
  const ref = (m: DirectoryMember): Ref => ({ id: m.member_id, name: m.name, organisation: m.organisation, sources: [...new Set(m.source_ids.map((s) => s.split(":")[0]))] });

  // ---- 5. uncertain matches ----
  // Bounded: pairs are compared only inside groups of up to MAX_COMPARE_GROUP, names are normalised once,
  // and only the strongest MAX_UNCERTAIN are kept (each is built only if it would make the cut).
  type MI = { m: DirectoryMember; key: string; first: string; last: string; org: string; ref: Ref };
  const mi: MI[] = built.map(({ m, key }) => {
    const t = key ? key.split(" ") : [];
    return { m, key, first: t[0] ?? "", last: t.length > 1 ? t[t.length - 1] : "", org: orgKey(m.organisation), ref: ref(m) };
  });
  const named = mi.filter((x) => x.key && !isPlaceholderName(x.key));
  // Pairs of members and rows about unresolved chat accounts are capped separately, so cheap account rows are never crowded out.
  const top = new TopMatches(MAX_UNCERTAIN), accountTop = new TopMatches(MAX_UNCERTAIN);
  const total = { members: 0, accounts: 0 };
  const admit = (score: number, ak: string, a: Ref, bk: string, b: Ref | null, into = top) => {
    if (b && different.has(pairKey(a.id, b.id))) return false;
    total[into === top ? "members" : "accounts"]++;
    return into.admits(score, ak, bk, a.id, b?.id ?? "");
  };
  const groupBy = (xs: MI[], keysOf: (x: MI) => string[]) => {
    const g = new Map<string, MI[]>();
    for (const x of xs) for (const k of keysOf(x)) { const arr = g.get(k); if (arr) arr.push(x); else g.set(k, [x]); }
    return g;
  };
  // (a) same name, not merged
  const byName = groupBy(named, (x) => [x.key]);
  let bigNameGroups = 0;
  for (const xs of byName.values()) {
    if (xs.length > MAX_COMPARE_GROUP) { bigNameGroups++; continue; }
    for (let p = 0; p < xs.length; p++) for (let q = p + 1; q < xs.length; q++) {
      const a = xs[p], b = xs[q];
      if (!admit(1, a.key, a.ref, b.key, b.ref)) continue;
      top.add(a.org && b.org
        ? { a: a.ref, b: b.ref, kind: "same_name_different_org", score: 1, reason: `Same name at different organisations (${a.m.organisation} / ${b.m.organisation}): one person who moved, or two people?` }
        : { a: a.ref, b: b.ref, kind: "same_name_org_missing", score: 1, reason: "Same name; the organisation is missing on one side, so it can't be confirmed." }, a.key, b.key);
    }
  }
  // (b) similar names (blocked by surname, and by first name + surname initial)
  const blocks = groupBy(named.filter((x) => x.last), (x) => [`l:${x.last}`, `f:${x.first}|${x.last[0]}`]);
  const surnameChecked = new Set([...blocks].filter(([k, xs]) => k.startsWith("l:") && xs.length <= MAX_COMPARE_GROUP).map(([k]) => k.slice(2)));
  let skippedBlocks = 0;
  for (const [bk, xs] of blocks) {
    if (xs.length > MAX_COMPARE_GROUP) { skippedBlocks++; continue; }
    const firstNameBlock = bk.startsWith("f:");
    for (let p = 0; p < xs.length; p++) for (let q = p + 1; q < xs.length; q++) {
      const a = xs[p], b = xs[q];
      if (a.key === b.key) continue;
      if (firstNameBlock && a.last === b.last && surnameChecked.has(a.last)) continue; // already compared in its surname block
      const jw = jaroWinkler(a.key, b.key);
      const rel = a.last === b.last ? firstNameRelation(a.first, b.first) : null;
      if (!rel && jw < 0.9) continue;
      const score = Math.round(jw * 100) / 100;
      if (!admit(score, a.key, a.ref, b.key, b.ref)) continue;
      const sameOrg = a.org && a.org === b.org;
      const where = sameOrg ? `both at ${a.m.organisation}` : `different organisations (${a.m.organisation || "none given"} / ${b.m.organisation || "none given"})`;
      const [short, long] = a.first.length < b.first.length ? [a, b] : [b, a];
      const why = rel === "variant" || rel === "prefix" ? `'${short.m.name.split(" ")[0]}' could be short for '${long.m.name.split(" ")[0]}'`
        : rel === "initial" ? "one first name is just an initial" : "the names differ by a letter or two";
      top.add({ a: a.ref, b: b.ref, kind: "similar_names", score, reason: `Similar names, ${where}: ${why}. Confirm before any introduction.` }, a.key, b.key);
    }
  }
  // (c) chat accounts that did not resolve to a person
  const accounts: { id: string; name: string; source: string; rs: Prep[] }[] = accountGroups.map((rs) => ({ id: idOf(rs), name: rs[0].name, source: rs[0].source, rs }));
  for (const acc of accounts) {
    const aRef: Ref = { id: acc.id, name: acc.name || "(no name)", organisation: "", sources: [...new Set(acc.rs.map((r) => r.source))] };
    const ak = nameKey(aRef.name), k = nameKey(acc.name);
    const toks = k ? k.split(" ") : [];
    const label = acc.source.charAt(0).toUpperCase() + acc.source.slice(1);
    const handle = () => { if (admit(0, ak, aRef, "", null, accountTop)) accountTop.add({ a: aRef, b: null, kind: "chat_handle", score: 0, reason: `${label} name '${acc.name || "(none)"}' does not identify anyone in the other sources; ask the manager who this is (not guessed).` }, ak, ""); };
    if (isPlaceholderName(k)) { handle(); continue; }
    const exact = byName.get(k) ?? [];
    if (exact.length === 1 && toks.length > 1 && toks[toks.length - 1].length > 1) {
      if (admit(1, ak, aRef, exact[0].key, exact[0].ref, accountTop)) accountTop.add({ a: aRef, b: exact[0].ref, kind: "same_name_org_missing", score: 1, reason: `${label} display name matches ${exact[0].m.name} exactly, but the account has no email or organisation to confirm it.` }, ak, exact[0].key);
      continue;
    }
    let cands: MI[] = exact;
    if (!cands.length && toks.length >= 2 && toks[toks.length - 1].length === 1) {
      const ini = toks[toks.length - 1], f0 = toks[0];
      cands = mi.filter((x) => x.last.startsWith(ini) && (x.first === f0 || (f0.length >= 2 && x.first.startsWith(f0)) || firstNameRelation(f0, x.first) === "variant"));
    } else if (!cands.length && toks.length === 1 && toks[0].length >= 2) {
      const pref = mi.filter((x) => x.first.startsWith(toks[0]));
      cands = pref.length >= 2 ? pref : [];
    }
    if (cands.length === 1) {
      if (admit(0.7, ak, aRef, cands[0].key, cands[0].ref, accountTop)) accountTop.add({ a: aRef, b: cands[0].ref, kind: "chat_name_partial", score: 0.7, reason: `${label} name '${acc.name}' fits only ${cands[0].m.name}, but it is not a full name. Confirm before merging.` }, ak, cands[0].key);
    } else if (cands.length > 1) {
      const five = cands.slice(0, 5);
      for (const c of five) if (admit(0.5, ak, aRef, c.key, c.ref, accountTop)) accountTop.add({ a: aRef, b: c.ref, kind: "chat_name_ambiguous", score: 0.5, reason: `${label} name '${acc.name}' could be ${five.map((x) => x.m.name).join(" or ")}: ambiguous, not merged.` }, ak, c.key);
    } else handle();
  }
  const memberRows = top.result(), accountRows = accountTop.result();
  const uncertain = [...memberRows, ...accountRows].sort(TopMatches.compare).map((e) => e.u);
  const accountsListed = new Set(accountRows.map((e) => e.u.a.id)).size;

  // ---- 6. stats, coverage, gaps ----
  const by_source: Record<string, number> = {};
  for (const r of recs) by_source[r.source] = (by_source[r.source] ?? 0) + 1;
  const n = members.length;
  const has = (f: (m: DirectoryMember) => boolean) => pct(members.filter(f).length, n);
  const coverage = {
    organisation: has((m) => !!m.organisation), role: has((m) => !!m.role), location: has((m) => !!m.location), asks: has((m) => m.asks.length > 0),
    offers: has((m) => m.offers.length > 0), last_active: has((m) => !!m.last_active), opted_in: has((m) => m.opted_in !== "unknown"),
  };
  const recordsInMembers = memberGroups.reduce((s, rs) => s + rs.length, 0);
  const gaps = mi
    .filter(({ m }) => m.opted_in !== "no")
    .map(({ m, key }) => {
      const missing = [!m.asks.length && "asks", !m.offers.length && "offers", !m.organisation && "organisation", !m.role && "role"].filter(Boolean) as string[];
      const since = m.last_active ? daysBetween(m.last_active, today) : null;
      const joinedAgo = m.joined ? daysBetween(m.joined, today) : null;
      const why: string[] = [];
      let importance = 0;
      if (since !== null && since <= 30) { importance += 3; why.push(`active ${since} day${since === 1 ? "" : "s"} ago`); }
      else if (since !== null && since <= 90) { importance += 2; why.push(`active ${since} days ago`); }
      else if (since !== null) { importance += 1; why.push(`last active ${m.last_active}`); }
      else why.push("no activity on record");
      if (joinedAgo !== null && joinedAgo >= 0 && joinedAgo <= 30) { importance += 2; why.push(`joined ${joinedAgo} day${joinedAgo === 1 ? "" : "s"} ago`); }
      importance += (missing.includes("asks") ? 1 : 0) + (missing.includes("offers") ? 1 : 0);
      return { member_id: m.member_id, name: m.name, missing, importance, why: why.join("; "), key };
    })
    .filter((g) => g.missing.length)
    .sort((a, b) => b.importance - a.importance || cmp(a.key, b.key))
    .slice(0, 25)
    .map(({ key: _k, ...g }) => g);
  const sameOrg = new Map<string, DirectoryMember[]>();
  for (const { m, org } of mi) if (org) { const ms = sameOrg.get(org); if (ms) ms.push(m); else sameOrg.set(org, [m]); }
  const same_organisation = [...sameOrg.values()].filter((ms) => ms.length > 1).map((ms) => ({ organisation: ms[0].organisation, member_ids: ms.map((m) => m.member_id) }));
  const describe_org_neutrally = members.filter((m) => findSensitive(m.organisation).length).map((m) => m.member_id);

  const warnings: string[] = [];
  if (scrubbed.n) warnings.push(`${scrubbed.n} email address(es) or phone number(s) found in free text were removed.`);
  if (redacted.n) warnings.push(`${redacted.n} sentence(s) in notes mentioned a sensitive personal detail and were removed.`);
  if (sensitiveTags) warnings.push(`${sensitiveTags} tag(s) naming a sensitive attribute were dropped.`);
  if (badDates) warnings.push(`${badDates} date value(s) could not be read and were left blank (use YYYY-MM-DD).`);
  if (nameless) warnings.push(`${nameless} record(s) had no usable name.`);
  if (droppedIds.length) warnings.push(`Source IDs that looked like contact details (an email address, phone number, link or handle) were dropped from ${indexList(droppedIds)}; contact details are never used as IDs.`);
  if (unsafeSources) warnings.push(`${unsafeSources} record(s) had a contact detail as their source name; it was replaced with 'unknown'.`);
  const placeholderNamed = mi.filter((x) => x.key && isPlaceholderName(x.key)).length;
  if (placeholderNamed) warnings.push(`${placeholderNamed} member(s) have a placeholder name (such as 'Unknown', 'Test' or initials only), so they were not matched by name; fix the names in the source.`);
  if (bigNameGroups) warnings.push(`${bigNameGroups} name(s) are shared by more than ${MAX_COMPARE_GROUP} members each and were not compared pair by pair (usually test or placeholder data).`);
  if (skippedBlocks) warnings.push(`${skippedBlocks} very large surname group(s) were not checked for similar names.`);
  if (total.members > memberRows.length) warnings.push(`${total.members} uncertain matches between members were found; the ${memberRows.length} strongest are listed. Answer these (decisions), then merge again to see the rest.`);
  if (accounts.length) warnings.push(`${accounts.length} chat account(s) have no email or organisation and did not match anyone for certain, so they are not counted as members; ${accountsListed === accounts.length ? "each is listed in uncertain_matches" : `${accountsListed} of them are listed in uncertain_matches (the rest appear once these are answered)`}.`);
  if (describe_org_neutrally.length) warnings.push(`${describe_org_neutrally.length} organisation name(s) signal a sensitive attribute: describe them by sector only, and never infer anything about the person.`);
  const optedOut = members.filter((m) => m.opted_in === "no").length;
  if (optedOut) warnings.push(`${optedOut} member(s) opted out: no outreach, and they are left out of the gap plan.`);

  return {
    members,
    uncertain_matches: uncertain,
    stats: {
      input_records: recs.length, unique_members: n, merged: recordsInMembers - n, unresolved_accounts: accounts.length,
      merged_by_exact_name: exactMerged.length, uncertain_total: total.members + total.accounts, uncertain_listed: uncertain.length, by_source, coverage,
    },
    gaps,
    same_organisation,
    describe_org_neutrally,
    warnings,
    today,
  };
}
export type MergeOutput = ReturnType<typeof mergeMemberRecords>;
