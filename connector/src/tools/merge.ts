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
  cmp, daysBetween, displayOrg, emailParts, findSensitive, firstNameRelation, fold, hasSensitive, isEmailLike, isPhoneLike, jaroWinkler,
  nameKey, orgKey, parseDate, plain, scrubContacts, tidyName, toList, todayIso, type DateOrder, type EmailParts,
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

interface Prep {
  i: number; source: string; kind: SourceKind; name: string; nameKey: string; first: string; last: string; partial: boolean;
  org: string; orgKey: string; role: string; location: string; email: EmailParts | null; ids: string[]; joined: string | null;
  lastActive: string | null; status: DirectoryMember["status"] | null; deactivated: boolean; optIn: "yes" | "no" | "unknown" | null;
  asks: string[]; offers: string[]; tags: string[]; notes: string; inferred: Set<string>; anchored: boolean;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);
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

export function mergeMemberRecords(input: MergeInput) {
  const today = parseDate(input.today ?? "") ?? todayIso();
  if (input.today && !parseDate(input.today)) throw new InputError(`today '${input.today}' is not a date; use YYYY-MM-DD`);
  const order = input.date_order ?? "DMY";
  const scrubbed = { n: 0 }, redacted = { n: 0 };
  let badDates = 0, sensitiveTags = 0, nameless = 0;

  // ---- 1. prepare ----
  const recs: Prep[] = input.records.map((r, i) => {
    const source = sourceLabel(r.source);
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
    const ids: string[] = [];
    if (r.source_id != null && String(r.source_id).trim()) ids.push(`${source}:${String(r.source_id).trim()}`);
    for (const x of r.source_ids ?? []) if (x && String(x).trim()) ids.push(String(x).includes(":") ? String(x).trim() : `${source}:${String(x).trim()}`);
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
      i, source, kind, name, nameKey: nk, first: toks[0] ?? "", last, partial: toks.length < 2 || last.length === 1,
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
    if (r.nameKey && r.orgKey) link(`n:${r.nameKey}|${r.orgKey}`, r.i);
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
    for (const r of recs) { const k = find(r.i); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.values()];
  };
  const seedOf = (rs: Prep[]) => {
    const s = [...rs].sort(byIdentity);
    const withId = s.find((r) => r.ids.length);
    if (withId) return `id:${[...withId.ids].sort()[0]}`;
    const named = s.find((r) => r.nameKey && r.orgKey);
    if (named) return `n:${named.nameKey}|${named.orgKey}`;
    const em = s.find((r) => r.email);
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
    for (const rs of groups) if (!isAccount(rs)) for (const k of new Set(rs.map((r) => r.nameKey).filter(Boolean))) byName.set(k, [...(byName.get(k) ?? []), rs]);
    for (const rs of groups) {
      if (!isAccount(rs)) continue;
      const k = rs[0].nameKey;
      const cands = k && !rs[0].partial ? byName.get(k) ?? [] : [];
      if (cands.length === 1 && !similarNameExists(k, groups)) { exactMerged.push(rs[0].name); union(rs[0].i, cands[0][0].i); }
    }
    groups = clusters();
  }
  function similarNameExists(k: string, gs: Prep[][]): boolean {
    const toks = k.split(" ");
    const first = toks[0], last = toks[toks.length - 1];
    return gs.some((rs) => !isAccount(rs) && rs.some((r) => r.nameKey !== k && r.last === last && !!firstNameRelation(first, r.first)));
  }

  const memberGroups = anchoredExists ? groups.filter((rs) => !isAccount(rs)) : groups;
  const accountGroups = anchoredExists ? groups.filter((rs) => isAccount(rs)) : [];

  // ---- 4. build members ----
  const members: DirectoryMember[] = [];
  const memberRecs = new Map<string, Prep[]>();
  for (const rs of memberGroups) {
    const id = idOf(rs);
    memberRecs.set(id, rs);
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
    const notes: string[] = [];
    for (const r of ident) {
      if (r.notes && !notes.includes(`${r.source}: ${r.notes}`)) notes.push(`${r.source}: ${r.notes}`);
      if (r.deactivated) notes.push(`${r.source}: account deactivated (its activity is not used)`);
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
    members.push({
      member_id: id, name: nameRec?.name ?? "", organisation, role, location: locRec?.location ?? "",
      email_domain: emailRec?.email?.domain ?? "", source_ids: [...new Set(rs.flatMap((r) => r.ids.length ? r.ids : [r.source]))].sort(cmp),
      status: statusRec?.status ?? "", joined: joinedDates[0] ?? "", last_active: actRecs[0]?.lastActive ?? "", last_active_source: actRecs[0]?.source ?? "",
      asks, offers, tags: [...tagsSeen.values()], opted_in: noRec ? "no" : yesRec ? "yes" : "unknown", opt_in_source: (noRec ?? yesRec)?.source ?? "",
      profile_quality: filled === 4 ? "full" : filled >= 2 ? "partial" : "thin", inferred_fields: [...inferred].sort(cmp), notes: notes.join(" | "),
      conflicts, updated: today,
    });
  }
  members.sort((a, b) => cmp(nameKey(a.name), nameKey(b.name)) || cmp(a.member_id, b.member_id));
  const ref = (m: DirectoryMember): Ref => ({ id: m.member_id, name: m.name, organisation: m.organisation, sources: [...new Set(m.source_ids.map((s) => s.split(":")[0]))] });

  // ---- 5. uncertain matches ----
  const uncertain: UncertainMatch[] = [];
  const seenPairs = new Set<string>();
  const push = (u: UncertainMatch) => {
    const k = pairKey(u.a.id, u.b?.id ?? `none:${u.a.id}`);
    if (seenPairs.has(k) || (u.b && different.has(pairKey(u.a.id, u.b.id)))) return;
    seenPairs.add(k);
    uncertain.push(u);
  };
  const keyOf = (m: DirectoryMember) => nameKey(m.name);
  const firstLast = (k: string) => { const t = k.split(" "); return { first: t[0] ?? "", last: t.length > 1 ? t[t.length - 1] : "" }; };
  // (a) same name, not merged
  const byName = new Map<string, DirectoryMember[]>();
  for (const m of members) if (keyOf(m)) byName.set(keyOf(m), [...(byName.get(keyOf(m)) ?? []), m]);
  for (const ms of byName.values()) {
    for (let x = 0; x < ms.length; x++) for (let y = x + 1; y < ms.length; y++) {
      const a = ms[x], b = ms[y];
      const both = orgKey(a.organisation) && orgKey(b.organisation);
      push(both
        ? { a: ref(a), b: ref(b), kind: "same_name_different_org", score: 1, reason: `Same name at different organisations (${a.organisation} / ${b.organisation}): one person who moved, or two people?` }
        : { a: ref(a), b: ref(b), kind: "same_name_org_missing", score: 1, reason: "Same name; the organisation is missing on one side, so it can't be confirmed." });
    }
  }
  // (b) similar names (blocked by surname, and by first name + surname initial)
  const blocks = new Map<string, DirectoryMember[]>();
  for (const m of members) {
    const k = keyOf(m); if (!k) continue;
    const { first, last } = firstLast(k);
    if (last) { blocks.set(`l:${last}`, [...(blocks.get(`l:${last}`) ?? []), m]); blocks.set(`f:${first}|${last[0]}`, [...(blocks.get(`f:${first}|${last[0]}`) ?? []), m]); }
  }
  let skippedBlocks = 0;
  for (const ms of blocks.values()) {
    if (ms.length > 300) { skippedBlocks++; continue; }
    for (let x = 0; x < ms.length; x++) for (let y = x + 1; y < ms.length; y++) {
      const a = ms[x], b = ms[y], ka = keyOf(a), kb = keyOf(b);
      if (ka === kb) continue;
      const fa = firstLast(ka), fb = firstLast(kb);
      const jw = jaroWinkler(ka, kb);
      const rel = fa.last === fb.last ? firstNameRelation(fa.first, fb.first) : null;
      if (!rel && jw < 0.9) continue;
      const sameOrg = orgKey(a.organisation) && orgKey(a.organisation) === orgKey(b.organisation);
      const where = sameOrg ? `both at ${a.organisation}` : `different organisations (${a.organisation || "none given"} / ${b.organisation || "none given"})`;
      const why = rel === "variant" || rel === "prefix" ? `'${fa.first.length < fb.first.length ? a.name.split(" ")[0] : b.name.split(" ")[0]}' could be short for '${fa.first.length < fb.first.length ? b.name.split(" ")[0] : a.name.split(" ")[0]}'`
        : rel === "initial" ? "one first name is just an initial" : "the names differ by a letter or two";
      push({ a: ref(a), b: ref(b), kind: "similar_names", score: Math.round(jw * 100) / 100, reason: `Similar names, ${where}: ${why}. Confirm before any introduction.` });
    }
  }
  // (c) chat accounts that did not resolve to a person
  const accounts: { id: string; name: string; source: string; rs: Prep[] }[] = accountGroups.map((rs) => ({ id: idOf(rs), name: rs[0].name, source: rs[0].source, rs }));
  for (const acc of accounts) {
    const aRef: Ref = { id: acc.id, name: acc.name || "(no name)", organisation: "", sources: [...new Set(acc.rs.map((r) => r.source))] };
    const k = nameKey(acc.name);
    const toks = k.split(" ").filter(Boolean);
    const exact = k ? (byName.get(k) ?? []) : [];
    const label = acc.source.charAt(0).toUpperCase() + acc.source.slice(1);
    if (exact.length === 1 && toks.length > 1 && toks[toks.length - 1].length > 1) {
      push({ a: aRef, b: ref(exact[0]), kind: "same_name_org_missing", score: 1, reason: `${label} display name matches ${exact[0].name} exactly, but the account has no email or organisation to confirm it.` });
      continue;
    }
    let cands: DirectoryMember[] = exact;
    if (!cands.length && toks.length >= 2 && toks[toks.length - 1].length === 1) {
      cands = members.filter((m) => { const f = firstLast(keyOf(m)); return f.last.startsWith(toks[toks.length - 1]) && (f.first === toks[0] || (toks[0].length >= 2 && f.first.startsWith(toks[0])) || firstNameRelation(toks[0], f.first) === "variant"); });
    } else if (!cands.length && toks.length === 1 && toks[0].length >= 2) {
      const pref = members.filter((m) => firstLast(keyOf(m)).first.startsWith(toks[0]));
      cands = pref.length >= 2 ? pref : [];
    }
    if (cands.length === 1) push({ a: aRef, b: ref(cands[0]), kind: "chat_name_partial", score: 0.7, reason: `${label} name '${acc.name}' fits only ${cands[0].name}, but it is not a full name. Confirm before merging.` });
    else if (cands.length > 1) for (const c of cands.slice(0, 5)) push({ a: aRef, b: ref(c), kind: "chat_name_ambiguous", score: 0.5, reason: `${label} name '${acc.name}' could be ${cands.slice(0, 5).map((x) => x.name).join(" or ")}: ambiguous, not merged.` });
    else push({ a: aRef, b: null, kind: "chat_handle", score: 0, reason: `${label} name '${acc.name || "(none)"}' does not identify anyone in the other sources; ask the manager who this is (not guessed).` });
  }
  uncertain.sort((x, y) => y.score - x.score || cmp(nameKey(x.a.name), nameKey(y.a.name)) || cmp(x.b?.name ?? "", y.b?.name ?? ""));

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
  const gaps = members
    .filter((m) => m.opted_in !== "no")
    .map((m) => {
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
      return { member_id: m.member_id, name: m.name, missing, importance, why: why.join("; ") };
    })
    .filter((g) => g.missing.length)
    .sort((a, b) => b.importance - a.importance || cmp(nameKey(a.name), nameKey(b.name)))
    .slice(0, 25);
  const sameOrg = new Map<string, DirectoryMember[]>();
  for (const m of members) { const k = orgKey(m.organisation); if (k) sameOrg.set(k, [...(sameOrg.get(k) ?? []), m]); }
  const same_organisation = [...sameOrg.values()].filter((ms) => ms.length > 1).map((ms) => ({ organisation: ms[0].organisation, member_ids: ms.map((m) => m.member_id) }));
  const describe_org_neutrally = members.filter((m) => findSensitive(m.organisation).length).map((m) => m.member_id);

  const warnings: string[] = [];
  if (scrubbed.n) warnings.push(`${scrubbed.n} email address(es) or phone number(s) found in free text were removed.`);
  if (redacted.n) warnings.push(`${redacted.n} sentence(s) in notes mentioned a sensitive personal detail and were removed.`);
  if (sensitiveTags) warnings.push(`${sensitiveTags} tag(s) naming a sensitive attribute were dropped.`);
  if (badDates) warnings.push(`${badDates} date value(s) could not be read and were left blank (use YYYY-MM-DD).`);
  if (nameless) warnings.push(`${nameless} record(s) had no usable name.`);
  if (skippedBlocks) warnings.push(`${skippedBlocks} very large surname group(s) were not checked for similar names.`);
  if (accounts.length) warnings.push(`${accounts.length} chat account(s) have no email or organisation and did not match anyone for certain; they are listed in uncertain_matches and not counted as members.`);
  if (describe_org_neutrally.length) warnings.push(`${describe_org_neutrally.length} organisation name(s) signal a sensitive attribute: describe them by sector only, and never infer anything about the person.`);
  const optedOut = members.filter((m) => m.opted_in === "no").length;
  if (optedOut) warnings.push(`${optedOut} member(s) opted out: no outreach, and they are left out of the gap plan.`);

  return {
    members,
    uncertain_matches: uncertain,
    stats: {
      input_records: recs.length, unique_members: n, merged: recordsInMembers - n, unresolved_accounts: accounts.length,
      merged_by_exact_name: exactMerged.length, by_source, coverage,
    },
    gaps,
    same_organisation,
    describe_org_neutrally,
    warnings,
    today,
  };
}
export type MergeOutput = ReturnType<typeof mergeMemberRecords>;
