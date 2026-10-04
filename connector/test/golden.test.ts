/**
 * Golden tests over the synthetic eval fixtures in ../evals/fixtures (read-only). Ground truth is
 * recomputed here independently of the tool code, following DESIGN.md and evals/fixtures/verify_fixtures.py.
 */
import { describe, expect, it } from "vitest";
import { pairAttendees } from "../src/tools/pair.js";
import { mergeMemberRecords, type MergeRecord } from "../src/tools/merge.js";
import { computeImpactMetrics } from "../src/tools/impact.js";
import { detectMemberFields } from "../src/tools/detect.js";
import { planWeek } from "../src/tools/plan.js";
import { segmentMembers } from "../src/tools/segment.js";
import { eventGuests, hasFixture, md01Records, readCsv, readHeaders, readRows } from "./helpers/fixtures.js";
import { assertRules } from "./helpers/rules.js";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?<![\d.])(?:\+\d{1,3}[\s.-]?)?(?:\(0\d{2,4}\)|0\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)|\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/;

describe.runIf(hasFixture("event_guests.csv") && hasFixture("members.csv"))("pair_attendees on event_guests.csv (35 guests)", () => {
  const guests = eventGuests();
  const ledger = hasFixture("ledger.csv") ? readCsv("ledger.csv") : [];
  const names = new Set(guests.map((g) => g.id));
  const metBefore = ledger.filter((r) => r.status === "connected" && names.has(r.requester) && names.has(r.target)).map((r) => [r.requester, r.target]);
  for (const max of [3, 2]) {
    it(`no same-organisation group, cap ${max} respected, every guest placed or listed`, () => {
      const input = { event: { name: "Founders & Operators Evening", starts_at: "2026-10-08T18:30:00+01:00" }, guests, avoid_pairs: metBefore, options: { max_per_person: max } };
      const out = pairAttendees(input);
      assertRules(input, out);
      expect(guests).toHaveLength(35);
      const together = (a: string, b: string) => out.groups.some((g) => g.ids.includes(a) && g.ids.includes(b)) || out.backups[a] === b || out.backups[b] === a;
      expect(together("Priya Nandakumar", "Tobias Lindqvist")).toBe(false);
      expect(together("Ifeoma Adeyemi-Brandt", "Kasper Olufsen")).toBe(false);
      expect(out.stats.placed + out.stats.unmatched).toBe(35);
      expect(out.stats.trios).toBe(1);
    });
  }
  it("is deterministic and flags the sensitive-name organisation", () => {
    const a = pairAttendees({ guests });
    expect(JSON.stringify(pairAttendees({ guests: [...guests].reverse() }))).toBe(JSON.stringify(a));
    expect(a.describe_org_neutrally).toEqual(["Dominic Achterberg"]);
    expect(JSON.stringify(a.groups)).not.toMatch(/proud|lgbt|pride/i);
    expect(Object.entries(a.guests).filter(([, g]) => g.thin).map(([id]) => id)).toEqual(expect.arrayContaining(["Constance Ridley", "Hamish Ogunleye"]));
    expect(JSON.stringify(a)).not.toMatch(EMAIL);
  });
});

describe.runIf(["hubspot_contacts.csv", "slack_members.csv", "discord_members.csv", "applications.csv"].every(hasFixture))("merge_member_records on the md-01 exports", () => {
  const records = md01Records() as MergeRecord[];
  const out = mergeMemberRecords({ records, today: "2026-10-02" });
  const member = (n: string) => out.members.filter((m) => m.name === n);
  it("finds 52 unique people from 130 rows and does not count unresolved chat accounts", () => {
    expect(records).toHaveLength(130);
    expect(out.stats).toMatchObject({ input_records: 130, unique_members: 52, unresolved_accounts: 25, by_source: { hubspot: 40, slack: 35, discord: 25, "application-form": 30 } });
  });
  it("never merges Sam Patel with Samantha Patel, and flags them", () => {
    expect(member("Sam Patel")).toHaveLength(1);
    expect(member("Samantha Patel")).toHaveLength(1);
    expect(member("Sam Patel")[0].member_id).not.toBe(member("Samantha Patel")[0].member_id);
    expect(member("Sam Patel")[0].asks).not.toEqual(member("Samantha Patel")[0].asks);
    expect(out.uncertain_matches.some((u) => u.kind === "similar_names" && [u.a.name, u.b?.name].sort().join() === "Sam Patel,Samantha Patel")).toBe(true);
  });
  it("collapses 'Tidewater Robotics Ltd' with 'Tidewater Robotics'", () => {
    expect(member("Kasper Olufsen")[0].organisation).toBe("Tidewater Robotics");
    expect(out.same_organisation).toEqual(expect.arrayContaining([{ organisation: "Tidewater Robotics", member_ids: expect.arrayContaining([member("Kasper Olufsen")[0].member_id, member("Ifeoma Adeyemi-Brandt")[0].member_id]) }]));
  });
  it("never returns an email or a phone number", () => {
    const s = JSON.stringify(out);
    expect(s).not.toMatch(EMAIL);
    expect(s).not.toMatch(PHONE);
    expect(s).not.toMatch(/07700/);
  });
  it("merges Leopold once on name plus organisation, keeps Xiomara's later answers, and labels free-text asks inferred", () => {
    expect(member("Leopold Vanterpool")).toHaveLength(1);
    expect(member("Leopold Vanterpool")[0].conflicts.find((c) => c.field === "email")?.values).toHaveLength(2);
    expect(member("Xiomara Lindholm")[0].asks.join(" ")).toMatch(/UX researcher/);
    expect(out.members.filter((m) => m.asks.length).every((m) => m.inferred_fields.includes("asks"))).toBe(true);
  });
  it("lists Discord accounts for the manager: 16 exact names, 9 unresolved (Sam P. and Xi ambiguous, Barn and robo_ifs not guessed)", () => {
    const disc = out.uncertain_matches.filter((u) => u.a.sources.includes("discord"));
    expect(new Set(disc.filter((u) => u.kind === "same_name_org_missing").map((u) => u.a.id)).size).toBe(16);
    const loose = new Set(disc.filter((u) => u.kind !== "same_name_org_missing").map((u) => u.a.name.toLowerCase()));
    expect([...loose].sort()).toEqual(["barn", "beatrix h", "mrk", "night owl", "robo_ifs", "sam p.", "tobias l.", "xi", "zuzu"]);
    expect(disc.filter((u) => u.a.name === "Sam P.").map((u) => u.b?.name).sort()).toEqual(["Sam Patel", "Samantha Patel"]);
    for (const h of ["Barn", "robo_ifs"]) expect(disc.find((u) => u.a.name.toLowerCase() === h.toLowerCase())?.b).toBeNull();
  });
  it("merge_exact_names merges exactly those 16, leaving 9 unresolved, with the latest activity per source", () => {
    const o = mergeMemberRecords({ records, today: "2026-10-02", merge_exact_names: true });
    expect(o.stats).toMatchObject({ unique_members: 52, unresolved_accounts: 9, merged_by_exact_name: 16 });
    const la = (n: string) => { const m = o.members.find((x) => x.name === n)!; return `${m.last_active} ${m.last_active_source}`; };
    expect([la("Odalys Fenwick"), la("Thandiwe Albrecht"), la("Reshma Kowalczyk")]).toEqual(["2026-09-28 slack", "2026-09-12 discord", "2026-09-17 hubspot"]);
  });
  it("reports coverage from the files: asks 29 of 52, opt-in unknown for the 12 not in HubSpot", () => {
    expect(out.members.filter((m) => m.asks.length)).toHaveLength(29);
    expect(out.stats.coverage.asks).toBe(55.8);
    expect(out.members.filter((m) => m.opted_in === "unknown")).toHaveLength(12);
    expect(out.describe_org_neutrally).toEqual([member("Dominic Achterberg")[0].member_id]);
    expect(member("Samantha Patel")[0].notes).toMatch(/deactivated/);
  });
});

describe.runIf(hasFixture("salesforce_contacts.csv"))("detect → merge on the Salesforce report", () => {
  it("reads Email Opt Out as inverted and day-first dates, and strips Ltd/LLP", () => {
    const rows = readCsv("salesforce_contacts.csv");
    const det = detectMemberFields({ source_name: "salesforce_contacts.csv", headers: readHeaders("salesforce_contacts.csv"), sample_rows: readRows("salesforce_contacts.csv").slice(0, 5) });
    const opt = det.mapping.find((m) => m.column === "Email Opt Out")!;
    expect(opt).toMatchObject({ field: "opted_in", inverted: true });
    const values = opt.values as Record<string, string>;
    const out = mergeMemberRecords({ today: "2026-10-02", records: rows.map((r) => ({
      source: "salesforce", first_name: r["First Name"], last_name: r["Last Name"], role: r.Title, organisation: r["Account Name"], email: r.Email,
      location: r["Mailing City"], last_active: r["Last Activity"], joined: r["Created Date"], opted_in: values[r["Email Opt Out"]] ?? "unknown",
    })) });
    const by = (n: string) => out.members.find((m) => m.name === n)!;
    expect(out.members.filter((m) => m.opted_in === "no").map((m) => m.name).sort()).toEqual(["Hyacinth Rowntree", "Jasper Nkemelu"]);
    expect(out.members.filter((m) => m.opted_in === "yes")).toHaveLength(0);
    expect(by("Clementine Abara")).toMatchObject({ last_active: "2026-09-26", joined: "2025-04-22" });
    expect([by("Ambrose Ekwueme").organisation, by("Reshma Kowalczyk").organisation, by("Esme Thackeray").organisation]).toEqual(["Castlegate Accounting", "Brightharbour Legal", "Pennywhistle Foods"]);
  });
});

describe.runIf(hasFixture("ledger.csv"))("compute_impact_metrics matches ledger.csv exactly", () => {
  const ledger = readCsv("ledger.csv");
  const out = computeImpactMetrics({ period: { start: "2026-07-01", end: "2026-09-30" }, ledger });
  // independent recount
  const count = (f: (r: Record<string, string>) => boolean, rs = ledger) => rs.filter(f).length;
  const accepted = (r: Record<string, string>) => r.status === "accepted" || r.status === "connected";
  const ratings = ledger.filter((r) => r.rating).map((r) => Number(r.rating));
  it("totals and rates", () => {
    const n = ledger.length, asked = count((r) => !!r.asked_on), conn = count((r) => r.status === "connected");
    expect(out.totals).toMatchObject({
      requests: n, asked, accepted: count(accepted), connected: conn, lapsed: count((r) => r.status === "lapsed"), declined: count((r) => r.status === "declined"),
      withdrawn: count((r) => r.status === "withdrawn"), pending: count((r) => r.status === "asked"), proposed: count((r) => r.status === "proposed"),
    });
    expect(out.totals.conversation_rate).toMatchObject({ num: conn, den: n });
    expect(out.totals.acceptance_rate).toMatchObject({ num: count(accepted), den: asked });
    expect(out.totals.lapse_rate).toMatchObject({ num: count((r) => r.status === "lapsed"), den: asked });
    // the grader's ground truth for cr-01
    expect([n, conn, out.totals.lapsed, out.totals.declined, asked]).toEqual([40, 14, 8, 3, 37]);
  });
  it("outcome mix, coverage and rating", () => {
    for (const k of ["super valuable", "ok", "didn't connect", "unknown"]) expect(out.outcomes.mix[k as keyof typeof out.outcomes.mix], k).toBe(count((r) => r.outcome === k));
    const known = count((r) => ["super valuable", "ok", "didn't connect"].includes(r.outcome));
    expect(out.outcomes.coverage).toEqual({ pct: Math.round((1000 * known) / ledger.length) / 10, num: known, den: ledger.length });
    expect(known).toBe(16);
    expect(out.rating).toMatchObject({ n: ratings.length, average: Math.round((100 * ratings.reduce((s, x) => s + x, 0)) / ratings.length) / 100 });
    expect(out.rating.average).toBe(4.27);
  });
  it("by source and by month", () => {
    for (const src of new Set(ledger.map((r) => r.source))) {
      const rs = ledger.filter((r) => r.source === src);
      expect(out.by_source[src], src).toMatchObject({ requests: rs.length, connected: count((r) => r.status === "connected", rs), accepted: count(accepted, rs) });
    }
    for (const mo of new Set(ledger.map((r) => r.created.slice(0, 7)))) expect(out.by_month[mo].requests, mo).toBe(count((r) => r.created.startsWith(mo)));
  });
  it("a narrower period counts only intros created in it", () => {
    const sep = computeImpactMetrics({ period: { start: "2026-09-01", end: "2026-09-30" }, ledger });
    expect(sep.totals.requests).toBe(count((r) => r.created >= "2026-09-01" && r.created <= "2026-09-30"));
  });
});

describe.runIf(["ledger.csv", "members.csv", "events_upcoming.csv"].every(hasFixture))("plan_week on the wr-01 week (2 October 2026)", () => {
  const ledger = readCsv("ledger.csv"), members = readCsv("members.csv"), events = readCsv("events_upcoming.csv");
  const invitees = members.map((m) => m.name).filter((n) => events[1].notes.includes(n));
  const out = planWeek({ today: "2026-10-02", ledger, new_members: members.map((m) => ({ name: m.name, joined: m.joined })), events: [
    { name: events[0].event, starts_at: `${events[0].date}T${events[0].start_time}`, matched: false },
    { name: events[1].event, starts_at: `${events[1].date}T${events[1].start_time}`, invitations_sent: false, people: invitees },
  ] });
  it("has at most seven items covering overdue asks, checks, events, welcomes and the Q3 report", () => {
    expect(out.items.length).toBeLessThanOrEqual(7);
    const ids = out.items.flatMap((i) => i.intro_ids ?? []);
    for (const id of ["20260916-reshma-clementine", "20260924-odalys-saoirse", "20260820-caspian-anselm", "20260716-esme-beatrix", "20260810-leopold-desmond"]) expect(ids, id).toContain(id);
    // Evander and Zuleikha both get the Dinner invitation this week, so their follow-through moves (traced in held) and is not in any item.
    expect(ids).not.toContain("20260805-evander-zuleikha");
    expect(out.held.filter((h) => h.intro_ids?.includes("20260805-evander-zuleikha")).map((h) => `${h.person}:${h.until}`).sort()).toEqual(["Evander Kimathi:2026-10-10", "Zuleikha Rahimi-Stone:2026-10-10"]);
    expect(out.items.map((i) => i.kind)).toEqual(expect.arrayContaining(["lapse_notices", "checks_due", "event_matching", "event_invitations", "welcomes"]));
    const all = [...out.items.map((i) => i.title), ...out.held.map((h) => h.item)].join(" ");
    expect(all).toMatch(/Q3 2026/);
    expect(out.items.find((i) => i.kind === "welcomes")!.why_now).toMatch(/Kasper Olufsen.*Ulrich Amadi/s);
  });
  it("catches the built-in double touches and never touches opted-out members", () => {
    const moved = new Set(out.spacing_conflicts.map((c) => c.person));
    for (const p of ["Evander Kimathi", "Zuleikha Rahimi-Stone", "Rosalind Tanaka-Whitfield", "Isidore Kamara", "Esme Thackeray"]) expect(moved.has(p), p).toBe(true);
    const counts = new Map<string, number>();
    for (const it of out.items) for (const p of it.people) counts.set(p, (counts.get(p) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 1)).toBe(true);
    const touched = out.items.flatMap((i) => i.people);
    expect(touched).not.toContain("Hyacinth Rowntree");
    expect(touched).not.toContain("Jasper Nkemelu");
  });
});

describe.runIf(["ledger.csv", "members.csv"].every(hasFixture))("segment_members on members.csv (re-02)", () => {
  const ledger = readCsv("ledger.csv"), members = readCsv("members.csv");
  const out = segmentMembers({ today: "2026-10-02", members: members.map((m) => ({
    id: m.name, last_active: m.last_active, joined: m.joined,
    proactive_touches: ledger.filter((r) => r.target === m.name && (r.asked_on || (r.status === "proposed" && r.next_check >= "2026-10-02"))).map((r) => r.asked_on || r.next_check),
    opted_in: ledger.some((r) => r.target === m.name && /opt-out/i.test(r.notes)) ? "no" : undefined,
  })) });
  it("segments all 60 members and keeps recently touched and opted-out members out of reach", () => {
    expect(Object.values(out.counts).reduce((a, b) => a + b, 0)).toBe(60);
    expect(members.filter((m) => !m.last_active)).toHaveLength(10);
    const s = (n: string) => out.members.find((m) => m.id === n)!;
    for (const n of ["Mathilde Oyelowo", "Seraphina Mwangi", "Hyacinth Rowntree", "Jasper Nkemelu"]) expect(s(n).eligible_now, n).toBe(false);
    expect(out.warnings.join(" ")).toMatch(/last_active only/);
  });
});
