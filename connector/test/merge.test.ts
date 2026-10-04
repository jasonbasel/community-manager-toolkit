/** merge_member_records unit tests (DESIGN §4.2 rules). */
import { describe, expect, it } from "vitest";
import { mergeMemberRecords, type MergeRecord } from "../src/tools/merge.js";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const m = (records: MergeRecord[], extra: Record<string, unknown> = {}) => mergeMemberRecords({ records, today: "2026-10-02", ...extra });
const one = (o: ReturnType<typeof m>, name: string) => o.members.find((x) => x.name === name)!;

describe("certain matches", () => {
  it("merges on the same email, folding Gmail dots and +tags", () => {
    const o = m([{ source: "hubspot", name: "Sam Patel", email: "sam.patel@gmail.com" }, { source: "slack", name: "sam", email: "SamPatel+slack@googlemail.com" }]);
    expect(o.stats.unique_members).toBe(1);
    expect(o.members[0].name).toBe("Sam Patel");
  });
  it("merges on a shared source ID", () => {
    const o = m([{ source: "hubspot", source_id: "1", name: "A B", source_ids: ["slack:U1"] }, { source: "slack", source_id: "U1", name: "Alpha", email: "x@acme.com" }]);
    expect(o.stats.unique_members).toBe(1);
    expect(o.members[0].source_ids).toEqual(["hubspot:1", "slack:U1"]);
  });
  it("merges on name plus organisation, collapsing 'Tidewater Robotics Ltd' with 'Tidewater Robotics'", () => {
    const o = m([
      { source: "hubspot", name: "Kasper Olufsen", organisation: "Tidewater Robotics Ltd", email: "k1@a.com" },
      { source: "form", name: "kasper olufsen", organisation: "Tidewater Robotics", email: "k2@b.com" },
      { source: "hubspot", name: "Ifeoma Adeyemi-Brandt", organisation: "Tidewater Robotics" },
    ]);
    expect(o.stats.unique_members).toBe(2);
    expect(one(o, "Kasper Olufsen").organisation).toBe("Tidewater Robotics");
    expect(o.same_organisation).toEqual([{ organisation: "Tidewater Robotics", member_ids: expect.any(Array) }]);
    expect(one(o, "Kasper Olufsen").conflicts.find((c) => c.field === "email")?.values).toHaveLength(2);
  });
  it("does not treat a shared role mailbox as the same person", () => {
    const o = m([{ source: "hubspot", name: "Ann Lee", email: "info@acme.com" }, { source: "hubspot", name: "Bob Ray", email: "info@acme.com" }]);
    expect(o.stats.unique_members).toBe(2);
  });
});

describe("uncertain matches are never merged", () => {
  it("keeps Sam Patel and Samantha Patel apart and flags them", () => {
    const o = m([{ source: "hubspot", name: "Sam Patel", organisation: "Ledgerline Pay" }, { source: "hubspot", name: "Samantha Patel", organisation: "Mendwell Health" }]);
    expect(o.stats.unique_members).toBe(2);
    expect(o.uncertain_matches).toHaveLength(1);
    expect(o.uncertain_matches[0]).toMatchObject({ kind: "similar_names" });
    expect(o.uncertain_matches[0].reason).toMatch(/Sam.*Samantha/);
  });
  it("flags the same name when one side has no organisation", () => {
    const o = m([{ source: "hubspot", name: "Jo Bloggs", organisation: "Acme", email: "jo@acme.com" }, { source: "mailchimp", name: "Jo Bloggs", email: "jo@gmail.com" }]);
    expect(o.stats.unique_members).toBe(2);
    expect(o.uncertain_matches[0].kind).toBe("same_name_org_missing");
  });
  it("flags the same name at different organisations", () => {
    const o = m([{ source: "hubspot", name: "Alex Kim", organisation: "Acme" }, { source: "form", name: "Alex Kim", organisation: "Globex" }]);
    expect(o.uncertain_matches[0].kind).toBe("same_name_different_org");
  });
  it("lists chat handles without guessing and does not count them as members", () => {
    const o = m([
      { source: "hubspot", name: "Barnaby Quist", organisation: "Ironbridge" }, { source: "hubspot", name: "Ximena Braithwaite", organisation: "Fieldstone" },
      { source: "hubspot", name: "Xiomara Lindholm", organisation: "Plumtree" },
      { source: "discord", source_id: "1", name: "Barn" }, { source: "discord", source_id: "2", name: "Xi" }, { source: "discord", source_id: "3", name: "Barnaby Quist" },
    ]);
    expect(o.stats.unique_members).toBe(3);
    expect(o.stats.unresolved_accounts).toBe(3);
    const by = (n: string) => o.uncertain_matches.filter((u) => u.a.name === n);
    expect(by("Barn")).toEqual([expect.objectContaining({ b: null, kind: "chat_handle" })]);
    expect(by("Xi").map((u) => u.b?.name).sort()).toEqual(["Ximena Braithwaite", "Xiomara Lindholm"]);
    expect(by("Barnaby Quist")[0]).toMatchObject({ kind: "same_name_org_missing", score: 1 });
  });
  it("merges exact chat names only when asked (merge_exact_names)", () => {
    const recs: MergeRecord[] = [{ source: "hubspot", name: "Barnaby Quist", organisation: "Ironbridge" }, { source: "discord", source_id: "3", name: "Barnaby Quist", last_active: "2026-09-30" }];
    expect(m(recs).stats.unresolved_accounts).toBe(1);
    const o = m(recs, { merge_exact_names: true });
    expect(o.stats).toMatchObject({ unique_members: 1, unresolved_accounts: 0, merged_by_exact_name: 1 });
    expect(o.members[0]).toMatchObject({ last_active: "2026-09-30", last_active_source: "discord" });
  });
  it("applies the manager's decisions", () => {
    const recs: MergeRecord[] = [{ source: "hubspot", name: "Sam Patel", organisation: "Ledgerline" }, { source: "hubspot", name: "Samantha Patel", organisation: "Mendwell" }, { source: "discord", source_id: "9", name: "Beatrix H" }, { source: "hubspot", name: "Beatrix Halloran", organisation: "Anvil" }];
    const first = m(recs);
    const sam = first.uncertain_matches.find((u) => u.kind === "similar_names")!;
    const bea = first.uncertain_matches.find((u) => u.a.name === "Beatrix H")!;
    const second = m(recs, { decisions: [{ a: sam.a.id, b: sam.b!.id, same: false }, { a: bea.a.id, b: bea.b!.id, same: true }] });
    expect(second.uncertain_matches).toEqual([]);
    expect(second.stats.unique_members).toBe(3);
    expect(one(second, "Beatrix Halloran").source_ids).toContain("discord:9");
    expect(() => m(recs, { decisions: [{ a: "m_nope", b: sam.b!.id, same: true }] })).toThrow(/decisions\[0\]\.a/);
  });
});

describe("precedence and field rules", () => {
  const recs: MergeRecord[] = [
    { source: "slack", name: "Reshma Kowalczyk", email: "r@brightharbour.com", role: "Partner, Brightharbour Legal", last_active: "2026-09-05", asks: "chat ask", opted_in: "yes" },
    { source: "hubspot", name: "Reshma Kowalczyk", email: "r@brightharbour.com", organisation: "Brightharbour Legal LLP", role: "Partner", joined: "2024-08-02", last_active: "2026-09-17", opted_in: "Marketing contact" },
    { source: "typeform", name: "Reshma Kowalczyk", email: "r@brightharbour.com", asks: "Startups needing contracts", offers: ["GDPR reviews"], inferred_fields: ["asks", "offers"], joined: "2024-07-30" },
    { source: "mailchimp", email: "r@brightharbour.com", opted_in: "unsubscribed" },
  ];
  it("takes identity from the CRM, asks from forms, latest activity, earliest join and the most restrictive consent", () => {
    const r = m(recs).members[0];
    expect(r).toMatchObject({
      organisation: "Brightharbour Legal", role: "Partner", joined: "2024-07-30", last_active: "2026-09-17", last_active_source: "hubspot",
      asks: ["Startups needing contracts"], offers: ["GDPR reviews"], opted_in: "no", opt_in_source: "mailchimp", email_domain: "brightharbour.com",
      profile_quality: "full", inferred_fields: ["asks", "offers"],
    });
  });
  it("custom precedence can prefer another source", () => {
    expect(m(recs, { precedence: { asks_offers: ["slack"] } }).members[0].asks).toEqual(["chat ask"]);
  });
  it("chat-derived asks stay inferred; personal domains give a blank email_domain", () => {
    const o = m([{ source: "discord", name: "Ann Lee", email: "ann@gmail.com", asks: "a designer" }]);
    expect(o.members[0]).toMatchObject({ inferred_fields: ["asks"], email_domain: "" });
  });
  it("splits 'Role at Organisation' when no organisation is given", () => {
    const o = m([{ source: "slack", name: "Clementine Abara", email: "c@h.com", role: "CEO at Hollowbrook Cyber" }]);
    expect(o.members[0]).toMatchObject({ role: "CEO", organisation: "Hollowbrook Cyber" });
  });
  it("ignores activity from deactivated chat accounts and notes it", () => {
    const o = m([{ source: "hubspot", name: "P V", email: "p@s.com", last_active: "2026-06-02" }, { source: "slack", name: "P V", email: "p@s.com", status: "Deactivated", last_active: "2026-07-19" }]);
    expect(o.members[0]).toMatchObject({ last_active: "2026-06-02", status: "" });
    expect(o.members[0].notes).toMatch(/deactivated/);
  });
  it("treats bare 1/0 consent as unknown, never as consent", () => {
    expect(m([{ source: "hubspot", name: "A B", opted_in: "1" }]).members[0].opted_in).toBe("unknown");
  });
});

describe("data minimisation", () => {
  const recs: MergeRecord[] = [
    { source: "form", name: "Lorcan F", email: "lorcan@example.com", asks: "Seed deals. Reach me at lorcan@example.com or 07700 900132.", notes: "Chemo starts Monday. Wants an intro to Priya." },
    { source: "form", name: "Ulrich Amadi", email: "u@example.com", offers: ["Credit risk modelling, call +44 7700 900141"], tags: ["fintech", "LGBTQ+"] },
    { source: "hubspot", name: "Dominic Achterberg", organisation: "Out & Proud Travel Co", email: "d@example.com" },
  ];
  it("never returns an email or phone number", () => {
    const s = JSON.stringify(m(recs));
    expect(s).not.toMatch(EMAIL);
    expect(s).not.toMatch(/07700|7700 900/);
  });
  it("removes sensitive notes and tags and flags the sensitive-name organisation", () => {
    const o = m(recs);
    expect(one(o, "Lorcan F").notes).not.toMatch(/chemo/i);
    expect(one(o, "Lorcan F").notes).toMatch(/Wants an intro/);
    expect(one(o, "Ulrich Amadi").tags).toEqual(["fintech"]);
    expect(o.describe_org_neutrally).toEqual([one(o, "Dominic Achterberg").member_id]);
  });
});

describe("output", () => {
  it("is deterministic with stable member ids", () => {
    const recs: MergeRecord[] = [{ source: "hubspot", source_id: "7", name: "Ann Lee", organisation: "Acme" }, { source: "slack", source_id: "U7", name: "Bo Chan", email: "bo@globex.com" }];
    const a = m(recs), b = m([...recs].reverse());
    expect(a.members.map((x) => x.member_id)).toEqual(b.members.map((x) => x.member_id));
    expect(JSON.stringify(m(recs))).toBe(JSON.stringify(a));
    expect(a.members[0].member_id).toMatch(/^m_[a-z2-7]{10}$/);
  });
  it("reports coverage, stats and gaps", () => {
    const o = m([{ source: "hubspot", name: "Ann Lee", organisation: "Acme", role: "CEO", last_active: "2026-09-30", joined: "2026-09-20" }, { source: "hubspot", name: "Bo Chan" }]);
    expect(o.stats).toMatchObject({ input_records: 2, unique_members: 2, merged: 0, by_source: { hubspot: 2 } });
    expect(o.stats.coverage).toMatchObject({ organisation: 50, role: 50, asks: 0, last_active: 50 });
    expect(o.gaps[0]).toMatchObject({ name: "Ann Lee", missing: ["asks", "offers"] });
    expect(o.gaps[0].why).toMatch(/active 2 days ago; joined 12 days ago/);
  });
  it("never produces an id that looks like a phone number or email", () => {
    const recs: MergeRecord[] = Array.from({ length: 3000 }, (_v, i) => ({ source: "hubspot", source_id: String(i), name: `Person ${i}` }));
    const PHONE = /(?<![\d.])(?:\+\d{1,3}[\s.-]?)?(?:\(0\d{2,4}\)|0\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/;
    for (const mem of m(recs).members) expect(mem.member_id, mem.member_id).not.toMatch(PHONE);
  });
  it("rejects a bad today", () => {
    expect(() => m([{ source: "x", name: "A" }], { today: "yesterday" })).toThrow(/today/);
  });
});
