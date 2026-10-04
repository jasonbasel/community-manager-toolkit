/**
 * plan_week: at most seven prioritised items for the coming week, with one spacing check across
 * everything proposed (DESIGN §4.5, DESIGN.md v0.2 A1 weekly-community-review).
 * Priority: removal requests → overdue answers / lapse notices → follow-through and outcome checks
 * (and unsent consent asks) → events in the next 14 days (sooner first) → new members not welcomed
 * (≤30 days) → a re-engagement batch → an impact report if a month or quarter just ended.
 * Spacing: nobody gets two proactive touches within spacing_days (inclusive) or min_gap_hours.
 * When two touches collide, a touch tied to a dated event keeps its slot; otherwise the
 * higher-priority item keeps it, and the other touch moves to the next allowed date.
 * People are one identity across every input (ids and normalised names that name the same person
 * are joined), so an opt-out or a recent touch counts whichever form each input uses. Item text is
 * written after the spacing and opt-out check: it never names someone who opted out, and its
 * prompt lists only the people still in it.
 */
import { addDays, cmp, daysBetween, isPlaceholderName, nameKey, parseDate, parseInstant, plain } from "../text/normalise.js";
import { InputError } from "./errors.js";
import { nextAllowed, optInValue } from "./segment.js";

type OptIn = boolean | string | null;
export interface PersonRef { id?: string | null; name?: string | null; opted_in?: OptIn }
export interface PlanLedgerRow {
  intro_id?: string | null; created?: string | null; source?: string | null; event?: string | null; requester?: string | null; target?: string | null;
  status?: string | null; asked_on?: string | null; answered_on?: string | null; connected_on?: string | null; outcome?: string | null;
  next_check?: string | null; notes?: string | null;
}
export interface PlanInput {
  today: string;
  ledger?: PlanLedgerRow[];
  events?: { name: string; starts_at: string; matched?: boolean | null; invitations_sent?: boolean | null; people?: (string | PersonRef)[] | null }[];
  new_members?: { id?: string | null; name?: string | null; joined: string; welcomed?: boolean | null; opted_in?: OptIn }[];
  segments?: { id: string; name?: string | null; segment: string; eligible_now?: boolean | null; next_eligible?: string | null; opted_in?: OptIn }[];
  planned_touches?: { person: string; date: string; kind?: string | null; opted_in?: OptIn }[];
  options?: { max_items?: number; spacing_days?: number; min_gap_hours?: number; reengagement_batch?: number };
}
export interface PlanItem {
  priority: number; kind: string; title: string; why_now: string; people: string[]; due: string; suggested_prompt: string; intro_ids?: string[];
}

/** Opt-outs of messages (guardrails §12): no more proactive touches, whoever relays them. */
const OPT_OUT_RE = new RegExp([
  String.raw`\bopt(?:ed|s|ing)?[- ]?out\b`, String.raw`\bunsubscrib\w*`, String.raw`\bdnc\b`,
  String.raw`\b(?:do not|don't|dont|never) (?:contact|message|email|e-mail|call|text|approach)\b`,
  String.raw`\bno (?:more|further) (?:contact|messages|emails|intros?|introductions|outreach)\b`,
  String.raw`\bstop(?:ped)? (?:messag|contact|email|text)\w*`, String.raw`\bnot to (?:be contacted|be messaged|receive)\b`,
  String.raw`\bremove[ds]? (?:them |him |her |me )?from\b`, String.raw`\basked to be removed\b`,
  String.raw`\bwithdr[ae]w\w* (?:their |his |her |my )?consent\b`, String.raw`\bconsent (?:was )?withdrawn\b`,
  String.raw`\bdelete (?:my|their|his|her|all (?:my|their|his|her)) (?:data|details|information|info|account|profile|record)s?\b`,
  String.raw`\berase (?:my|their|his|her|all)\b`, String.raw`\berasure\b`,
  String.raw`\b(?:right to be|wants? to be|asked to be|asks to be) forgotten\b`, String.raw`\bforget (?:me|them|him|her)\b`,
].join("|"), "i");
/** Removal of information (guardrails §12): stop using it and record only the category. Not an opt-out on its own. */
const REMOVAL_RE = /\b(?:removal|remove (?:the|this|that|their|his|her|my|all|what)\b|delete (?:the|this|that|what)\b|forget|forgotten|(?:do not|don't|dont) (?:use|share|repeat|mention)\b|stop using\b|not to be (?:used|shared|repeated|mentioned)\b)/i;
const ACTIONED_RE = /\b(honou?red|actioned|done|processed|completed)\b/i;
const REQUESTER_WORD = /\b(?:requester|requestor|seeker|asker)\b/i;
const TARGET_WORD = /\b(?:target|introductee)\b/i;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const nice = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
const list = (xs: string[], max = 6) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const st = (r: PlanLedgerRow) => String(r.status ?? "").trim().toLowerCase();
const outcomeUnknown = (r: PlanLedgerRow) => { const o = String(r.outcome ?? "").trim().toLowerCase(); return !o || o === "unknown" || o === "not yet"; };

/**
 * One identity per person: ids ("i:…") and normalised names ("n:…") are joined whenever one
 * reference carries both, or a bare string (which may be either) is used. Placeholder names
 * ("Unknown", initials) never join anyone.
 */
class People {
  private parent = new Map<string, string>();
  private best = new Map<string, { label: string; rank: number }>();
  /** The current identity of a key returned by ref() (identities merge as later references join them). */
  root(k: string): string { return this.find(k); }
  private find(k: string): string {
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    for (let x = k; x !== r;) { const next = this.parent.get(x)!; this.parent.set(x, r); x = next; }
    return r;
  }
  private add(k: string, label: string, rank: number): string {
    if (!this.parent.has(k)) { this.parent.set(k, k); this.best.set(k, { label, rank }); }
    const r = this.find(k), b = this.best.get(r)!;
    if (rank < b.rank) this.best.set(r, { label, rank });
    return r;
  }
  private union(a: string, b: string): string {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return ra;
    const [root, child] = ra < rb ? [ra, rb] : [rb, ra];
    this.parent.set(child, root);
    const x = this.best.get(root)!, y = this.best.get(child)!;
    if (y.rank < x.rank) this.best.set(root, y);
    return root;
  }
  private keys(id: string, name: string, bare: string): { k: string; rank: number; label: string }[] {
    const out: { k: string; rank: number; label: string }[] = [];
    const idKey = (s: string) => `i:${s.replace(/\s+/g, " ").toLowerCase()}`;
    const nk = (s: string) => { const k = nameKey(s); return k && !isPlaceholderName(k) ? `n:${k}` : ""; };
    if (name && nk(name)) out.push({ k: nk(name), rank: 0, label: name });
    if (bare) { out.push({ k: idKey(bare), rank: /\s/.test(bare) ? 1 : 2, label: bare }); if (nk(bare)) out.push({ k: nk(bare), rank: /\s/.test(bare) ? 1 : 2, label: bare }); }
    if (id) out.push({ k: idKey(id), rank: 3, label: id });
    return out;
  }
  /** Register a reference (explicit id and/or name, or a bare string that may be either); returns its identity. */
  ref(r: { id?: unknown; name?: unknown; bare?: unknown }): string {
    const t = (v: unknown) => (v == null ? "" : String(v).trim());
    const ks = this.keys(t(r.id), t(r.name), t(r.bare));
    if (!ks.length) return this.add(`u:${this.parent.size}`, t(r.name) || t(r.id) || t(r.bare), 4); // a placeholder name alone: its own identity
    let root = this.add(ks[0].k, ks[0].label, ks[0].rank);
    for (const x of ks.slice(1)) root = this.union(root, this.add(x.k, x.label, x.rank));
    return this.find(root);
  }
  label(k: string): string { return this.best.get(this.find(k))?.label ?? k; }
}

/** Whether a note names this person: their full name, or a name word the other person doesn't share. */
function mentions(note: string, who: string, other: string): boolean {
  const k = nameKey(who);
  if (!k) return false;
  const text = ` ${plain(note)} `;
  if (text.includes(` ${k} `)) return true;
  const theirs = new Set(nameKey(other).split(" "));
  return k.split(" ").some((t) => t.length >= 3 && !theirs.has(t) && text.includes(` ${t} `));
}
/** Which side of an intro an opt-out note is about: an explicit role word first, then a name; both when the note doesn't say. */
function optOutParty(note: string, r: PlanLedgerRow): "requester" | "target" | "both" {
  const roleR = REQUESTER_WORD.test(note), roleT = TARGET_WORD.test(note);
  if (roleR !== roleT) return roleR ? "requester" : "target";
  const nameR = mentions(note, r.requester!, r.target!), nameT = mentions(note, r.target!, r.requester!);
  if (nameR !== nameT) return nameR ? "requester" : "target";
  return "both";
}

export function planWeek(input: PlanInput) {
  const today = parseDate(input.today);
  if (!today) throw new InputError(`today '${input.today}' is not a date; use YYYY-MM-DD`);
  const o = { max_items: input.options?.max_items ?? 7, spacing_days: input.options?.spacing_days ?? 7, min_gap_hours: input.options?.min_gap_hours ?? 72, reengagement_batch: input.options?.reengagement_batch ?? 5 };
  const ledger = input.ledger ?? [];
  const D = (v: unknown) => parseDate(v ?? "");
  ledger.forEach((r, i) => {
    if (!r.requester || !String(r.requester).trim()) throw new InputError(`ledger[${i}].requester is missing`);
    if (!r.target || !String(r.target).trim()) throw new InputError(`ledger[${i}].target is missing`);
  });

  // ---- one identity map across every input ----
  const people = new People();
  const personRef = (p: string | PersonRef, path: string) => {
    if (typeof p === "string") { if (!p.trim()) throw new InputError(`${path} is empty`); return { label: p.trim(), ref: { bare: p }, opted_in: undefined as OptIn | undefined }; }
    const label = String(p?.name ?? p?.id ?? "").trim();
    if (!label) throw new InputError(`${path} needs a name or id`);
    return { label, ref: { id: p.id, name: p.name }, opted_in: p.opted_in };
  };
  const newMembers = (input.new_members ?? []).map((m, i) => {
    const label = String(m.name ?? m.id ?? "").trim();
    if (!label) throw new InputError(`new_members[${i}] needs a name or id`);
    return { m, i, label, root: people.ref({ id: m.id, name: m.name }) };
  });
  const segs = (input.segments ?? []).map((s) => ({ s, root: people.ref({ bare: s.id, name: s.name }) }));
  const rows = ledger.map((r) => ({ r, req: people.ref({ bare: r.requester }), tgt: people.ref({ bare: r.target }) }));
  const eventPeople = (input.events ?? []).map((e, i) => (e.people ?? []).map((p, j) => { const x = personRef(p, `events[${i}].people[${j}]`); return { ...x, root: people.ref(x.ref) }; }));
  const planned = (input.planned_touches ?? []).map((p, i) => {
    if (!String(p.person ?? "").trim()) throw new InputError(`planned_touches[${i}].person is missing`);
    return { p, root: people.ref({ bare: p.person }) };
  });
  // Keys from ref() can be joined by later references: always resolve them through R() after registration.
  const R = (k: string) => people.root(k);
  const label = (k: string) => people.label(k);

  // ---- opt-outs and removal requests ----
  const optedOut = new Map<string, string>();
  const markOut = (root: string, reason: string) => { const k = R(root); if (!optedOut.has(k)) optedOut.set(k, reason); };
  const removals: PlanLedgerRow[] = [];
  for (const { r, req, tgt } of rows) {
    const n = String(r.notes ?? "").replace(/[’‘`]/g, "'");
    const optOut = OPT_OUT_RE.test(n);
    if (!optOut && !REMOVAL_RE.test(n)) continue;
    if (!ACTIONED_RE.test(n)) removals.push(r);
    if (!optOut) continue; // removal of information: stop using it, but the person can still be contacted
    const where = `ledger ${r.intro_id ?? "row"}`;
    const who = optOutParty(n, r);
    if (who === "both") { markOut(req, `opted out (${where}; the note doesn't say who, so both people are held until you confirm)`); markOut(tgt, `opted out (${where}; the note doesn't say who, so both people are held until you confirm)`); }
    else markOut(who === "requester" ? req : tgt, `opted out (${where})`);
  }
  for (const { s, root } of segs) if (optInValue(s.opted_in) === "no") markOut(root, "opted out (segments)");
  for (const { m, root } of newMembers) if (optInValue(m.opted_in) === "no") markOut(root, "opted out (new_members)");
  eventPeople.forEach((ps, i) => { for (const p of ps) if (optInValue(p.opted_in) === "no") markOut(p.root, `opted out (events[${i}])`); });
  for (const { p, root } of planned) if (optInValue(p.opted_in) === "no") markOut(root, "opted out (planned_touches)");
  const isOut = (root: string) => optedOut.has(R(root));

  // ---- existing touches (instants) ----
  const touches = new Map<string, number[]>();
  const addTouch = (root: string, d: string | null) => { if (!d) return; const t = parseInstant(d); if (t === null) return; const k = R(root); touches.set(k, [...(touches.get(k) ?? []), t]); };
  for (const { r, req, tgt } of rows) {
    addTouch(tgt, D(r.asked_on));
    if (D(r.connected_on)) { addTouch(req, D(r.connected_on)); addTouch(tgt, D(r.connected_on)); }
    if (st(r) === "proposed" && D(r.next_check) && D(r.next_check)! > today) addTouch(tgt, D(r.next_check));
  }
  for (const { p, root } of planned) addTouch(root, D(p.date));

  // ---- candidate items in priority order ----
  // Each candidate lists its recipients (with opted-out people included, so they are reported as held) and
  // renders its text from the recipients that survive the spacing and opt-out check.
  type Recipient = { label: string; root: string };
  type Text = { title: string; why_now: string; suggested_prompt: string; intro_ids?: string[] };
  type Cand = {
    priority: number; kind: string; touch: boolean; due: string; deadline?: string; recipients: Recipient[];
    render: (kept: (root: string) => boolean) => Text | null;
    /** The intros a held recipient's touch was about, so a moved check can be traced. */
    introsOf?: (root: string) => string[];
  };
  const cands: Cand[] = [];
  type Row = (typeof rows)[number];
  const ids = (rs: Row[]) => rs.map(({ r }) => r.intro_id ?? "").filter(Boolean);
  const refs = (rs: Row[], each: (x: Row) => string) => (rs.every(({ r }) => r.intro_id) ? ids(rs).join(", ") : rs.map(each).join("; "));
  const introsOf = (rs: Row[], sides: ("req" | "tgt")[]) => (root: string) => ids(rs.filter((x) => sides.some((s) => R(x[s]) === R(root))));
  /** "Requester → Target", leaving out anyone who opted out (they are never named in an item). */
  const pairText = (x: Row) => [x.r.requester!, x.r.target!].filter((_p, k) => !isOut(k ? x.tgt : x.req)).join(" → ") || "an intro";

  if (removals.length) {
    const rids = removals.map((r) => r.intro_id ?? "").filter(Boolean);
    cands.push({
      priority: 0, kind: "removal_requests", touch: false, due: today, recipients: [],
      render: () => ({
        title: `Action ${removals.length} removal or opt-out request${removals.length > 1 ? "s" : ""}`, why_now: "Removal and opt-out requests are honoured immediately.",
        intro_ids: rids, suggested_prompt: `Action the removal and opt-out requests in my ledger${rids.length ? ` (${rids.join(", ")})` : ""} and note them`,
      }),
    });
  }
  const overdue = rows.filter(({ r }) => st(r) === "asked" && ((D(r.next_check) && D(r.next_check)! <= today) || (D(r.asked_on) && daysBetween(D(r.asked_on)!, today) >= 3)));
  if (overdue.length) cands.push({
    priority: 1, kind: "lapse_notices", touch: true, due: today, recipients: overdue.map((x) => ({ label: x.r.requester!, root: x.req })), introsOf: introsOf(overdue, ["req"]),
    render: (kept) => {
      const rs = overdue.filter((x) => kept(x.req));
      if (!rs.length) return null;
      return {
        title: `Close ${rs.length} unanswered intro ask${rs.length > 1 ? "s" : ""}: lapse notices and runner-ups`,
        why_now: rs.map((x) => `${pairText(x)} asked ${D(x.r.asked_on) ? nice(D(x.r.asked_on)!) : "earlier"}${D(x.r.next_check) ? `, check was due ${nice(D(x.r.next_check)!)}` : ""}`).join("; ") + ". No answer after 3+ days.",
        intro_ids: ids(rs), suggested_prompt: `Draft lapse notices for my unanswered intro asks (${refs(rs, (x) => x.r.requester!)}) and suggest a runner-up for each`,
      };
    },
  });
  const follow = rows.filter(({ r }) => st(r) === "accepted" && !D(r.connected_on) && outcomeUnknown(r) && ((D(r.next_check) && D(r.next_check)! <= today) || (D(r.answered_on) && daysBetween(D(r.answered_on)!, today) >= 3)));
  const outcome = rows.filter(({ r }) => st(r) === "connected" && outcomeUnknown(r) && ((D(r.next_check) && D(r.next_check)! <= today) || (D(r.connected_on) && daysBetween(D(r.connected_on)!, today) >= 10)));
  if (follow.length || outcome.length) cands.push({
    priority: 2, kind: "checks_due", touch: true, due: today, introsOf: introsOf([...follow, ...outcome], ["req", "tgt"]),
    recipients: [...follow, ...outcome].flatMap((x) => [{ label: x.r.requester!, root: x.req }, { label: x.r.target!, root: x.tgt }]),
    render: (kept) => {
      const live = (x: Row) => kept(x.req) || kept(x.tgt);
      const f = follow.filter(live), oc = outcome.filter(live);
      if (!f.length && !oc.length) return null;
      const due = (x: Row) => `${pairText(x)} (due ${D(x.r.next_check) ? nice(D(x.r.next_check)!) : "now"})`;
      const to = [...new Map([...f, ...oc].flatMap((x) => [[R(x.req), x.r.requester!], [R(x.tgt), x.r.target!]] as [string, string][]).filter(([k]) => kept(k))).values()];
      const n = f.length + oc.length;
      return {
        title: `Follow-through and outcome checks for ${n} intro${n > 1 ? "s" : ""}`,
        why_now: [
          f.length ? `Follow-through ("have you two found a time?"): ${f.map(due).join("; ")}` : "",
          oc.length ? `Outcome check (3 options): ${oc.map(due).join("; ")}` : "",
        ].filter(Boolean).join(". ") + ".",
        intro_ids: ids([...f, ...oc]),
        suggested_prompt: `Draft the follow-through and outcome checks that are due${ids([...f, ...oc]).length ? ` (${ids([...f, ...oc]).join(", ")})` : ""}, for: ${list(to, 10)}`,
      };
    },
  });
  const unsentAll = rows.filter(({ r }) => st(r) === "proposed" && ((D(r.next_check) && D(r.next_check)! <= today) || (!D(r.next_check) && D(r.created) && daysBetween(D(r.created)!, today) >= 3)));
  // A consent ask shares the requester's name, so it never goes out for a requester who opted out (held below: withdraw instead).
  const unsent = unsentAll.filter((x) => !isOut(x.req));
  if (unsent.length) cands.push({
    priority: 3, kind: "unsent_asks", touch: true, due: today, recipients: unsent.map((x) => ({ label: x.r.target!, root: x.tgt })), introsOf: introsOf(unsent, ["tgt"]),
    render: (kept) => {
      const rs = unsent.filter((x) => kept(x.tgt));
      if (!rs.length) return null;
      return {
        title: `Send or drop ${rs.length} proposed intro${rs.length > 1 ? "s" : ""} never asked`,
        why_now: rs.map((x) => `${pairText(x)} proposed ${D(x.r.created) ? nice(D(x.r.created)!) : "earlier"}${D(x.r.next_check) ? `, due ${nice(D(x.r.next_check)!)}` : ""}`).join("; ") + ".",
        intro_ids: ids(rs), suggested_prompt: `Draft the consent asks for my proposed intros (${rs.map(pairText).join("; ")}), or tell me which to drop`,
      };
    },
  });
  const events = (input.events ?? []).map((e, i) => {
    const d = D(e.starts_at);
    if (!d) throw new InputError(`events[${i}].starts_at '${e.starts_at}' is not a date`);
    return { ...e, date: d, invitees: eventPeople[i] };
  }).filter((e) => e.date >= today && daysBetween(today, e.date) <= 14).sort((a, b) => cmp(a.date, b.date) || cmp(a.name, b.name));
  for (const e of events) {
    const inDays = daysBetween(today, e.date);
    if (e.invitations_sent === false && e.invitees.length) cands.push({
      priority: 4, kind: "event_invitations", touch: true, due: today, deadline: addDays(e.date, -3), recipients: e.invitees.map((p) => ({ label: p.label, root: p.root })),
      render: (kept) => {
        const ks = [...new Map(e.invitees.filter((p) => kept(p.root)).map((p) => [R(p.root), p.label])).values()];
        if (!ks.length) return null;
        return {
          title: `Send the ${e.name} invitations (${plural(ks.length, "invitee")})`,
          why_now: `${e.name} is on ${nice(e.date)}, ${inDays} day${inDays === 1 ? "" : "s"} away, and invitations have not gone out.`,
          suggested_prompt: `Draft personal invitations to ${e.name} on ${nice(e.date)} for: ${list(ks, 10)}`,
        };
      },
    });
    if (e.matched !== true && e.invitations_sent !== false) cands.push({
      priority: 4, kind: "event_matching", touch: false, due: inDays > 1 ? addDays(e.date, -1) : today, recipients: [],
      render: () => ({
        title: `Match the attendees for ${e.name} (${nice(e.date)})`,
        why_now: `${inDays} day${inDays === 1 ? "" : "s"} away and not matched yet. Pairing messages go out 60 to 90 minutes before the start; registration is not attendance, so give everyone a backup.`,
        suggested_prompt: `Match the attendees for ${e.name} on ${nice(e.date)}`,
      }),
    });
  }
  const welcomedByLedger = new Set(rows.filter(({ r }) => String(r.source ?? "").toLowerCase() === "onboarding").map((x) => R(x.req)));
  const newcomers = newMembers.map(({ m, i, label: who, root }) => {
    const j = D(m.joined);
    if (!j) throw new InputError(`new_members[${i}].joined '${m.joined}' is not a date`);
    return { who, root, joined: j, welcomed: m.welcomed === true || welcomedByLedger.has(R(root)) };
  }).filter((m) => !m.welcomed && m.joined <= today && daysBetween(m.joined, today) <= 30)
    .sort((a, b) => cmp(a.joined, b.joined) || cmp(a.who, b.who));
  if (newcomers.length) cands.push({
    priority: 5, kind: "welcomes", touch: true, due: today, recipients: newcomers.map((m) => ({ label: m.who, root: m.root })),
    render: (kept) => {
      const ms = newcomers.filter((m) => kept(m.root));
      if (!ms.length) return null;
      return {
        title: `Welcome ${ms.length} new member${ms.length > 1 ? "s" : ""} with a named introduction`,
        why_now: `Joined in the last 30 days with no welcome on record: ${ms.map((m) => `${m.who} (${nice(m.joined)})`).join(", ")}.`,
        suggested_prompt: `Draft welcome messages, each built around one named introduction, for: ${list(ms.map((m) => m.who), 10)}`,
      };
    },
  });
  if (segs.length) {
    const rankSeg = (s: string) => ["dark", "nudge_only", "never_contacted", "occasional"].indexOf(s);
    const already = new Set(cands.filter((c) => c.touch).flatMap((c) => c.recipients.map((p) => R(p.root))));
    const batch = segs.filter(({ s, root }) => rankSeg(s.segment) >= 0 && s.eligible_now !== false && !isOut(root) && !already.has(R(root))
      && !(s.next_eligible && D(s.next_eligible) && D(s.next_eligible)! > today))
      .filter(({ root }) => { const nx = nextAllowed(touches.get(R(root)) ?? [], o.spacing_days, o.min_gap_hours); return nx === null || nx <= Date.parse(today + "T00:00:00Z"); })
      .sort((a, b) => rankSeg(a.s.segment) - rankSeg(b.s.segment) || cmp(a.s.id, b.s.id)).slice(0, o.reengagement_batch);
    if (batch.length) cands.push({
      priority: 6, kind: "reengagement_batch", touch: true, due: today, recipients: batch.map(({ s, root }) => ({ label: s.id, root })),
      render: (kept) => {
        const bs = batch.filter(({ root }) => kept(root));
        if (!bs.length) return null;
        return {
          title: `Re-engage a small batch of ${bs.length} quiet member${bs.length > 1 ? "s" : ""}`,
          why_now: `Eligible under the spacing rule and quiet: ${bs.map(({ s }) => `${s.id} (${s.segment.replace("_", "-")})`).join(", ")}. Personal asks, not a broadcast.`,
          suggested_prompt: `Draft personal re-engagement messages (a named person or event, one question) for: ${bs.map(({ s }) => s.id).join(", ")}`,
        };
      },
    });
  }
  const t = new Date(today + "T00:00:00Z");
  if (t.getUTCDate() <= 7) {
    const prev = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
    const m = prev.getUTCMonth(), y = prev.getUTCFullYear();
    const quarter = (m + 1) % 3 === 0;
    const period = quarter ? `Q${(m + 1) / 3} ${y} (${MONTHS[m - 2]} to ${MONTHS[m]})` : `${MONTHS[m]} ${y}`;
    cands.push({
      priority: 7, kind: "impact_report", touch: false, due: addDays(today, 6), recipients: [],
      render: () => ({
        title: `${quarter ? "Quarterly" : "Monthly"} impact report for ${period}`,
        why_now: `${quarter ? "The quarter" : "The month"} ended on ${nice(addDays(today, -t.getUTCDate()))}.`,
        suggested_prompt: `Build the ${period} community impact report from my ledger`,
      }),
    });
  }

  // ---- spacing across the plan ----
  const spacing_conflicts: { person: string; kept: string; moved: string; to: string; resolution: string }[] = [];
  const held: { type: "touch" | "item"; person?: string; item: string; until?: string; reason: string; intro_ids?: string[] }[] = [];
  const plannedAt = new Map<string, { at: number; kind: string }[]>();
  const horizonEnd = Date.parse(addDays(today, 6) + "T00:00:00Z");
  const titleOf = new Map(cands.map((c) => [c.kind, c.render(() => true)?.title ?? c.kind]));
  const keptBy = new Map<Cand, Set<string>>();
  // Touches tied to a dated event are placed first, then the rest in priority order.
  const touchOrder = [...cands].filter((c) => c.touch).sort((a, b) => (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || a.priority - b.priority);
  for (const c of touchOrder) {
    const keep = new Set<string>();
    const seen = new Set<string>();
    const traced = (k: string) => { const xs = c.introsOf?.(k) ?? []; return xs.length ? { intro_ids: xs } : {}; };
    for (const p of c.recipients) {
      const k = R(p.root);
      if (seen.has(k)) continue;
      seen.add(k);
      if (optedOut.has(k)) { held.push({ type: "touch", person: label(k), item: c.kind, reason: optedOut.get(k)!, ...traced(k) }); continue; }
      const want = Date.parse(c.due + "T00:00:00Z");
      const prior = [...(touches.get(k) ?? []), ...(plannedAt.get(k) ?? []).map((x) => x.at)];
      const nx = nextAllowed(prior.filter((x) => x <= want), o.spacing_days, o.min_gap_hours);
      const clashFuture = prior.filter((x) => x > want && x - want <= o.spacing_days * 86_400_000);
      const at = nx !== null && nx > want ? nx : want;
      if (at === want && !clashFuture.length) { keep.add(k); plannedAt.set(k, [...(plannedAt.get(k) ?? []), { at, kind: c.kind }]); continue; }
      const moveTo = clashFuture.length ? nextAllowed(clashFuture, o.spacing_days, o.min_gap_hours)! : at;
      const to = new Date(moveTo).toISOString().slice(0, 10);
      const keptKind = (plannedAt.get(k) ?? []).find((x) => Math.abs(x.at - want) <= (o.spacing_days + 1) * 86_400_000)?.kind ?? "an earlier touch";
      const lateForEvent = c.deadline && to > c.deadline;
      const resolution = lateForEvent
        ? `kept ${titleOf.get(keptKind) ?? keptKind}; this touch would land after ${c.deadline}, so fold it into that message or skip it`
        : `moved to ${nice(to)} (${o.spacing_days}-day spacing)`;
      spacing_conflicts.push({ person: label(k), kept: keptKind, moved: c.kind, to, resolution });
      held.push({ type: "touch", person: label(k), item: c.kind, until: to, reason: resolution, ...traced(k) });
      if (moveTo <= horizonEnd && !lateForEvent) plannedAt.set(k, [...(plannedAt.get(k) ?? []), { at: moveTo, kind: c.kind }]);
    }
    keptBy.set(c, keep);
  }

  // ---- items, written from what survived ----
  const kept: { item: PlanItem; c: Cand }[] = [];
  for (const c of cands) {
    const keep = keptBy.get(c);
    const isKept = (root: string) => (keep ? keep.has(R(root)) : true);
    const text = c.render(isKept);
    if (!text) { held.push({ type: "item", item: titleOf.get(c.kind) ?? c.kind, reason: "every person in it was moved by the spacing rule or has opted out" }); continue; }
    const names = keep ? [...new Map(c.recipients.filter((p) => isKept(p.root)).map((p) => [R(p.root), p.label])).values()] : [];
    kept.push({ c, item: { priority: c.priority, kind: c.kind, title: text.title, why_now: text.why_now, people: names, due: c.due, suggested_prompt: text.suggested_prompt, ...(text.intro_ids ? { intro_ids: text.intro_ids } : {}) } });
  }
  const items = kept.slice(0, o.max_items).map((k) => k.item);
  for (const { item } of kept.slice(o.max_items)) held.push({ type: "item", item: item.title, reason: `beyond the ${o.max_items}-item limit; run it next week or ask for it now` });
  // Requesters whose consent asks were dropped because they opted out: the intro needs withdrawing, not asking.
  for (const x of unsentAll) if (isOut(x.req)) held.push({ type: "item", item: `consent ask${x.r.intro_id ? ` for intro ${x.r.intro_id}` : ""}`, reason: "the requester opted out: withdraw the intro instead of asking" });
  const touched = new Set(kept.slice(0, o.max_items).flatMap(({ c }) => [...(keptBy.get(c) ?? [])]));
  return {
    today, items, spacing_conflicts, held,
    stats: { candidates: cands.length, items: items.length, people_touched: touched.size, opted_out: optedOut.size, moved: spacing_conflicts.length },
    spacing: { spacing_days: o.spacing_days, min_gap_hours: o.min_gap_hours, rule: "one proactive touch per person in the week; touches tied to a dated event keep their slot, others move to the next allowed date" },
  };
}
export type PlanOutput = ReturnType<typeof planWeek>;
