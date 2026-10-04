/** merge_member_records unit tests (DESIGN §4.2 rules). */
import { describe, expect, it } from "vitest";
import { MAX_UNCERTAIN, mergeMemberRecords, sourceLabel, type MergeRecord } from "../src/tools/merge.js";

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

describe("bounded uncertain matches (review finding 1)", () => {
  it("5,000 identical names finish in under 1 s, with nothing generated pair by pair and a warning", () => {
    const t0 = performance.now();
    const o = m(Array.from({ length: 5000 }, (_v, i) => ({ source: "hubspot", name: "Sam Patel", organisation: i % 2 ? `Org ${i}` : null })));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(o.stats.unique_members).toBe(5000);
    expect(o.uncertain_matches.length).toBeLessThanOrEqual(MAX_UNCERTAIN);
    expect(o.warnings.join(" ")).toMatch(/shared by more than 300 members/);
  });
  it("caps the list at 500, strongest first, and reports the total", () => {
    const t0 = performance.now();
    const o = m(Array.from({ length: 5000 }, (_v, i) => ({ source: "hubspot", name: `Sam${i % 20} Patel${i % 20}` })));
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(o.uncertain_matches).toHaveLength(MAX_UNCERTAIN);
    expect(o.stats).toMatchObject({ uncertain_total: 20 * ((250 * 249) / 2), uncertain_listed: MAX_UNCERTAIN });
    expect(o.warnings.join(" ")).toMatch(/622500 uncertain matches between members were found; the 500 strongest are listed/);
    const scores = o.uncertain_matches.map((u) => u.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
  it("placeholder names never generate matches or merges", () => {
    const o = m([
      { source: "hubspot", name: "Unknown", organisation: "Acme" }, { source: "form", name: "unknown", organisation: "Acme Ltd" }, { source: "hubspot", name: "N/A" },
      { source: "hubspot", name: "n/a" }, { source: "hubspot", name: "Test", organisation: "Globex" }, { source: "hubspot", name: "Test User" }, { source: "hubspot", name: "X" },
      { source: "hubspot", name: "A B" }, { source: "hubspot", name: "A B", organisation: "Initech" }, { source: "hubspot", name: "Sam Patel", organisation: "Ledgerline" },
      { source: "discord", source_id: "1", name: "Unknown" },
    ]);
    expect(o.stats.unique_members).toBe(10); // the two "Unknown"s at Acme are not one person
    expect(new Set(o.members.map((x) => x.member_id)).size).toBe(10);
    expect(o.uncertain_matches.filter((u) => u.b)).toEqual([]);
    expect(o.uncertain_matches).toEqual([expect.objectContaining({ kind: "chat_handle", b: null })]);
    expect(o.warnings.join(" ")).toMatch(/9 member\(s\) have a placeholder name/);
  });
  it("matches chat names against members normalised once (2,500 accounts x 2,500 members in under 1 s)", () => {
    const t0 = performance.now();
    const o = m([
      ...Array.from({ length: 2500 }, (_v, i) => ({ source: "hubspot", name: `Firstname${i} Lastname${i}`, organisation: `Org${i}` })),
      ...Array.from({ length: 2500 }, (_v, i) => ({ source: "discord", source_id: String(100000 + i), name: i % 2 ? "First L." : "Fi" })),
    ]);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(o.uncertain_matches).toHaveLength(MAX_UNCERTAIN);
    const listedAccounts = new Set(o.uncertain_matches.filter((u) => u.a.id.startsWith("u_")).map((u) => u.a.id)).size;
    expect(o.warnings.join(" ")).toContain(`2500 chat account(s) have no email or organisation and did not match anyone for certain, so they are not counted as members; ${listedAccounts} of them are listed`);
  });
  it("keeps unresolved chat accounts listed even when member pairs fill their cap (round-2 7)", () => {
    const o = m([
      ...Array.from({ length: 1000 }, (_v, i) => ({ source: "hubspot", name: `Sam${i % 4} Patel${i % 4}` })),
      ...Array.from({ length: 30 }, (_v, i) => ({ source: "discord", source_id: String(900000 + i), name: `zz_handle_${i}` })),
    ]);
    expect(o.uncertain_matches.filter((u) => u.b && !u.a.id.startsWith("u_"))).toHaveLength(MAX_UNCERTAIN);
    expect(o.uncertain_matches.filter((u) => u.kind === "chat_handle")).toHaveLength(30);
    expect(o.warnings.join(" ")).toMatch(/30 chat account\(s\) .*; each is listed in uncertain_matches/);
  });
});

describe("source IDs that are contact details (review finding 2)", () => {
  const recs: MergeRecord[] = [
    { source: "whatsapp", name: "Ann Lee", source_ids: ["whatsapp:+447700900123"] },
    { source: "mailchimp", name: "Bo Chan", source_ids: ["mailchimp:bo.chan@example.com"] },
    { source: "linkedin", name: "Cleo Dunn", source_ids: ["https://www.linkedin.com/in/cleo-dunn-1234"] },
    { source: "linkedin", name: "Dara Eze", source_id: "linkedin.com/in/dara-eze" },
    { source: "whatsapp", name: "Eli Fox", source_id: "447700900456" },
    { source: "telegram", name: "Fen Gill", source_ids: ["telegram:@fengill"] },
    { source: "hubspot", name: "Gus Hart", source_id: "+44 7700 900789" },
    { source: "hubspot", name: "Hana Ito", source_id: "hana@example.com" },
    { source: "hubspot", name: "Ivo Jay", source_id: "415-555-0100" },
    { source: "+44 7700 900999", name: "Juno Kay", source_id: "77" },
    { source: "hubspot", name: "Kit Lam", source_id: "4155550100", source_ids: ["slack:U0ABC123", "discord:113693792436467651"] },
  ];
  it("drops each shape, never echoes it, and names the record index only", () => {
    const o = m(recs);
    const s = JSON.stringify(o);
    for (const bad of ["7700", "example.com", "linkedin.com", "cleo-dunn", "dara-eze", "fengill", "555-0100", "447700"]) expect(s, bad).not.toContain(bad);
    const w = o.warnings.find((x) => x.startsWith("Source IDs that looked like contact details"))!;
    expect(w).toMatch(/records\[0\], records\[1\], records\[2\], records\[3\], records\[4\], records\[5\], records\[6\], records\[7\], records\[8\]/);
    expect(w).not.toMatch(/records\[9\]|records\[10\]/);
    expect(o.warnings.join(" ")).toMatch(/1 record\(s\) had a contact detail as their source name/);
    expect(one(o, "Juno Kay").source_ids).toEqual(["unknown:77"]);
  });
  it("keeps real platform IDs, including bare numbers from non-phone sources", () => {
    expect(one(m(recs), "Kit Lam").source_ids).toEqual(["discord:113693792436467651", "hubspot:4155550100", "slack:U0ABC123"]);
  });
});

describe("source IDs judged by their prefix and the record's source (round-2 4)", () => {
  const ids = (rec: MergeRecord) => m([rec]).members[0]?.source_ids ?? [];
  it("drops phone-shaped IDs under WhatsApp, tel, wa_id, msisdn and generic prefixes on phone sources", () => {
    const o = m([{ source: "whatsapp", name: "Ann Lee", source_id: "447700900310", source_ids: ["wa:447700900311", "tel:447700900312", "wa_id:447700900313", "msisdn:447700900314", "id:447700900315", "phone:447700900316", "whatsapp:annlee"] }]);
    expect(JSON.stringify(o)).not.toMatch(/4477009003|annlee/);
    expect(o.members[0].source_ids).toEqual(["whatsapp"]);
    expect(ids({ source: "hubspot", name: "Bo Chan", source_ids: ["wa:447700900311", "tel:+447700900312"] })).toEqual(["hubspot"]);
  });
  it("drops handles and profile slugs under social labels, keeping opaque numeric IDs and URNs", () => {
    expect(ids({ source: "linkedin", name: "Cleo Dunn", source_ids: ["linkedin:cleo-dunn-1234", "linkedin:urn:li:person:AbC12345", "linkedin:123456789"] }))
      .toEqual(["linkedin:123456789", "linkedin:urn:li:person:AbC12345"]);
    expect(ids({ source: "telegram", name: "Fen Gill", source_ids: ["telegram:fengill", "telegram:123456789", "x:fen_gill", "x:1234567890123", "slack:U0ABC123"] }))
      .toEqual(["slack:U0ABC123", "telegram:123456789", "x:1234567890123"]);
    expect(ids({ source: "linkedin", name: "Dara Eze", source_id: "dara-eze" })).toEqual(["linkedin"]);
  });
  it("matches generic words only as the whole label", () => {
    expect(ids({ source: "mobile-app", name: "Eli Fox", source_id: "4155550100" })).toEqual(["mobile-app:4155550100"]);
    expect(ids({ source: "tel-aviv-chapter", name: "Gus Hart", source_id: "12345678" })).toEqual(["tel-aviv-chapter:12345678"]);
    expect(ids({ source: "slack-threads", name: "Hana Ito", source_id: "U0HANA1" })).toEqual(["slack-threads:U0HANA1"]);
    expect(ids({ source: "mobile", name: "Ivo Jay", source_id: "4155550100" })).toEqual(["mobile"]);
  });
});

describe("source IDs judged by the words of their prefix and source, in source_id too (round-3 5)", () => {
  const ids = (rec: MergeRecord) => m([rec]).members[0]?.source_ids ?? [];
  it("reads label:value in the single source_id field and drops phone-labelled values whatever their shape", () => {
    for (const id of ["mobile_phone:447700900123", "phone_number:447700900124", "wa:447700900125", "whatsapp:447700900126", "tel:447700900127", "msisdn:447700900128",
      "WhatsApp:+44 7700 900129", "mobile number:07700 900130", "sms:447700900131", "phone_number:1234567", "Mobile Phone:12345", "tel:bo chan", "wa_id:447700900132"]) {
      const o = m([{ source: "hubspot", name: "Ann Lee", source_id: id }]);
      expect(JSON.stringify(o), id).not.toMatch(/7700|1234567|12345|bo chan/);
      expect(o.members[0].source_ids, id).toEqual(["hubspot"]);
      expect(o.warnings.join(" "), id).toMatch(/Source IDs that looked like contact details/);
    }
  });
  it("drops every bare or generically prefixed ID of a phone-channel source, matched as whole words or segments", () => {
    for (const source of ["WA group", "WhatsApp export", "sms", "SMS list", "mobile_phone", "Phone numbers", "WhatsAppExport", "whatsapp", "mobile number", "iMessage thread", "msisdn_list"]) {
      const o = m([{ source, name: "Bo Chan", source_id: "447700900456", source_ids: ["id:447700900457", "12345678", "ref:ABC123"] }]);
      expect(JSON.stringify(o), source).not.toMatch(/4477009004|12345678|ABC123/);
      expect(o.members[0].source_ids, source).toEqual([sourceLabel(source)]);
    }
  });
  it("keeps numeric platform IDs when neither prefix nor source is phone-like, with no country-code guess", () => {
    expect(ids({ source: "hubspot", name: "Cleo Dunn", source_id: "447700900456" })).toEqual(["hubspot:447700900456"]); // a record ID that happens to start 44
    expect(ids({ source: "hubspot", name: "Cleo Dunn", source_id: "51203400243" })).toEqual(["hubspot:51203400243"]);
    expect(ids({ source: "discord", name: "Dara Eze", source_id: "113693792436467651" })).toEqual(["discord:113693792436467651"]);
    expect(ids({ source: "slack", name: "Eli Fox", source_id: "U0ABC123", source_ids: ["hubspot:51203400243"] })).toEqual(["hubspot:51203400243", "slack:U0ABC123"]);
    expect(ids({ source: "WhatsApp export", name: "Fen Gill", source_ids: ["slack:U0ABC123", "discord:113693792436467651"] })).toEqual(["discord:113693792436467651", "slack:U0ABC123"]); // a platform prefix keeps its own meaning
    expect(ids({ source: "mobile-app", name: "Gus Hart", source_id: "4155550100" })).toEqual(["mobile-app:4155550100"]);
    expect(ids({ source: "tel-aviv-chapter", name: "Hana Ito", source_id: "12345678" })).toEqual(["tel-aviv-chapter:12345678"]);
    expect(ids({ source: "slack", name: "Ivo Jay", source_id: "slack:U0IVO" })).toEqual(["slack:U0IVO"]); // own platform prefix is not doubled
    expect(ids({ source: "linkedin", name: "Juno Kay", source_id: "urn:li:person:AbC12345" })).toEqual(["linkedin:urn:li:person:AbC12345"]);
  });
  it("still drops phone-shaped values under any label", () => {
    for (const id of ["+44 7700 900789", "07700 900789", "(415) 555-0100", "44 7700 900789", "0044 7700 900789"]) expect(ids({ source: "hubspot", name: "Kit Lam", source_id: id }), id).toEqual(["hubspot"]);
  });
});

describe("source labels and generic prefixes never carry a phone number (final-round 5)", () => {
  const ids = (rec: MergeRecord) => m([rec]).members[0]?.source_ids ?? [];
  it("masks a source label with a digit run or phone shape and says so", () => {
    for (const source of ["whatsapp-447700900311", "WA 07700 900311", "sms_4155550100", "+44 7700 900999", "export-1790000000"]) {
      const o = m([{ source, name: "Ann Lee", source_id: "77" }]);
      expect(JSON.stringify(o), source).not.toMatch(/7700|4155550100|1790000000/);
      expect(o.stats.by_source, source).toEqual({ unknown: 1 });
      expect(o.warnings.join(" "), source).toMatch(/1 record\(s\) had a contact detail as their source name/);
    }
  });
  it("keeps labels with dates, years and short numbers", () => {
    for (const source of ["members-20260930.csv", "cohort-2026", "q3-2026-export", "form-123456", "event-2026-09-30"]) {
      const o = m([{ source, name: "Bo Chan", source_id: "77" }]);
      expect(o.stats.by_source, source).toEqual({ [sourceLabel(source)]: 1 });
      expect(o.warnings.join(" "), source).not.toMatch(/contact detail as their source name/);
    }
  });
  it("treats generic kind words as non-platform prefixes, so the record's phone source still decides", () => {
    const o = m([{ source: "whatsapp", name: "Cleo Dunn", source_ids: ["chat:447700900311", "csv:447700900312", "community:447700900313", "export:447700900314", "file:447700900315", "list:447700900316", "sheet:447700900317", "form:447700900318", "group:447700900319", "slack:U0ABC123"] }]);
    expect(JSON.stringify(o)).not.toMatch(/4477009003/);
    expect(o.members[0].source_ids).toEqual(["slack:U0ABC123"]);
    expect(ids({ source: "hubspot", name: "Dara Eze", source_ids: ["chat:12345678", "csv:9"] })).toEqual(["chat:12345678", "csv:9"]);
    expect(ids({ source: "hubspot", name: "Eli Fox", source_ids: ["whatsapp-447700900311:77"] })).toEqual(["hubspot"]); // a prefix carrying a number drops the ID
  });
});

describe("member_id seeds (review finding 11)", () => {
  it("two people on a shared mailbox get different member_ids", () => {
    for (const box of ["info", "hello", "admin", "team", "contact", "office", "enquiries", "support"]) {
      const o = m([{ source: "hubspot", name: "Ann Lee", email: `${box}@acme.com` }, { source: "hubspot", name: "Bob Ray", email: `${box}@acme.com` }]);
      expect(o.stats.unique_members, box).toBe(2);
      expect(o.members[0].member_id, box).not.toBe(o.members[1].member_id);
    }
  });
});
