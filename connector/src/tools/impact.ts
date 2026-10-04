/** compute_impact_metrics: exact counts and rates from the intro ledger (DESIGN §4.6). Numbers only, no benchmarks. */
import { cmp, daysBetween, fold, parseDate } from "../text/normalise.js";
import { InputError } from "./errors.js";

export interface LedgerRow {
  intro_id?: string | null; created?: string | null; source?: string | null; status?: string | null; asked_on?: string | null;
  answered_on?: string | null; connected_on?: string | null; outcome?: string | null; rating?: number | string | null;
}
export interface ImpactInput {
  period: { start: string; end: string };
  ledger: LedgerRow[];
  events?: { name?: string | null; date?: string | null; registered?: number | null; attended?: number | null; pairs_made?: number | null; pairs_met?: number | null }[];
  new_members?: { id?: string | null; joined?: string | null; first_active?: string | null }[];
}
export interface Rate { pct: number; num: number; den: number }

const STATUSES = ["proposed", "asked", "accepted", "declined", "lapsed", "connected", "withdrawn"] as const;
const OUTCOME_ALIASES: Record<string, "super valuable" | "ok" | "didn't connect" | "unknown"> = {
  "super valuable": "super valuable", "super-valuable": "super valuable", "super_valuable": "super valuable", "very valuable": "super valuable",
  valuable: "super valuable", ok: "ok", okay: "ok", "it was ok": "ok", fine: "ok", "didn't connect": "didn't connect", "didnt connect": "didn't connect",
  "did not connect": "didn't connect", "we didn't connect": "didn't connect", "not connected": "didn't connect", "no": "didn't connect",
  unknown: "unknown", "not yet": "unknown", "n/a": "unknown",
};
export const rate = (num: number, den: number): Rate => ({ pct: den ? Math.round((1000 * num) / den) / 10 : 0, num, den });

function tally(rows: { status: string; asked: boolean; connected: boolean; outcome: string; rating: number | null }[]) {
  const c = (s: string) => rows.filter((r) => r.status === s).length;
  const requests = rows.length, asked = rows.filter((r) => r.asked).length;
  const accepted = c("accepted") + c("connected"), connected = rows.filter((r) => r.connected).length;
  const declined = c("declined"), lapsed = c("lapsed"), withdrawn = c("withdrawn"), pending = c("asked"), proposed = c("proposed");
  return {
    requests, proposed, asked, pending, accepted, declined, lapsed, withdrawn, connected,
    conversation_rate: rate(connected, requests), acceptance_rate: rate(accepted, asked), lapse_rate: rate(lapsed, asked), decline_rate: rate(declined, asked),
  };
}

export function computeImpactMetrics(input: ImpactInput) {
  const start = parseDate(input.period.start), end = parseDate(input.period.end);
  if (!start) throw new InputError(`period.start '${input.period.start}' is not a date; use YYYY-MM-DD`);
  if (!end) throw new InputError(`period.end '${input.period.end}' is not a date; use YYYY-MM-DD`);
  if (end < start) throw new InputError(`period.end (${end}) is before period.start (${start})`);
  const inPeriod = (d: string | null) => !!d && d >= start && d <= end;
  let noCreated = 0, outside = 0, badStatus = 0, badRating = 0;
  const rows = input.ledger.flatMap((r) => {
    const created = parseDate(r.created ?? "");
    if (!created) { noCreated++; return []; }
    if (!inPeriod(created)) { outside++; return []; }
    const st = fold(String(r.status ?? "")).trim();
    const status = (STATUSES as readonly string[]).includes(st) ? st : "other";
    if (status === "other") badStatus++;
    const oc = fold(String(r.outcome ?? "")).trim().replace(/[’']/g, "'");
    const outcome = oc ? OUTCOME_ALIASES[oc] ?? "unknown" : "";
    let rating: number | null = null;
    if (r.rating !== null && r.rating !== undefined && String(r.rating).trim() !== "") {
      const x = Number(r.rating);
      if (Number.isFinite(x) && x >= 1 && x <= 5) rating = x; else badRating++;
    }
    const asked = !!parseDate(r.asked_on ?? "") || ["asked", "accepted", "declined", "lapsed", "connected", "withdrawn"].includes(status);
    const connected = (status === "connected" || !!parseDate(r.connected_on ?? "")) && outcome !== "didn't connect";
    return [{ created, month: created.slice(0, 7), source: fold(String(r.source ?? "")).trim() || "unspecified", status, asked, connected, outcome, rating }];
  });

  const totals = tally(rows);
  const mix = { "super valuable": 0, ok: 0, "didn't connect": 0, unknown: 0, blank: 0 };
  for (const r of rows) mix[(r.outcome || "blank") as keyof typeof mix]++;
  const known = mix["super valuable"] + mix.ok + mix["didn't connect"];
  const ratings = rows.map((r) => r.rating).filter((x): x is number => x !== null);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  for (const x of ratings) dist[Math.round(x)]++;
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return Object.fromEntries([...m.entries()].sort(([a], [b]) => cmp(a, b)).map(([k, rs]) => [k, tally(rs)]));
  };

  // Events
  let ev: null | Record<string, unknown> = null;
  if (input.events?.length) {
    const es = input.events.filter((e) => !e.date || inPeriod(parseDate(e.date)));
    const sum = (f: (e: (typeof es)[number]) => number | null | undefined) => es.reduce((s, e) => s + (Number(f(e)) || 0), 0);
    const reg = sum((e) => e.registered), att = sum((e) => e.attended), made = sum((e) => e.pairs_made), met = sum((e) => e.pairs_met);
    ev = { events: es.length, registered: reg, attended: att, pairs_made: made, pairs_met: met, attendance_rate: rate(att, reg), pairs_met_rate: rate(met, made),
      left_out: input.events.length - es.length };
  }
  // Activation
  let activation: null | Record<string, unknown> = null;
  if (input.new_members?.length) {
    const joinedIn = input.new_members.map((m) => ({ j: parseDate(m.joined ?? ""), f: parseDate(m.first_active ?? "") })).filter((m) => m.j && inPeriod(m.j));
    const active = joinedIn.filter((m) => m.f && daysBetween(m.j!, m.f) >= 0 && daysBetween(m.j!, m.f) <= 30).length;
    const open = joinedIn.filter((m) => !(m.f && daysBetween(m.j!, m.f) <= 30) && daysBetween(m.j!, end) < 30).length;
    activation = { joined: joinedIn.length, active_within_30d: active, rate: rate(active, joinedIn.length), window_still_open: open,
      definition: "share of members who joined in the period and were active within 30 days of joining" };
  }
  const warnings: string[] = [];
  if (noCreated) warnings.push(`${noCreated} ledger row(s) have no readable created date and were left out.`);
  if (badStatus) warnings.push(`${badStatus} row(s) have a status outside proposed/asked/accepted/declined/lapsed/connected/withdrawn (counted as requests only).`);
  if (badRating) warnings.push(`${badRating} rating(s) were not numbers from 1 to 5 and were ignored.`);
  return {
    period: { start, end },
    rows_in_period: rows.length, rows_outside_period: outside,
    totals,
    outcomes: { mix, known, coverage: rate(known, rows.length), coverage_of_accepted: rate(known, totals.accepted) },
    rating: { average: ratings.length ? Math.round((100 * ratings.reduce((s, x) => s + x, 0)) / ratings.length) / 100 : null, n: ratings.length, distribution: dist },
    by_source: group((r) => r.source),
    by_month: group((r) => r.month),
    events: ev,
    activation,
    definitions: {
      requests: "every intro logged in the period (by created date), any status",
      asked: "consent ask sent (asked_on set, or status beyond proposed)",
      accepted: "the person asked said yes (accepted or connected)",
      connected: "status connected (or connected_on set), excluding outcome 'didn't connect'",
      conversation_rate: "connected / requests", acceptance_rate: "accepted / asked", lapse_rate: "lapsed / asked", decline_rate: "declined / asked",
      outcome_coverage: "intros with a known outcome (super valuable, ok, didn't connect) / requests",
    },
    warnings,
  };
}
export type ImpactOutput = ReturnType<typeof computeImpactMetrics>;
