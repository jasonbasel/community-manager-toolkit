/** Invariants every pair_attendees result must satisfy, checked from the output alone. */
import { expect } from "vitest";
import { pairAttendees, type PairInput } from "../../src/tools/pair.js";
import { orgKey } from "../../src/text/normalise.js";

type Out = ReturnType<typeof pairAttendees>;

export function assertRules(input: PairInput, out: Out) {
  const max = input.options?.max_per_person ?? 3;
  const excluded = new Set(input.exclude_ids ?? []);
  const guests = input.guests.filter((g) => !excluded.has(g.id));
  const org = new Map(guests.map((g) => [g.id, orgKey(g.organisation)]));
  const avoid = new Set((input.avoid_pairs ?? []).map(([a, b]) => [a, b].sort().join("|")));
  const bad = (a: string, b: string) => (org.get(a) && org.get(a) === org.get(b)) || avoid.has([a, b].sort().join("|"));
  // no same-organisation or avoid pair inside a group or a backup link
  for (const g of out.groups) for (const a of g.ids) for (const b of g.ids) if (a < b) expect(bad(a, b), `${a} + ${b}`).toBeFalsy();
  for (const [a, b] of Object.entries(out.backups)) if (b) { expect(bad(a, b), `backup ${a} → ${b}`).toBeFalsy(); expect(out.groups.some((g) => g.ids.includes(a) && g.ids.includes(b))).toBe(false); }
  // nobody in more than max introductions: groups + distinct backup links
  const load = new Map<string, number>();
  for (const g of out.groups) for (const id of g.ids) load.set(id, (load.get(id) ?? 0) + 1);
  const links = new Set<string>();
  for (const [a, b] of Object.entries(out.backups)) if (b) links.add([a, b].sort().join("|"));
  for (const l of links) for (const id of l.split("|")) load.set(id, (load.get(id) ?? 0) + 1);
  for (const [id, n] of load) expect(n, `${id} is in ${n} introductions`).toBeLessThanOrEqual(max);
  // every guest is placed exactly once or listed as unmatched, and excluded guests appear nowhere
  const placed = out.groups.flatMap((g) => g.ids);
  expect(new Set(placed).size).toBe(placed.length);
  const listed = new Set([...placed, ...out.unmatched.map((u) => u.id)]);
  expect([...listed].sort()).toEqual(guests.map((g) => g.id).sort());
  for (const id of excluded) expect(listed.has(id)).toBe(false);
  for (const u of out.unmatched) expect(u.reason.length).toBeGreaterThan(10);
}

