/** compute_impact_metrics unit tests. */
import { describe, expect, it } from "vitest";
import { computeImpactMetrics } from "../src/tools/impact.js";

const period = { start: "2026-07-01", end: "2026-09-30" };
const rows = [
  { created: "2026-07-01", source: "request", status: "connected", asked_on: "2026-07-01", outcome: "super valuable", rating: 5 },
  { created: "2026-07-02", source: "event", status: "accepted", asked_on: "2026-07-02", outcome: "didn't connect" },
  { created: "2026-08-03", source: "request", status: "lapsed", asked_on: "2026-08-03" },
  { created: "2026-08-04", source: "request", status: "declined", asked_on: "2026-08-04" },
  { created: "2026-09-05", source: "event", status: "proposed" },
  { created: "2026-09-06", source: "request", status: "connected", connected_on: "2026-09-08", outcome: "ok", rating: "4" },
  { created: "2026-10-01", source: "request", status: "connected" },
  { created: "", source: "request", status: "asked" },
];

describe("compute_impact_metrics", () => {
  const o = computeImpactMetrics({ period, ledger: rows });
  it("counts the funnel and rates with exact numerators and denominators", () => {
    expect(o.rows_in_period).toBe(6);
    expect(o.rows_outside_period).toBe(1);
    expect(o.totals).toMatchObject({ requests: 6, asked: 5, accepted: 3, connected: 2, lapsed: 1, declined: 1, proposed: 1 });
    expect(o.totals.conversation_rate).toEqual({ pct: 33.3, num: 2, den: 6 });
    expect(o.totals.acceptance_rate).toEqual({ pct: 60, num: 3, den: 5 });
    expect(o.totals.lapse_rate).toEqual({ pct: 20, num: 1, den: 5 });
  });
  it("reports outcome mix, coverage and the average rating with n", () => {
    expect(o.outcomes.mix).toEqual({ "super valuable": 1, ok: 1, "didn't connect": 1, unknown: 0, blank: 3 });
    expect(o.outcomes.coverage).toEqual({ pct: 50, num: 3, den: 6 });
    expect(o.rating).toMatchObject({ average: 4.5, n: 2 });
  });
  it("breaks down by source and month", () => {
    expect(Object.keys(o.by_month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(o.by_source.event).toMatchObject({ requests: 2, accepted: 1, connected: 0 });
  });
  it("adds event totals and activation when given", () => {
    const e = computeImpactMetrics({ period, ledger: [], events: [{ date: "2026-09-10", registered: 40, attended: 28, pairs_made: 14, pairs_met: 5 }, { date: "2026-12-01", registered: 99 }],
      new_members: [{ joined: "2026-07-01", first_active: "2026-07-20" }, { joined: "2026-08-01" }, { joined: "2026-09-25" }, { joined: "2026-06-01", first_active: "2026-06-02" }] });
    expect(e.events).toMatchObject({ events: 1, registered: 40, attended: 28, attendance_rate: { pct: 70, num: 28, den: 40 }, pairs_met_rate: { pct: 35.7, num: 5, den: 14 }, left_out: 1 });
    expect(e.activation).toMatchObject({ joined: 3, active_within_30d: 1, window_still_open: 1, rate: { pct: 33.3, num: 1, den: 3 } });
  });
  it("warns about unreadable rows and rejects a bad period", () => {
    expect(o.warnings.join(" ")).toMatch(/1 ledger row/);
    expect(() => computeImpactMetrics({ period: { start: "2026-09-01", end: "2026-08-01" }, ledger: [] })).toThrow(/before period.start/);
    expect(() => computeImpactMetrics({ period: { start: "nope", end: "2026-08-01" }, ledger: [] })).toThrow(/period.start 'nope'/);
  });
});
