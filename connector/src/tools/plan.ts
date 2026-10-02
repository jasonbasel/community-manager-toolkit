/**
 * plan_week: at most seven prioritised items for the coming week, with one spacing check across
 * everything proposed (DESIGN §4.5, DESIGN.md v0.2 A1 weekly-community-review).
 * Priority: removal requests → overdue answers / lapse notices → follow-through and outcome checks
 * (and unsent consent asks) → events in the next 14 days (sooner first) → new members not welcomed
 * (≤30 days) → a re-engagement batch → an impact report if a month or quarter just ended.
 * Spacing: nobody gets two proactive touches within spacing_days (inclusive) or min_gap_hours.
 * When two touches collide, a touch tied to a dated event keeps its slot; otherwise the
 * higher-priority item keeps it, and the other touch moves to the next allowed date.
 */
import { addDays, cmp, daysBetween, nameKey, parseDate, parseInstant } from "../text/normalise.js";
import { InputError } from "./errors.js";
import { nextAllowed, optInValue } from "./segment.js";

export interface PlanLedgerRow {
  intro_id?: string | null; created?: string | null; source?: string | null; event?: string | null; requester?: string | null; target?: string | null;
  status?: string | null; asked_on?: string | null; answered_on?: string | null; connected_on?: string | null; outcome?: string | null;
  next_check?: string | null; notes?: string | null;
}
export interface PlanInput {
  today: string;
  ledger?: PlanLedgerRow[];
  events?: { name: string; starts_at: string; matched?: boolean | null; invitations_sent?: boolean | null; people?: string[] | null }[];
  new_members?: { id?: string | null; name?: string | null; joined: string; welcomed?: boolean | null }[];
  segments?: { id: string; segment: string; eligible_now?: boolean | null; next_eligible?: string | null; opted_in?: boolean | string | null }[];
  planned_touches?: { person: string; date: string; kind?: string | null }[];
  options?: { max_items?: number; spacing_days?: number; min_gap_hours?: number; reengagement_batch?: number };
}
export interface PlanItem {
  priority: number; kind: string; title: string; why_now: string; people: string[]; due: string; suggested_prompt: string; intro_ids?: string[];
}

const OPT_OUT_RE = /\b(opt(ed)?[- ]?out|unsubscrib\w*|do not contact|don'?t contact|stop (messag|contact)\w*|remove[ds]? (them |him |her )?from|asked to be removed|not to receive|forget)\b/i;
const ACTIONED_RE = /\b(honou?red|actioned|done|processed|completed|removed)\b/i;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const nice = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
const list = (xs: string[], max = 6) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`);
const st = (r: PlanLedgerRow) => String(r.status ?? "").trim().toLowerCase();
const outcomeUnknown = (r: PlanLedgerRow) => { const o = String(r.outcome ?? "").trim().toLowerCase(); return !o || o === "unknown" || o === "not yet"; };

export function planWeek(input: PlanInput) {
  const today = parseDate(input.today);
  if (!today) throw new InputError(`today '${input.today}' is not a date; use YYYY-MM-DD`);
  const o = { max_items: input.options?.max_items ?? 7, spacing_days: input.options?.spacing_days ?? 7, min_gap_hours: input.options?.min_gap_hours ?? 72, reengagement_batch: input.options?.reengagement_batch ?? 5 };
  const ledger = input.ledger ?? [];
  const D = (v: unknown) => parseDate(v ?? "");
  const display = new Map<string, string>();
  const key = (p: string) => { const k = nameKey(p) || p.trim().toLowerCase(); if (!display.has(k)) display.set(k, p.trim()); return k; };
  ledger.forEach((r, i) => {
    if (!r.requester || !String(r.requester).trim()) throw new InputError(`ledger[${i}].requester is missing`);
    if (!r.target || !String(r.target).trim()) throw new InputError(`ledger[${i}].target is missing`);
  });

  // ---- opt-outs and removal requests ----
  const optedOut = new Map<string, string>();
  const removals: PlanLedgerRow[] = [];
  for (const r of ledger) {
    const n = String(r.notes ?? "");
    if (!OPT_OUT_RE.test(n)) continue;
    const who = /\brequester\b/i.test(n) ? r.requester! : r.target!;
    optedOut.set(key(who), `opted out (ledger ${r.intro_id ?? "row"})`);
    if (!ACTIONED_RE.test(n)) removals.push(r);
  }
  for (const s of input.segments ?? []) if (optInValue(s.opted_in) === "no") optedOut.set(key(s.id), "opted out (segments)");

  // ---- existing touches (instants) ----
  const touches = new Map<string, number[]>();
  const addTouch = (p: string, d: string | null) => { if (!d) return; const t = parseInstant(d); if (t === null) return; const k = key(p); touches.set(k, [...(touches.get(k) ?? []), t]); };
  for (const r of ledger) {
    addTouch(r.target!, D(r.asked_on));
    if (D(r.connected_on)) { addTouch(r.requester!, D(r.connected_on)); addTouch(r.target!, D(r.connected_on)); }
    if (st(r) === "proposed" && D(r.next_check) && D(r.next_check)! > today) addTouch(r.target!, D(r.next_check));
  }
  for (const p of input.planned_touches ?? []) addTouch(p.person, D(p.date));

  // ---- candidate items in priority order ----
  type Cand = PlanItem & { deadline?: string; touch: boolean };
  const cands: Cand[] = [];
  const ids = (rs: PlanLedgerRow[]) => rs.map((r) => r.intro_id ?? "").filter(Boolean);
  const pair = (r: PlanLedgerRow) => `${r.requester} → ${r.target}`;
  if (removals.length) cands.push({
    priority: 0, kind: "removal_requests", title: `Action ${removals.length} removal or opt-out request${removals.length > 1 ? "s" : ""}`, touch: false,
    why_now: "Removal and opt-out requests are honoured immediately.", people: [], due: today, intro_ids: ids(removals),
    suggested_prompt: `Action the removal and opt-out requests in my ledger (${ids(removals).join(", ")}) and note them`,
  });
  const overdue = ledger.filter((r) => st(r) === "asked" && ((D(r.next_check) && D(r.next_check)! <= today) || (D(r.asked_on) && daysBetween(D(r.asked_on)!, today) >= 3)));
  if (overdue.length) cands.push({
    priority: 1, kind: "lapse_notices", title: `Close ${overdue.length} unanswered intro ask${overdue.length > 1 ? "s" : ""}: lapse notices and runner-ups`, touch: true,
    why_now: overdue.map((r) => `${pair(r)} asked ${D(r.asked_on) ? nice(D(r.asked_on)!) : "earlier"}${D(r.next_check) ? `, check was due ${nice(D(r.next_check)!)}` : ""}`).join("; ") + ". No answer after 3+ days.",
    people: [...new Set(overdue.map((r) => r.requester!))], due: today, intro_ids: ids(overdue),
    suggested_prompt: `Draft lapse notices for my unanswered intro asks (${ids(overdue).join(", ")}) and suggest a runner-up for each`,
  });
  const follow = ledger.filter((r) => st(r) === "accepted" && !D(r.connected_on) && outcomeUnknown(r) && ((D(r.next_check) && D(r.next_check)! <= today) || (D(r.answered_on) && daysBetween(D(r.answered_on)!, today) >= 3)));
  const outcome = ledger.filter((r) => st(r) === "connected" && outcomeUnknown(r) && ((D(r.next_check) && D(r.next_check)! <= today) || (D(r.connected_on) && daysBetween(D(r.connected_on)!, today) >= 10)));
  if (follow.length || outcome.length) cands.push({
    priority: 2, kind: "checks_due", title: `Follow-through and outcome checks for ${follow.length + outcome.length} intro${follow.length + outcome.length > 1 ? "s" : ""}`, touch: true,
    why_now: [
      follow.length ? `Follow-through ("have you two found a time?"): ${follow.map((r) => `${pair(r)} (due ${D(r.next_check) ? nice(D(r.next_check)!) : "now"})`).join("; ")}` : "",
      outcome.length ? `Outcome check (3 options): ${outcome.map((r) => `${pair(r)} (due ${D(r.next_check) ? nice(D(r.next_check)!) : "now"})`).join("; ")}` : "",
    ].filter(Boolean).join(". ") + ".",
    people: [...new Set([...follow, ...outcome].flatMap((r) => [r.requester!, r.target!]))], due: today, intro_ids: ids([...follow, ...outcome]),
    suggested_prompt: "Follow up on my intros: draft the follow-through and outcome checks that are due",
  });
  const unsent = ledger.filter((r) => st(r) === "proposed" && ((D(r.next_check) && D(r.next_check)! <= today) || (!D(r.next_check) && D(r.created) && daysBetween(D(r.created)!, today) >= 3)));
  if (unsent.length) cands.push({
    priority: 3, kind: "unsent_asks", title: `Send or drop ${unsent.length} proposed intro${unsent.length > 1 ? "s" : ""} never asked`, touch: true,
    why_now: unsent.map((r) => `${pair(r)} proposed ${D(r.created) ? nice(D(r.created)!) : "earlier"}${D(r.next_check) ? `, due ${nice(D(r.next_check)!)}` : ""}`).join("; ") + ".",
    people: [...new Set(unsent.map((r) => r.target!))], due: today, intro_ids: ids(unsent),
    suggested_prompt: `Draft the consent asks for my proposed intros (${unsent.map(pair).join("; ")}), or tell me which to drop`,
  });
  const events = (input.events ?? []).map((e, i) => {
    const d = D(e.starts_at);
    if (!d) throw new InputError(`events[${i}].starts_at '${e.starts_at}' is not a date`);
    return { ...e, date: d };
  }).filter((e) => e.date >= today && daysBetween(today, e.date) <= 14).sort((a, b) => cmp(a.date, b.date) || cmp(a.name, b.name));
  for (const e of events) {
    const inDays = daysBetween(today, e.date);
    if (e.invitations_sent === false && e.people?.length) cands.push({
      priority: 4, kind: "event_invitations", title: `Send the ${e.name} invitations (${e.people.length} invitee${e.people.length > 1 ? "s" : ""})`, touch: true,
      why_now: `${e.name} is on ${nice(e.date)}, ${inDays} day${inDays === 1 ? "" : "s"} away, and invitations have not gone out.`,
      people: [...new Set(e.people)], due: today, deadline: addDays(e.date, -3),
      suggested_prompt: `Draft personal invitations to ${e.name} on ${nice(e.date)} for: ${list(e.people, 10)}`,
    });
    if (e.matched !== true && e.invitations_sent !== false) cands.push({
      priority: 4, kind: "event_matching", title: `Match the attendees for ${e.name} (${nice(e.date)})`, touch: false,
      why_now: `${inDays} day${inDays === 1 ? "" : "s"} away and not matched yet. Pairing messages go out 60 to 90 minutes before the start; registration is not attendance, so give everyone a backup.`,
      people: [], due: inDays > 1 ? addDays(e.date, -1) : today,
      suggested_prompt: `Match the attendees for ${e.name} on ${nice(e.date)}`,
    });
  }
  const welcomedByLedger = new Set(ledger.filter((r) => String(r.source ?? "").toLowerCase() === "onboarding").map((r) => key(r.requester!)));
  const newcomers = (input.new_members ?? []).map((m, i) => {
    const who = String(m.name ?? m.id ?? "").trim();
    if (!who) throw new InputError(`new_members[${i}] needs a name or id`);
    const j = D(m.joined);
    if (!j) throw new InputError(`new_members[${i}].joined '${m.joined}' is not a date`);
    return { who, joined: j, welcomed: m.welcomed === true || welcomedByLedger.has(key(who)) };
  }).filter((m) => !m.welcomed && m.joined <= today && daysBetween(m.joined, today) <= 30 && !optedOut.has(key(m.who)))
    .sort((a, b) => cmp(a.joined, b.joined) || cmp(a.who, b.who));
  if (newcomers.length) cands.push({
    priority: 5, kind: "welcomes", title: `Welcome ${newcomers.length} new member${newcomers.length > 1 ? "s" : ""} with a named introduction`, touch: true,
    why_now: `Joined in the last 30 days with no welcome on record: ${newcomers.map((m) => `${m.who} (${nice(m.joined)})`).join(", ")}.`,
    people: newcomers.map((m) => m.who), due: today,
    suggested_prompt: `Draft welcome messages, each built around one named introduction, for: ${list(newcomers.map((m) => m.who), 10)}`,
  });
  const segs = input.segments ?? [];
  if (segs.length) {
    const rankSeg = (s: string) => ["dark", "nudge_only", "never_contacted", "occasional"].indexOf(s);
    const already = new Set(cands.filter((c) => c.touch).flatMap((c) => c.people.map(key)));
    const batch = segs.filter((s) => rankSeg(s.segment) >= 0 && s.eligible_now !== false && !optedOut.has(key(s.id)) && !already.has(key(s.id))
      && !(s.next_eligible && D(s.next_eligible) && D(s.next_eligible)! > today))
      .filter((s) => { const nx = nextAllowed(touches.get(key(s.id)) ?? [], o.spacing_days, o.min_gap_hours); return nx === null || nx <= Date.parse(today + "T00:00:00Z"); })
      .sort((a, b) => rankSeg(a.segment) - rankSeg(b.segment) || cmp(a.id, b.id)).slice(0, o.reengagement_batch);
    if (batch.length) cands.push({
      priority: 6, kind: "reengagement_batch", title: `Re-engage a small batch of ${batch.length} quiet member${batch.length > 1 ? "s" : ""}`, touch: true,
      why_now: `Eligible under the spacing rule and quiet: ${batch.map((s) => `${s.id} (${s.segment.replace("_", "-")})`).join(", ")}. Personal asks, not a broadcast.`,
      people: batch.map((s) => s.id), due: today,
      suggested_prompt: `Draft personal re-engagement messages (a named person or event, one question) for: ${batch.map((s) => s.id).join(", ")}`,
    });
  }
  const t = new Date(today + "T00:00:00Z");
  if (t.getUTCDate() <= 7) {
    const prev = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
    const m = prev.getUTCMonth(), y = prev.getUTCFullYear();
    const quarter = (m + 1) % 3 === 0;
    const label = quarter ? `Q${(m + 1) / 3} ${y} (${MONTHS[m - 2]} to ${MONTHS[m]})` : `${MONTHS[m]} ${y}`;
    cands.push({
      priority: 7, kind: "impact_report", title: `${quarter ? "Quarterly" : "Monthly"} impact report for ${label}`, touch: false,
      why_now: `${quarter ? "The quarter" : "The month"} ended on ${nice(addDays(today, -t.getUTCDate()))}.`,
      people: [], due: addDays(today, 6),
      suggested_prompt: `Build the ${label} community impact report from my ledger`,
    });
  }

  // ---- spacing across the plan ----
  const spacing_conflicts: { person: string; kept: string; moved: string; to: string; resolution: string }[] = [];
  const held: { type: "touch" | "item"; person?: string; item: string; until?: string; reason: string }[] = [];
  const planned = new Map<string, { at: number; kind: string }[]>();
  const horizonEnd = Date.parse(addDays(today, 6) + "T00:00:00Z");
  const titleOf = new Map(cands.map((c) => [c.kind, c.title]));
  // Touches tied to a dated event are placed first, then the rest in priority order.
  const touchOrder = [...cands].filter((c) => c.touch).sort((a, b) => (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || a.priority - b.priority);
  for (const c of touchOrder) {
    const keep: string[] = [];
    for (const p of c.people) {
      const k = key(p);
      if (optedOut.has(k)) { held.push({ type: "touch", person: display.get(k) ?? p, item: c.kind, reason: optedOut.get(k)! }); continue; }
      const want = Date.parse(c.due + "T00:00:00Z");
      const prior = [...(touches.get(k) ?? []), ...(planned.get(k) ?? []).map((x) => x.at)];
      const nx = nextAllowed(prior.filter((x) => x <= want), o.spacing_days, o.min_gap_hours);
      const clashFuture = prior.filter((x) => x > want && x - want <= o.spacing_days * 86_400_000);
      const at = nx !== null && nx > want ? nx : want;
      if (at === want && !clashFuture.length) { keep.push(p); planned.set(k, [...(planned.get(k) ?? []), { at, kind: c.kind }]); continue; }
      const moveTo = clashFuture.length ? nextAllowed(clashFuture, o.spacing_days, o.min_gap_hours)! : at;
      const to = new Date(moveTo).toISOString().slice(0, 10);
      const keptKind = (planned.get(k) ?? []).find((x) => Math.abs(x.at - want) <= (o.spacing_days + 1) * 86_400_000)?.kind ?? "an earlier touch";
      const lateForEvent = c.deadline && to > c.deadline;
      const resolution = lateForEvent
        ? `kept ${titleOf.get(keptKind) ?? keptKind}; this touch would land after ${c.deadline}, so fold it into that message or skip it`
        : `moved to ${nice(to)} (${o.spacing_days}-day spacing)`;
      spacing_conflicts.push({ person: display.get(k) ?? p, kept: keptKind, moved: c.kind, to, resolution });
      held.push({ type: "touch", person: display.get(k) ?? p, item: c.kind, until: to, reason: resolution });
      if (moveTo <= horizonEnd && !lateForEvent) planned.set(k, [...(planned.get(k) ?? []), { at: moveTo, kind: c.kind }]);
    }
    c.people = keep;
  }
  const keepItem = (c: Cand) => !c.touch || c.people.length > 0;
  for (const c of cands) if (!keepItem(c)) held.push({ type: "item", item: c.title, reason: "every person in it was moved by the spacing rule or has opted out" });
  const kept = cands.filter(keepItem);
  const items: PlanItem[] = kept.slice(0, o.max_items).map(({ deadline: _d, touch: _t, ...rest }) => rest);
  for (const c of kept.slice(o.max_items)) held.push({ type: "item", item: c.title, reason: `beyond the ${o.max_items}-item limit; run it next week or ask for it now` });
  const touched = new Set(items.flatMap((i) => i.people.map(key)));
  return {
    today, items, spacing_conflicts, held,
    stats: { candidates: cands.length, items: items.length, people_touched: touched.size, opted_out: optedOut.size, moved: spacing_conflicts.length },
    spacing: { spacing_days: o.spacing_days, min_gap_hours: o.min_gap_hours, rule: "one proactive touch per person in the week; touches tied to a dated event keep their slot, others move to the next allowed date" },
  };
}
export type PlanOutput = ReturnType<typeof planWeek>;
