/** plan_week: priorities, due rules, events, welcomes, report timing, spacing and opt-outs. */
import { describe, expect, it } from "vitest";
import { planWeek, type PlanInput, type PlanLedgerRow, UNCLEAR_OPT_OUT } from "../src/tools/plan.js";
import { summarisePlan } from "../src/tools/summaries.js";
import { nameKey } from "../src/text/normalise.js";

const base: PlanInput = { today: "2026-10-02" };
const kinds = (o: ReturnType<typeof planWeek>) => o.items.map((i) => i.kind);

describe("due items", () => {
  const ledger: PlanLedgerRow[] = [
    { intro_id: "1", requester: "Reshma", target: "Clem", status: "asked", asked_on: "2026-09-16", next_check: "2026-09-19" },
    { intro_id: "2", requester: "Odalys", target: "Saoirse", status: "asked", asked_on: "2026-10-01" },
    { intro_id: "3", requester: "Evander", target: "Zuleikha", status: "accepted", answered_on: "2026-08-06", next_check: "2026-09-03" },
    { intro_id: "4", requester: "Esme", target: "Beatrix", status: "connected", connected_on: "2026-07-16", outcome: "unknown", next_check: "2026-09-22" },
    { intro_id: "5", requester: "Leo", target: "Des", status: "connected", connected_on: "2026-09-01", outcome: "ok" },
    { intro_id: "6", requester: "Raphael", target: "Henrietta", status: "proposed", created: "2026-09-10", next_check: "2026-09-14" },
    { intro_id: "7", requester: "Wendell", target: "Hyacinth", status: "withdrawn", notes: "Target asked to be removed; opt-out honoured", opted_out: "target", removal_request: "none" },
  ];
  const o = planWeek({ ...base, ledger });
  it("lists overdue answers, checks and unsent asks in priority order", () => {
    expect(kinds(o)).toEqual(["lapse_notices", "checks_due", "unsent_asks", "impact_report"]);
    expect(o.items[0]).toMatchObject({ people: ["Reshma"], intro_ids: ["1"] });
    expect(o.items[1].intro_ids).toEqual(["3", "4"]);
    expect(o.items[2].people).toEqual(["Henrietta"]);
    for (const it of o.items) { expect(it.why_now.length).toBeGreaterThan(20); expect(it.suggested_prompt.length).toBeGreaterThan(10); }
  });
  it("records opt-outs and never plans a touch for them", () => {
    expect(o.stats.opted_out).toBe(1);
    expect(o.needs_review).toEqual([]);
    expect(o.items.flatMap((i) => i.people)).not.toContain("Hyacinth");
  });
  it("without the caller's fields the same note holds both people and asks the manager who it refers to", () => {
    const raw = planWeek({ ...base, ledger: ledger.map((r) => (r.intro_id === "7" ? { ...r, opted_out: undefined, removal_request: undefined } : r)) });
    expect(kinds(raw)[0]).toBe("removal_requests");
    expect(raw.items[0].title).toBe("Action 1 removal or opt-out request (1 need you to confirm who they refer to)");
    expect(raw.stats).toMatchObject({ opted_out: 2, needs_review: 1 });
    expect(raw.needs_review).toEqual([expect.objectContaining({ row: 6, intro_id: "7", requester: "Wendell", target: "Hyacinth", needs_review: true })]);
    expect(raw.needs_review[0].signals).toEqual(expect.arrayContaining(["asked_removed", "opt_out"]));
  });
  it("puts an unactioned removal request first", () => {
    const r = planWeek({ ...base, ledger: [{ intro_id: "9", requester: "A", target: "B", status: "asked", asked_on: "2026-09-01", notes: "B asked to be removed from intro requests", opted_out: "target" }] });
    expect(kinds(r)[0]).toBe("removal_requests");
    expect(r.items[0].title).toBe("Action 1 removal or opt-out request");
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
    expect(() => planWeek({ ...base, ledger: [{ requester: "A", target: "B", opted_out: "yes" }] })).toThrow(/ledger\[0\]\.opted_out must be requester, target, both or none/);
    expect(() => planWeek({ ...base, ledger: [{ requester: "A", target: "B", removal_request: "target " }] })).not.toThrow();
  });
});

const textOf = (o: ReturnType<typeof planWeek>) => o.items.map((i) => [i.title, i.why_now, i.suggested_prompt, ...i.people].join(" | ")).join("\n");

describe("who opted out: the caller's fields decide; otherwise both people are held, never guessed from names (round-3 1 and 2)", () => {
  const plan = (requester: string, target: string, row: Partial<PlanLedgerRow>) =>
    planWeek({ ...base, ledger: [{ intro_id: "r1", requester, target, status: "withdrawn", ...row }], new_members: [{ name: requester, joined: "2026-09-20" }, { name: target, joined: "2026-09-21" }] });
  const welcomed = (requester: string, target: string, row: Partial<PlanLedgerRow>) => plan(requester, target, row).items.find((i) => i.kind === "welcomes")?.people ?? [];
  const R = "Odalys Fenwick", T = "Saoirse Delacroix-Burke";
  const out = (notes: string, row: Partial<PlanLedgerRow> = {}) => welcomed(R, T, { notes, ...row });
  it("holds exactly the side the caller names, whatever the note says", () => {
    expect(out("Requester opted out", { opted_out: "requester" })).toEqual([T]);
    expect(out("Target unsubscribed", { opted_out: "target" })).toEqual([R]);
    expect(out("Delacroix-Burke said don't contact again", { opted_out: "target" })).toEqual([R]);
    expect(out("DNC", { opted_out: "both" })).toEqual([]);
    expect(out("Both said yes", { opted_out: "none" })).toEqual([R, T]);
    expect(out("Odalys Fenwick opted out of the newsletter only; intros welcome", { opted_out: "none", removal_request: "none" })).toEqual([R, T]);
    const o = plan(R, T, { notes: "Target unsubscribed", opted_out: "target" });
    expect(o.needs_review).toEqual([]);
    expect(o.held.find((h) => h.type === "touch")).toMatchObject({ person: T, reason: "opted out (ledger r1)" });
  });
  it("holds both people and flags the row whenever the note has a signal and the caller did not say who (the review's cases)", () => {
    const cases: [string, string, string][] = [
      [R, T, "O'Brien asked us to stop messaging; told Fenwick"], // apostrophes
      ["Minh Do", "Ann Park", "Do not contact"], // a two-letter surname that is an ordinary word
      [R, T, "Saoirse Delacroix-Burke opted out; requester informed"], // a role word next to a name
      [R, T, "李明 opted out; told Burke"], // a non-Latin name
      [R, T, "Requester opted out"], [R, T, "Fenwick: do not contact again"], [R, T, "Delacroix-Burke said don't contact again"], [R, T, "Burke opted out"],
      [R, T, "Target unsubscribed"], [R, T, "Introducee opted out"], [R, T, "DNC"], [R, T, "Odalys asked us to stop messaging her; opted out"],
      ["June Ellis", "Bo Chan", "Opted out 3 June"], ["Will Hart", "Bo Chan", "Opted out; will not take intros"], ["Don Ellis", "Bo Chan", "Bo Chan said don't contact her again"],
      ["Bo", "Ann Park", "Bo opted out"],
    ];
    for (const [req, tgt, notes] of cases) {
      expect(welcomed(req, tgt, { notes }), notes).toEqual([]);
      const o = plan(req, tgt, { notes });
      expect(o.stats, notes).toMatchObject({ opted_out: 2, needs_review: 1 });
      expect(o.needs_review, notes).toEqual([expect.objectContaining({ row: 0, intro_id: "r1", requester: req, target: tgt, needs_review: true })]);
      expect(o.needs_review[0].signals.length, notes).toBeGreaterThan(0);
      expect(JSON.stringify(o.needs_review), notes).not.toContain("told"); // rule ids only, never the note
      expect(kinds(o)[0], notes).toBe("removal_requests");
      for (const h of o.held.filter((x) => x.type === "touch")) expect(h.reason, notes).toBe(`${UNCLEAR_OPT_OUT} (ledger r1; both people are held until you do)`);
    }
  });
  it("says why in the text summary and lists the row to confirm", () => {
    const o = plan(R, T, { notes: "Fenwick told Saoirse she had opted out" });
    const text = summarisePlan(o);
    expect(text).toContain(`Held, ${UNCLEAR_OPT_OUT}: ${R}, ${T}.`);
    expect(text).toContain(`Ledger rows to confirm (the note records an opt-out or removal request but not who it refers to; both people are held): r1 (${R} → ${T})`);
    expect(text).not.toMatch(/Not contacted \(opted out\)/);
    expect(o.items[0].why_now).toBe("Removal and opt-out requests are honoured immediately. One note does not say which person opted out, so both people in that intro are held until you confirm.");
    expect(o.items[0].suggested_prompt).toBe("Action the removal and opt-out requests in my ledger (r1) and tell me who the opt-out note on r1 refers to, and note them");
  });
  it("a row with no intro_id is named by its position", () => {
    const o = planWeek({ ...base, ledger: [{ requester: "A B", target: "C D", status: "asked", asked_on: "2026-09-01" }, { requester: "E F", target: "G H", status: "withdrawn", notes: "DNC" }] });
    expect(o.needs_review[0]).toMatchObject({ row: 1, intro_id: null });
    expect(summarisePlan(o)).toContain("row 2 (E F → G H)");
  });
});

describe("opt-out and removal phrasing (round-3 3)", () => {
  const plan = (notes: string, row: Partial<PlanLedgerRow> = {}) => planWeek({ ...base, ledger: [{ intro_id: "r1", requester: "Ann Lee", target: "Bo Chan", status: "asked", asked_on: "2026-10-01", notes, ...row }], new_members: [{ name: "Bo Chan", joined: "2026-09-25" }] });
  const heldBoth = (notes: string) => plan(notes).stats.opted_out === 2 && plan(notes).needs_review.length === 1;
  const nothing = (notes: string) => { const o = plan(notes); return o.stats.opted_out === 0 && o.needs_review.length === 0 && !kinds(o).includes("removal_requests"); };
  it("recognises opt-outs of messages: both people are held and the row is listed", () => {
    for (const n of ["Bo opted out", "Bo opted-out on 3 Oct", "Bo: opt out", "unsubscribe Bo", "Bo unsubscribed", "DNC", "Bo: do not contact", "Bo asked: don’t contact me",
      "Bo asked to delete my data", "Bo wants to be forgotten", "right to be forgotten (Bo)", "Bo asked to be removed from intros", "Bo withdrew consent", "no more intros for Bo",
      "No longer interested — DNC", "Never again — DNC", "Not a fit (DNC)", "No reply and unsubscribed", "doesn't want to be contacted", "Bo does not want to be contacted",
      "stop messaging", "stop contacting her", "no more messages", "remove me", "delete my details", "delete my information", "forget me", "GDPR erasure request", "GDPR removal"]) {
      expect(heldBoth(n), n).toBe(true);
      expect(kinds(plan(n))[0], n).toBe("removal_requests");
    }
  });
  it("treats removal-of-information wording the same way when the caller has not said who", () => {
    for (const n of ["2026-09-30 removal request: project details, do not use", "Bo asked for the fundraising story to be forgotten", "forget what Bo said about the merger",
      "Bo: please delete the notes about her startup", "erase the project details", "redact the fundraising figures", "Bo asked us to delete her notes"]) {
      expect(heldBoth(n), n).toBe(true);
      expect(kinds(plan(n))[0], n).toBe("removal_requests");
    }
  });
  it("with the caller's fields, a removal of information is a removal item and not an opt-out", () => {
    const o = plan("2026-09-30 removal request: project details, do not use", { removal_request: "target", opted_out: "none" });
    expect(kinds(o)[0]).toBe("removal_requests");
    expect(o.items[0].title).toBe("Action 1 removal or opt-out request");
    expect(o.stats).toMatchObject({ opted_out: 0, needs_review: 0 });
    expect(o.held.filter((h) => h.type === "touch" && /opt/.test(h.reason))).toEqual([]); // Bo's welcome moves for spacing (asked yesterday), never for an opt-out
    expect(kinds(plan("2026-09-30 removal request: project details, do not use; honoured 2026-10-01", { removal_request: "target", opted_out: "none" }))).not.toContain("removal_requests");
    const done = plan("Target asked to be removed; opt-out honoured", { opted_out: "target" });
    expect(kinds(done)).not.toContain("removal_requests");
    expect(done.stats.opted_out).toBe(1);
    // "none" on both is authoritative even over clear wording
    expect(nothing("Bo opted out") || plan("Bo opted out", { opted_out: "none", removal_request: "none" }).stats.opted_out === 0).toBe(true);
  });
  it("a negation cancels only the phrase it directly precedes, for the listed forms", () => {
    for (const n of ["Don't forget her for the dinner", "Do not forget to send the deck", "Bo did not opt out", "Bo never unsubscribed", "Bo hasn't opted out yet", "Bo has not unsubscribed",
      "No longer opted out; happy to hear from us", "Bo did not opt out and is keen"]) expect(nothing(n), n).toBe(true);
  });
  it("negation anywhere else never hides a signal (a false positive holds both; a miss is not acceptable)", () => {
    for (const n of ["Don't email her again: she opted out", "Please do not remove her from the list", "No reply - DNC", "Not now, but then unsubscribed", "Not keen; stop messaging",
      "Never mind the dinner, DNC"]) expect(heldBoth(n), n).toBe(true);
  });
  it("does not read ordinary notes as opt-outs", () => {
    for (const n of ["Both said yes; requester did not send the first message", "Declined: no capacity this quarter", "No reply after 4 days; lapse notice sent", "Morning-after follow-up unanswered",
      "Queued, not yet sent", "No contact details on file yet", "Forgot to send the deck", "She took notes at the dinner", "Dropped me a message afterwards", "Will take the intro in October",
      "Remove the duplicate record in HubSpot"]) expect(nothing(n), n).toBe(true);
  });
});

describe("one identity across inputs (review finding 3c)", () => {
  it("an opt-out given under a member_id holds the same person named in the ledger", () => {
    const o = planWeek({ ...base, ledger: [{ intro_id: "x", requester: "Kasper Olufsen", target: "Priya Nandakumar", status: "asked", asked_on: "2026-09-20" }],
      segments: [{ id: "m_kasper0001", name: "Kasper Olufsen", segment: "dark", opted_in: "no" }] });
    expect(o.items.find((i) => i.kind === "lapse_notices")).toBeUndefined();
    expect(o.held).toEqual(expect.arrayContaining([expect.objectContaining({ person: "Kasper Olufsen", reason: "opted out (segments)", intro_ids: ["x"] })]));
  });
  it("joins the same person written with and without apostrophes, and non-Latin names keep their letters (round-3 4)", () => {
    const o = planWeek({ ...base,
      ledger: [{ intro_id: "x", requester: "Niamh O'Brien", target: "李明", status: "asked", asked_on: "2026-09-20" }, { intro_id: "y", requester: "Priya Nandakumar", target: "李明", status: "asked", asked_on: "2026-09-20" }],
      segments: [{ id: "m_niamh", name: "Niamh OBrien", segment: "dark", opted_in: "no" }, { id: "m_li", name: "李明", segment: "dark", opted_in: "no" }] });
    expect(o.items.find((i) => i.kind === "lapse_notices")?.people).toEqual(["Priya Nandakumar"]);
    expect(o.held.filter((h) => h.type === "touch").map((h) => nameKey(h.person ?? ""))).toEqual(["niamh obrien"]);
    expect(o.stats.opted_out).toBe(2);
    // two different non-Latin names are two people, never one empty key
    const two = planWeek({ ...base, new_members: [{ name: "李明", joined: "2026-09-25" }, { name: "王芳", joined: "2026-09-26" }, { name: "☺", joined: "2026-09-27" }], planned_touches: [{ person: "王芳", date: "2026-10-01" }] });
    expect(two.items.find((i) => i.kind === "welcomes")?.people).toEqual(["李明", "☺"]);
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
      ledger: [{ intro_id: "o", requester: "Wendell", target: "Hyacinth", status: "withdrawn", notes: "Target asked to be removed; opt-out honoured", opted_out: "target" }],
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
  it("never asks on behalf of a requester who opted out, or may have", () => {
    const o = planWeek({ ...base, ledger: [{ intro_id: "p1", requester: "Raphael", target: "Henrietta", status: "proposed", created: "2026-09-10" }], segments: [{ id: "Raphael", segment: "dark", opted_in: "no" }] });
    expect(o.items.find((i) => i.kind === "unsent_asks")).toBeUndefined();
    expect(o.held).toEqual(expect.arrayContaining([expect.objectContaining({ item: "consent ask for intro p1", reason: expect.stringMatching(/requester opted out/) })]));
    const unclear = planWeek({ ...base, ledger: [{ intro_id: "p1", requester: "Raphael", target: "Henrietta", status: "proposed", created: "2026-09-10", notes: "DNC" }] });
    expect(unclear.items.find((i) => i.kind === "unsent_asks")).toBeUndefined();
    expect(unclear.held).toEqual(expect.arrayContaining([expect.objectContaining({ item: "consent ask for intro p1", reason: expect.stringMatching(/does not say who it refers to: confirm before asking/) })]));
  });
});

describe("scale (round-2 2)", () => {
  it("5,000 accepted intros noted DNC (10,000 people held, 5,000 rows to confirm) plan in well under 1 s", () => {
    const ledger = Array.from({ length: 5000 }, (_v, i) => ({ intro_id: `i${i}`, requester: `Asker${i} Person`, target: `Target${i} Person`, status: "accepted", answered_on: "2026-08-01", notes: "DNC" }));
    const t0 = performance.now();
    const o = planWeek({ ...base, ledger });
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(o.stats).toMatchObject({ opted_out: 10000, needs_review: 5000 });
    expect(o.items.find((i) => i.kind === "checks_due")).toBeUndefined();
    expect(o.held.filter((h) => h.type === "touch")).toHaveLength(10000);
    expect(o.held.find((h) => h.person === "Target4999 Person")?.intro_ids).toEqual(["i4999"]);
    expect(summarisePlan(o)).toMatch(/… 4980 more in the structured result/);
  });
});

describe("two invite-only events (round-2 6)", () => {
  it("names the event that kept the slot, not the other one", () => {
    const o = planWeek({ ...base, events: [
      { name: "Alpha Supper", starts_at: "2026-10-09", invitations_sent: false, people: ["Priya", "Kasper"] },
      { name: "Beta Breakfast", starts_at: "2026-10-12", invitations_sent: false, people: ["Priya"] },
    ] });
    expect(o.spacing_conflicts).toEqual([expect.objectContaining({ person: "Priya", kept: "event_invitations", moved: "event_invitations" })]);
    expect(o.spacing_conflicts[0].resolution).toMatch(/^kept Send the Alpha Supper invitations \(2 invitees\); this touch would land after 2026-10-09/);
    expect(o.held.find((h) => h.type === "item")?.item).toBe("Send the Beta Breakfast invitations (1 invitee)");
  });
});
