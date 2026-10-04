/** plan_week: priorities, due rules, events, welcomes, report timing, spacing and opt-outs. */
import { describe, expect, it } from "vitest";
import { planWeek, type PlanInput } from "../src/tools/plan.js";

const base: PlanInput = { today: "2026-10-02" };
const kinds = (o: ReturnType<typeof planWeek>) => o.items.map((i) => i.kind);

describe("due items", () => {
  const o = planWeek({ ...base, ledger: [
    { intro_id: "1", requester: "Reshma", target: "Clem", status: "asked", asked_on: "2026-09-16", next_check: "2026-09-19" },
    { intro_id: "2", requester: "Odalys", target: "Saoirse", status: "asked", asked_on: "2026-10-01" },
    { intro_id: "3", requester: "Evander", target: "Zuleikha", status: "accepted", answered_on: "2026-08-06", next_check: "2026-09-03" },
    { intro_id: "4", requester: "Esme", target: "Beatrix", status: "connected", connected_on: "2026-07-16", outcome: "unknown", next_check: "2026-09-22" },
    { intro_id: "5", requester: "Leo", target: "Des", status: "connected", connected_on: "2026-09-01", outcome: "ok" },
    { intro_id: "6", requester: "Raphael", target: "Henrietta", status: "proposed", created: "2026-09-10", next_check: "2026-09-14" },
    { intro_id: "7", requester: "Wendell", target: "Hyacinth", status: "withdrawn", notes: "Target asked to be removed; opt-out honoured" },
  ] });
  it("lists overdue answers, checks and unsent asks in priority order", () => {
    expect(kinds(o)).toEqual(["lapse_notices", "checks_due", "unsent_asks", "impact_report"]);
    expect(o.items[0]).toMatchObject({ people: ["Reshma"], intro_ids: ["1"] });
    expect(o.items[1].intro_ids).toEqual(["3", "4"]);
    expect(o.items[2].people).toEqual(["Henrietta"]);
    for (const it of o.items) { expect(it.why_now.length).toBeGreaterThan(20); expect(it.suggested_prompt.length).toBeGreaterThan(10); }
  });
  it("records opt-outs and never plans a touch for them", () => {
    expect(o.stats.opted_out).toBe(1);
    expect(o.items.flatMap((i) => i.people)).not.toContain("Hyacinth");
  });
  it("puts an unactioned removal request first", () => {
    const r = planWeek({ ...base, ledger: [{ intro_id: "9", requester: "A", target: "B", status: "asked", asked_on: "2026-09-01", notes: "B asked to be removed from intro requests" }] });
    expect(kinds(r)[0]).toBe("removal_requests");
  });
});

describe("events, welcomes and reports", () => {
  it("matches events in the next 14 days (sooner first) and plans invitations", () => {
    const o = planWeek({ ...base, events: [
      { name: "Dinner", starts_at: "2026-10-13T19:00", invitations_sent: false, people: ["Priya", "Isidore"] },
      { name: "Evening", starts_at: "2026-10-08T18:30", matched: false },
      { name: "Later", starts_at: "2026-11-30" },
    ] });
    expect(o.items.map((i) => i.title)).toEqual(["Match the attendees for Evening (Thu 8 Oct)", "Send the Dinner invitations (2 invitees)", "Quarterly impact report for Q3 2026 (July to September)"]);
    expect(o.items[0].due).toBe("2026-10-07");
  });
  it("welcomes members who joined in the last 30 days and have no welcome on record", () => {
    const o = planWeek({ ...base, new_members: [{ name: "Kasper", joined: "2026-09-14" }, { name: "Old", joined: "2026-07-01" }, { name: "Done", joined: "2026-09-20", welcomed: true }],
      ledger: [{ requester: "Isidore", target: "X", source: "onboarding", status: "asked", asked_on: "2026-10-01" }] });
    expect(o.items.find((i) => i.kind === "welcomes")?.people).toEqual(["Kasper"]);
  });
  it("adds a monthly report early in a month and a quarterly one after a quarter", () => {
    expect(planWeek({ today: "2026-11-03" }).items[0].title).toBe("Monthly impact report for October 2026");
    expect(planWeek({ today: "2026-10-02" }).items[0].title).toMatch(/Q3 2026/);
    expect(planWeek({ today: "2026-10-20" }).items).toEqual([]);
  });
  it("proposes a small re-engagement batch that skips recently touched and opted-out members", () => {
    const o = planWeek({ ...base, ledger: [{ requester: "J", target: "Mathilde", status: "asked", asked_on: "2026-09-25" }], segments: [
      { id: "Mathilde", segment: "dark" }, { id: "Gwen", segment: "dark" }, { id: "Hy", segment: "dark", opted_in: "no" }, { id: "Ann", segment: "nudge_only" }, { id: "Reg", segment: "regular" },
    ], options: { reengagement_batch: 5 } });
    expect(o.items.find((i) => i.kind === "reengagement_batch")?.people).toEqual(["Gwen", "Ann"]);
  });
});

describe("spacing across the plan", () => {
  const o = planWeek({ ...base,
    ledger: [
      { intro_id: "a", requester: "Evander", target: "Zuleikha", status: "accepted", answered_on: "2026-08-06", next_check: "2026-09-03" },
      { intro_id: "b", requester: "Esme", target: "Beatrix", status: "connected", connected_on: "2026-07-16", outcome: "unknown", next_check: "2026-09-22" },
      { intro_id: "c", requester: "Esme", target: "Seraphina", status: "asked", asked_on: "2026-09-27", next_check: "2026-09-30" },
    ],
    events: [{ name: "Dinner", starts_at: "2026-10-13", invitations_sent: false, people: ["Evander", "Zuleikha", "Isidore"] }],
    new_members: [{ name: "Isidore", joined: "2026-09-11" }],
  });
  it("gives nobody two touches in the week and says what moved", () => {
    const counts = new Map<string, number>();
    for (const it of o.items) for (const p of it.people) counts.set(p, (counts.get(p) ?? 0) + 1);
    for (const [p, n] of counts) expect(n, p).toBe(1);
    expect(o.spacing_conflicts.map((c) => `${c.person}:${c.kept}>${c.moved}`).sort()).toEqual([
      "Esme:lapse_notices>checks_due", "Evander:event_invitations>checks_due", "Isidore:event_invitations>welcomes", "Zuleikha:event_invitations>checks_due",
    ]);
    expect(o.spacing_conflicts[0].to).toBe("2026-10-10");
    expect(o.held.filter((h) => h.type === "touch")).toHaveLength(4);
  });
  it("caps the plan at max_items and holds the rest", () => {
    const small = planWeek({ ...base, events: [{ name: "E1", starts_at: "2026-10-05" }, { name: "E2", starts_at: "2026-10-06" }], options: { max_items: 2 } });
    expect(small.items).toHaveLength(2);
    expect(small.held.find((h) => h.type === "item")?.reason).toMatch(/2-item limit/);
  });
  it("rejects bad input specifically", () => {
    expect(() => planWeek({ today: "x" })).toThrow(/today 'x'/);
    expect(() => planWeek({ ...base, ledger: [{ requester: "A", target: "" }] })).toThrow(/ledger\[0\]\.target is missing/);
    expect(() => planWeek({ ...base, events: [{ name: "E", starts_at: "someday" }] })).toThrow(/events\[0\]\.starts_at/);
  });
});
