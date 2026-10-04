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

const textOf = (o: ReturnType<typeof planWeek>) => o.items.map((i) => [i.title, i.why_now, i.suggested_prompt, ...i.people].join(" | ")).join("\n");

describe("who opted out (review finding 3a)", () => {
  const row = (notes: string) => ({ intro_id: "r1", requester: "Odalys Fenwick", target: "Saoirse Delacroix-Burke", status: "withdrawn", notes });
  const out = (notes: string) => { const o = planWeek({ ...base, ledger: [row(notes)], new_members: [{ name: "Odalys Fenwick", joined: "2026-09-20" }, { name: "Saoirse Delacroix-Burke", joined: "2026-09-21" }] }); return o.items.find((i) => i.kind === "welcomes")?.people ?? []; };
  it("marks the requester when the note names the requester", () => {
    expect(out("Odalys asked us to stop messaging her; opted out")).toEqual(["Saoirse Delacroix-Burke"]);
    expect(out("Requester opted out")).toEqual(["Saoirse Delacroix-Burke"]);
  });
  it("marks the target when the note names the target", () => {
    expect(out("Saoirse said do not contact again")).toEqual(["Odalys Fenwick"]);
    expect(out("Target unsubscribed")).toEqual(["Odalys Fenwick"]);
  });
  it("holds both people when the note doesn't say who", () => {
    const o = planWeek({ ...base, ledger: [row("DNC")], new_members: [{ name: "Odalys Fenwick", joined: "2026-09-20" }, { name: "Saoirse Delacroix-Burke", joined: "2026-09-21" }] });
    expect(o.items.find((i) => i.kind === "welcomes")).toBeUndefined();
    expect(o.held.filter((h) => h.type === "touch").map((h) => h.reason)).toEqual([expect.stringMatching(/doesn't say who/), expect.stringMatching(/doesn't say who/)]);
  });
});

describe("opt-out and removal phrasing (review finding 3b)", () => {
  const plan = (notes: string) => planWeek({ ...base, ledger: [{ intro_id: "r1", requester: "Ann Lee", target: "Bo Chan", status: "asked", asked_on: "2026-10-01", notes }], new_members: [{ name: "Bo Chan", joined: "2026-09-25" }] });
  const optedOut = (notes: string) => plan(notes).stats.opted_out > 0;
  it("recognises opt-outs of messages", () => {
    for (const n of ["Bo opted out", "Bo opted-out on 3 Oct", "Bo: opt out", "unsubscribe Bo", "Bo unsubscribed", "DNC", "Bo: do not contact", "Bo asked: don’t contact me",
      "Bo asked to delete my data", "Bo wants to be forgotten", "right to be forgotten (Bo)", "Bo asked to be removed from intros", "Bo withdrew consent", "no more intros for Bo"]) {
      expect(optedOut(n), n).toBe(true);
      expect(kinds(plan(n))[0], n).toBe("removal_requests");
    }
  });
  it("treats a removal of information as a removal request, not an opt-out", () => {
    for (const n of ["2026-09-30 removal request: project details, do not use", "Bo asked for the fundraising story to be forgotten", "forget what Bo said about the merger", "Bo: please delete the notes about her startup"]) {
      expect(kinds(plan(n))[0], n).toBe("removal_requests");
      expect(optedOut(n), n).toBe(false);
    }
    expect(kinds(plan("2026-09-30 removal request: project details, do not use; honoured 2026-10-01"))).not.toContain("removal_requests");
  });
  it("does not read ordinary notes as opt-outs", () => {
    for (const n of ["Both said yes; requester did not send the first message", "Declined: no capacity this quarter", "No reply after 4 days; lapse notice sent", "Morning-after follow-up unanswered", "Queued, not yet sent"]) {
      expect(optedOut(n), n).toBe(false);
      expect(kinds(plan(n)), n).not.toContain("removal_requests");
    }
  });
});

describe("one identity across inputs (review finding 3c)", () => {
  it("an opt-out given under a member_id holds the same person named in the ledger", () => {
    const o = planWeek({ ...base, ledger: [{ intro_id: "x", requester: "Kasper Olufsen", target: "Priya Nandakumar", status: "asked", asked_on: "2026-09-20" }],
      segments: [{ id: "m_kasper0001", name: "Kasper Olufsen", segment: "dark", opted_in: "no" }] });
    expect(o.items.find((i) => i.kind === "lapse_notices")).toBeUndefined();
    expect(o.held).toEqual(expect.arrayContaining([expect.objectContaining({ person: "Kasper Olufsen", reason: "opted out (segments)", intro_ids: ["x"] })]));
  });
  it("a touch already planned under a member_id spaces the welcome planned by name", () => {
    const o = planWeek({ ...base, new_members: [{ id: "m_kasper0001", name: "Kasper Olufsen", joined: "2026-09-20" }, { name: "Ulrich Amadi", joined: "2026-09-29" }],
      planned_touches: [{ person: "m_kasper0001", date: "2026-10-01" }] });
    expect(o.items.find((i) => i.kind === "welcomes")?.people).toEqual(["Ulrich Amadi"]);
    expect(o.spacing_conflicts).toEqual([expect.objectContaining({ person: "Kasper Olufsen", moved: "welcomes" })]);
  });
  it("accepts opted_in on new members, event invitees and planned touches", () => {
    const o = planWeek({ ...base,
      new_members: [{ name: "Hyacinth Rowntree", joined: "2026-09-25", opted_in: false }, { name: "Ulrich Amadi", joined: "2026-09-29" }],
      events: [{ name: "Dinner", starts_at: "2026-10-13", invitations_sent: false, people: ["Ulrich Amadi", { name: "Jasper Nkemelu", opted_in: "unsubscribed" }, "Hyacinth Rowntree", { id: "m_marisol01", name: "Marisol Quentin-Vale" }] }],
      planned_touches: [{ person: "Priya Nandakumar", date: "2026-09-01", opted_in: "no" }],
      segments: [{ id: "Priya Nandakumar", segment: "dark" }] });
    const all = textOf(o);
    for (const p of ["Hyacinth", "Jasper", "Priya"]) expect(all, p).not.toContain(p);
    expect(o.stats.opted_out).toBe(3);
    expect(o.items.find((i) => i.kind === "event_invitations")?.people).toEqual(["Ulrich Amadi", "Marisol Quentin-Vale"]);
  });
});

describe("item text written after the spacing and opt-out check (review finding 3d)", () => {
  it("invitation and welcome prompts name only the people still in them", () => {
    const o = planWeek({ ...base,
      ledger: [{ intro_id: "o", requester: "Wendell", target: "Hyacinth", status: "withdrawn", notes: "Target asked to be removed; opt-out honoured" }],
      events: [{ name: "Dinner", starts_at: "2026-10-13", invitations_sent: false, people: ["Evander", "Hyacinth", "Isidore"] }],
      new_members: [{ name: "Isidore", joined: "2026-09-11" }, { name: "Kasper", joined: "2026-09-20" }] });
    const inv = o.items.find((i) => i.kind === "event_invitations")!;
    expect(inv.title).toBe("Send the Dinner invitations (2 invitees)");
    expect(inv.suggested_prompt).toBe("Draft personal invitations to Dinner on Tue 13 Oct for: Evander, Isidore");
    const wel = o.items.find((i) => i.kind === "welcomes")!;
    expect([wel.title, wel.why_now, wel.suggested_prompt].join(" ")).not.toContain("Isidore");
    expect(wel.suggested_prompt).toMatch(/for: Kasper$/);
    expect(textOf(o)).not.toContain("Hyacinth");
  });
  it("consent asks and checks list only the intros and people still due this week", () => {
    const o = planWeek({ ...base,
      ledger: [
        { intro_id: "p1", requester: "Raphael", target: "Henrietta", status: "proposed", created: "2026-09-10" },
        { intro_id: "p2", requester: "Anselm", target: "Theodric", status: "proposed", created: "2026-09-20" },
        { intro_id: "c1", requester: "Evander", target: "Zuleikha", status: "accepted", answered_on: "2026-08-06" },
        { intro_id: "c2", requester: "Esme", target: "Beatrix", status: "connected", connected_on: "2026-07-16", outcome: "unknown" },
      ],
      planned_touches: [{ person: "Theodric", date: "2026-10-01" }, { person: "Evander", date: "2026-09-30" }, { person: "Zuleikha", date: "2026-09-30" }, { person: "Esme", date: "2026-10-01" }] });
    const asks = o.items.find((i) => i.kind === "unsent_asks")!;
    expect(asks).toMatchObject({ people: ["Henrietta"], intro_ids: ["p1"], suggested_prompt: "Draft the consent asks for my proposed intros (Raphael → Henrietta), or tell me which to drop" });
    const checks = o.items.find((i) => i.kind === "checks_due")!;
    expect(checks).toMatchObject({ people: ["Beatrix"], intro_ids: ["c2"] });
    expect(checks.suggested_prompt).toBe("Draft the follow-through and outcome checks that are due (c2), for: Beatrix");
    expect(o.held.filter((h) => h.intro_ids?.includes("c1")).map((h) => h.person).sort()).toEqual(["Evander", "Zuleikha"]);
  });
  it("never asks on behalf of a requester who opted out", () => {
    const o = planWeek({ ...base, ledger: [{ intro_id: "p1", requester: "Raphael", target: "Henrietta", status: "proposed", created: "2026-09-10" }], segments: [{ id: "Raphael", segment: "dark", opted_in: "no" }] });
    expect(o.items.find((i) => i.kind === "unsent_asks")).toBeUndefined();
    expect(o.held).toEqual(expect.arrayContaining([expect.objectContaining({ item: "consent ask for intro p1", reason: expect.stringMatching(/requester opted out/) })]));
  });
});
