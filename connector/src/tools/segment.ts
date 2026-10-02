/** segment_members: deterministic engagement segments and spacing eligibility (DESIGN §4.4, DESIGN.md §6.5). */
import { RECOMMENDED_TOUCH, SEGMENT_RULES, SEGMENTS, type Segment } from "../data/segments.js";
import { OPT_IN_NO, OPT_IN_YES } from "../data/sources.js";
import { DAY_MS, cmp, fold, parseDate, parseInstant } from "../text/normalise.js";
import { assertSafeId, InputError } from "./errors.js";

export interface SegmentMemberIn {
  id: string; joined?: string | null; last_active?: string | null; last_inbound?: string | null; proactive_touches?: string[] | null;
  contacted_ever?: boolean | null; initiated_90d?: number | null; opted_in?: boolean | string | null;
}
export interface SegmentInput {
  today: string;
  members: SegmentMemberIn[];
  options?: { spacing_days?: number; min_gap_hours?: number };
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ceilDay = (ms: number) => { const d = Math.floor(ms / DAY_MS) * DAY_MS; return d === ms ? d : d + DAY_MS; };
export function optInValue(v: unknown): "yes" | "no" | "unknown" {
  if (v === true) return "yes";
  if (v === false) return "no";
  const s = fold(String(v ?? "")).trim();
  return OPT_IN_NO.includes(s) ? "no" : OPT_IN_YES.includes(s) ? "yes" : "unknown";
}

/** Next date a proactive touch is allowed, given touch instants (ms). Inclusive window: a touch on day T blocks T … T+spacing_days. */
export function nextAllowed(touches: number[], spacingDays: number, minGapHours: number): number | null {
  if (!touches.length) return null;
  const last = Math.max(...touches);
  const lastDay = Math.floor(last / DAY_MS) * DAY_MS;
  return Math.max(lastDay + (spacingDays + 1) * DAY_MS, ceilDay(last + minGapHours * 3_600_000));
}

export function segmentMembers(input: SegmentInput) {
  const today = parseDate(input.today);
  if (!today) throw new InputError(`today '${input.today}' is not a date; use YYYY-MM-DD`);
  const now = Date.parse(today + "T00:00:00Z");
  const spacing = input.options?.spacing_days ?? 7, gap = input.options?.min_gap_hours ?? 72;
  const seen = new Map<string, number>();
  const used = { initiated_90d: 0, last_inbound: 0, proactive_touches: 0, contacted_ever: 0, last_active: 0, activity_only: 0, opted_in: 0 };
  let badDates = 0;
  const out = input.members.map((m, i) => {
    const id = String(m.id ?? "").trim();
    if (!id) throw new InputError(`members[${i}].id is missing`);
    assertSafeId(id, `members[${i}].id`);
    if (seen.has(id)) throw new InputError(`members[${i}].id '${id}' is duplicated (also members[${seen.get(id)}].id)`);
    seen.set(id, i);
    const inst = (v: unknown) => { const t = parseInstant(v); if (v && t === null) badDates++; return t; };
    const inbound = inst(m.last_inbound), active = inst(m.last_active);
    const touches = (m.proactive_touches ?? []).map(inst).filter((t): t is number => t !== null).sort((a, b) => a - b);
    const past = touches.filter((t) => t <= now + DAY_MS - 1), queued = touches.filter((t) => t >= now + DAY_MS);
    const initiated = typeof m.initiated_90d === "number" && Number.isFinite(m.initiated_90d) ? Math.max(0, Math.floor(m.initiated_90d)) : null;
    const contacted = m.contacted_ever === true || touches.length > 0;
    const within90 = (t: number | null) => t !== null && now - t <= 90 * DAY_MS && t <= now + DAY_MS;
    if (initiated !== null) used.initiated_90d++;
    if (inbound !== null) used.last_inbound++;
    if (touches.length) used.proactive_touches++;
    if (typeof m.contacted_ever === "boolean") used.contacted_ever++;
    if (active !== null) used.last_active++;
    const opted = optInValue(m.opted_in);
    if (opted !== "unknown") used.opted_in++;
    const d = (t: number) => isoDay(t);
    let segment: Segment, reason: string;
    const noConversationData = initiated === null && inbound === null && !touches.length && typeof m.contacted_ever !== "boolean";
    if (initiated !== null && initiated >= 2) { segment = "regular"; reason = `started ${initiated} conversations in the last 90 days`; }
    else if (initiated === 1) { segment = "occasional"; reason = "started 1 conversation in the last 90 days"; }
    else if (within90(inbound)) {
      if (initiated === 0) { segment = "nudge_only"; reason = `replied on ${d(inbound!)} but started no conversations in 90 days`; }
      else {
        const prompted = past.some((t) => t <= inbound! && inbound! - t <= 7 * DAY_MS);
        segment = prompted ? "nudge_only" : "occasional";
        reason = prompted ? `last reply (${d(inbound!)}) came within 7 days of a proactive touch` : `replied on ${d(inbound!)} with no touch in the week before (conversation counts not given)`;
      }
    } else if (contacted) { segment = "dark"; reason = inbound !== null ? `contacted, but no reply since ${d(inbound)} (over 90 days)` : "contacted, but no reply on record"; }
    else if (m.contacted_ever === false) { segment = "never_contacted"; reason = "never contacted and no conversation on record"; }
    else if (noConversationData && active !== null) {
      used.activity_only++;
      if (within90(active)) { segment = "occasional"; reason = `active on ${d(active)}; no conversation data, so treated as occasional (activity-based)`; }
      else { segment = "dark"; reason = `no activity since ${d(active)} (over 90 days; activity-based)`; }
    } else { segment = "unknown"; reason = noConversationData ? "never active and no contact history: confirm whether they were ever contacted" : "not enough data to tell"; }

    let eligible_now = true, next_eligible: string | null = today;
    if (opted === "no") { eligible_now = false; next_eligible = null; reason += "; opted out: no proactive touches"; }
    else if (queued.length) { eligible_now = false; next_eligible = isoDay(nextAllowed([queued[0]], spacing, gap)!); reason += `; a touch is already queued for ${d(queued[0])}`; }
    else {
      const next = nextAllowed(past, spacing, gap);
      if (next !== null && next > now) { eligible_now = false; next_eligible = isoDay(next); reason += `; touched on ${d(Math.max(...past))}, so not before ${isoDay(next)}`; }
    }
    if (opted === "unknown" && eligible_now) reason += "; opt-in unknown: check before messaging";
    return { id, segment, eligible_now, next_eligible, reason };
  });
  out.sort((a, b) => SEGMENTS.indexOf(a.segment) - SEGMENTS.indexOf(b.segment) || cmp(a.id, b.id));
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s, out.filter((o) => o.segment === s).length])) as Record<Segment, number>;
  const eligibleBySegment = Object.fromEntries(SEGMENTS.map((s) => [s, out.filter((o) => o.segment === s && o.eligible_now).length])) as Record<Segment, number>;
  const warnings: string[] = [];
  if (badDates) warnings.push(`${badDates} date value(s) could not be read and were ignored (use YYYY-MM-DD or ISO date-times).`);
  if (used.activity_only) warnings.push(`${used.activity_only} member(s) were segmented on last_active only (no replies, conversation counts or touches): treat those segments as rough.`);
  const n = input.members.length;
  if (n && !used.initiated_90d && !used.last_inbound) warnings.push("No conversation data (initiated_90d, last_inbound): regular vs occasional vs nudge-only cannot be told apart.");
  return {
    today, counts, eligible_now: out.filter((o) => o.eligible_now).length, eligible_by_segment: eligibleBySegment, members: out,
    recommended_touch: RECOMMENDED_TOUCH, rules: SEGMENT_RULES,
    spacing: { spacing_days: spacing, min_gap_hours: gap, rule: `no proactive touch within ${spacing} days of the last one (inclusive) and none within ${gap} hours` },
    data_used: { members: n, ...used }, warnings,
  };
}
export type SegmentOutput = ReturnType<typeof segmentMembers>;
