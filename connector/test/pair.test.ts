/** pair_attendees unit tests: hard rules, cap, trios, backups, host_buddy, determinism, speed. */
import { describe, expect, it } from "vitest";
import { pairAttendees, type Guest, type PairInput } from "../src/tools/pair.js";
import { syntheticGuests } from "./helpers/synthetic.js";
import { assertRules } from "./helpers/rules.js";

const g = (id: string, organisation: string, asks: string[] = [], offers: string[] = [], extra: Partial<Guest> = {}): Guest => ({ id, name: id, organisation, asks, offers, ...extra });

describe("hard rules", () => {
  it("never pairs two people from the same organisation, even when they match best", () => {
    const input: PairInput = { guests: [g("A1", "Acme Ltd", ["seed funding"], ["seed funding"]), g("A2", "ACME", ["seed funding"], ["seed funding"]), g("B", "Bolt"), g("C", "Cog")] };
    const out = pairAttendees(input);
    assertRules(input, out);
    expect(out.groups.some((x) => x.ids.includes("A1") && x.ids.includes("A2"))).toBe(false);
    expect(out.excluded.same_org).toEqual([{ organisation: "Acme Ltd", ids: ["A1", "A2"] }]);
  });
  it("respects avoid pairs and exclude_ids", () => {
    const input: PairInput = {
      guests: [g("A", "a", ["hiring"], ["funding"]), g("B", "b", ["funding"], ["hiring"]), g("C", "c"), g("D", "d"), g("E", "e")],
      avoid_pairs: [["A", "B"]], exclude_ids: ["E"],
    };
    const out = pairAttendees(input);
    assertRules(input, out);
    expect(out.excluded).toMatchObject({ avoid: [["A", "B"]], removed: ["E"] });
  });
  it("lists people who cannot be placed with a specific reason", () => {
    const input: PairInput = { guests: [g("A", "Same"), g("B", "Same"), g("C", "Same")] };
    const out = pairAttendees(input);
    assertRules(input, out);
    expect(out.groups).toEqual([]);
    expect(out.unmatched.map((u) => u.id)).toEqual(["A", "B", "C"]);
    expect(out.unmatched[0].reason).toMatch(/same organisation/);
  });
  it("repairs a leftover pair of colleagues by swapping into another pair", () => {
    const input: PairInput = { guests: [g("P1", "Halden & Moss", ["climate"]), g("P2", "Halden and Moss", ["climate"]), g("X", "x", [], ["climate"]), g("Y", "y", [], ["climate"])] };
    const out = pairAttendees(input);
    assertRules(input, out);
    expect(out.groups).toHaveLength(2);
    expect(out.unmatched).toEqual([]);
  });
});

describe("cap and backups", () => {
  const guests = syntheticGuests(60, 7);
  for (const max of [1, 2, 3, 4]) {
    it(`never names anyone in more than ${max} introduction(s)`, () => {
      const input: PairInput = { guests, options: { max_per_person: max } };
      const out = pairAttendees(input);
      assertRules(input, out);
      if (max === 1) expect(Object.values(out.backups).every((b) => b === null)).toBe(true);
      if (max >= 2) expect(out.stats.with_backup).toBeGreaterThan(50);
    });
  }
  it("explains missing backups and can switch them off", () => {
    const out = pairAttendees({ guests: [g("A", "a"), g("B", "b")] });
    expect(out.backups).toEqual({ A: null, B: null });
    expect(out.backup_notes.A).toMatch(/host places at door/);
    expect(pairAttendees({ guests, options: { backups: false } }).stats.with_backup).toBe(0);
  });
});

describe("odd numbers and modes", () => {
  it("puts an odd guest into the best-fitting trio", () => {
    const input: PairInput = { guests: [g("A", "a", ["hiring"]), g("B", "b", [], ["hiring"]), g("C", "c", ["funding"], ["hiring"])] };
    const out = pairAttendees(input);
    assertRules(input, out);
    expect(out.stats).toMatchObject({ trios: 1, unmatched: 0 });
  });
  it("leaves the odd guest for the host when trios are off", () => {
    const input: PairInput = { guests: [g("A", "a"), g("B", "b"), g("C", "c")], options: { allow_trio: false } };
    const out = pairAttendees(input);
    assertRules(input, out);
    expect(out.unmatched).toEqual([{ id: expect.any(String), reason: expect.stringMatching(/trios are off/) }]);
  });
  it("host_buddy: each member hosts up to two non-members from other organisations", () => {
    const guests = [g("M1", "m1", [], [], { member: true }), g("M2", "m2", [], [], { member: true }), g("N1", "n1"), g("N2", "n2"), g("N3", "m1"), g("N4", "n4"), g("N5", "n5")];
    const input: PairInput = { guests, options: { mode: "host_buddy" } };
    const out = pairAttendees(input);
    assertRules(input, out);
    for (const grp of out.groups) {
      expect(grp.ids.filter((id) => id.startsWith("M"))).toHaveLength(1);
      expect(grp.ids.length).toBeLessThanOrEqual(3);
    }
    expect(out.unmatched.map((u) => u.id)).toEqual(["N5"]);
    expect(out.unmatched[0].reason).toMatch(/no member host/);
  });
});

describe("basis, strength and sensitive attributes", () => {
  it("explains matches from asks and offers, tags and sides", () => {
    const out = pairAttendees({ guests: [g("Ann", "a", ["an angel investor"], ["travel distribution"], { side: "founder", tags: ["travel"] }), g("Bo", "b", ["travel startups"], ["angel cheques"], { side: "investor", tags: ["travel"] })] });
    const grp = out.groups[0];
    expect(grp.strength).toBe("strong");
    expect(grp.basis.ask_offer).toEqual(expect.arrayContaining([{ asker: "Ann", offerer: "Bo", keywords: ["funding"] }]));
    expect(grp.basis.shared_tags).toEqual(["travel"]);
    expect(grp.basis.complementary).toBe("founder↔investor");
    expect(grp.reason_hint).toMatch(/Ann wants funding; Bo offers it/);
  });
  it("keeps sensitive terms out of the basis and flags sensitive-name organisations", () => {
    const out = pairAttendees({ guests: [g("D", "Out & Proud Travel Co", ["LGBTQ founders", "angel investor"], [], { tags: ["pride"] }), g("W", "Brackenridge Capital", [], ["seed funding", "LGBTQ founders"], { tags: ["pride"] })] });
    const s = JSON.stringify(out.groups);
    expect(s).not.toMatch(/lgbt|pride/i);
    expect(out.describe_org_neutrally).toEqual(["D"]);
  });
  it("marks guests with no asks or offers as thin", () => {
    const out = pairAttendees({ guests: [g("A", "a"), g("B", "b", ["hiring"], ["funding"])] });
    expect(out.guests.A.thin).toBe(true);
    expect(out.stats.thin_profiles).toBe(1);
  });
});

describe("validation", () => {
  it("rejects missing, duplicated and contact-detail ids specifically", () => {
    expect(() => pairAttendees({ guests: [g("A", "a"), g("A", "b")] })).toThrow(/guests\[1\]\.id 'A' is duplicated \(also guests\[0\]\.id\)/);
    expect(() => pairAttendees({ guests: [g("ann@example.com", "a")] })).toThrow(/guests\[0\]\.id looks like an email/);
    expect(() => pairAttendees({ guests: [g("07700 900100", "a")] })).toThrow(/phone number/);
    expect(() => pairAttendees({ guests: [{ id: " " } as Guest] })).toThrow(/guests\[0\]\.id is missing/);
  });
  it("trims exclude_ids and avoid_pairs ids like guest ids (review finding 4)", () => {
    const input: PairInput = {
      guests: [g("A", "a", ["hiring"], ["funding"]), g("B", "b", ["funding"], ["hiring"]), g("C", "c"), g("D", "d"), g(" E ", "e")],
      avoid_pairs: [["A ", " B"]], exclude_ids: ["E ", " "],
    };
    const out = pairAttendees(input);
    expect(out.excluded).toMatchObject({ avoid: [["A", "B"]], removed: ["E"] });
    expect(out.groups.flatMap((x) => x.ids)).not.toContain("E");
    expect(out.groups.some((x) => x.ids.includes("A") && x.ids.includes("B"))).toBe(false);
    expect(out.warnings).toEqual([]);
  });
  it("warns about avoid pairs that name unknown guests", () => {
    expect(pairAttendees({ guests: [g("A", "a"), g("B", "b")], avoid_pairs: [["A", "Z"]] }).warnings[0]).toMatch(/avoid_pairs\[0\]/);
  });
});

describe("determinism and speed", () => {
  it("gives identical output for the same input, whatever the input order", () => {
    const guests = syntheticGuests(200, 3);
    const a = JSON.stringify(pairAttendees({ guests }));
    expect(JSON.stringify(pairAttendees({ guests }))).toBe(a);
    expect(JSON.stringify(pairAttendees({ guests: [...guests].reverse() }))).toBe(a);
  });
  it("pairs 1,000 synthetic guests in under 200 ms, within every rule", () => {
    const guests = syntheticGuests(1000, 42);
    const t0 = performance.now();
    const out = pairAttendees({ guests });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(200);
    assertRules({ guests }, out);
    expect(out.stats.placed).toBe(1000);
  });
});
