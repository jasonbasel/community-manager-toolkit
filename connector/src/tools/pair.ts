/**
 * pair_attendees: deterministic event pairing under hard rules (DESIGN §4.3).
 *   score(a,b) = 3·ask(a)↔offer(b) + 3·ask(b)↔offer(a) + shared tags (1 each, max 2) + complementary sides (1)
 *                − 0.5 per thin profile. Each ask↔offer direction is capped at 1 (broad words count half).
 * Hard rules: never the same organisation, never an avoid pair, excluded ids removed, nobody in more
 * than max_per_person introductions (their group counts 1; each backup link counts 1 for both people).
 */
import { COMPLEMENTARY_SIDES, INVESTOR_ORG_HINT, INVESTOR_ROLE_HINT, ROLE_SIDE_HINTS, SIDE_ALIASES } from "../data/people.js";
import { keywords, tokenWeight } from "../text/keywords.js";
import { cmp, findSensitive, orgKey, plain } from "../text/normalise.js";
import { assertSafeId, InputError } from "./errors.js";

export interface Guest {
  id: string; name?: string; organisation?: string; role?: string; side?: string; tags?: string[]; asks?: string[]; offers?: string[];
  member?: boolean; thin?: boolean;
}
export interface PairInput {
  event?: { name?: string; starts_at?: string };
  guests: Guest[];
  avoid_pairs?: [string, string][];
  exclude_ids?: string[];
  options?: { max_per_person?: number; backups?: boolean; allow_trio?: boolean; mode?: "match" | "host_buddy" };
}
export interface Basis { ask_offer: { asker: string; offerer: string; keywords: string[] }[]; shared_tags: string[]; complementary: string | null }
export interface Group { group: number; ids: string[]; score: number; strength: "strong" | "medium" | "weak"; basis: Basis; reason_hint: string }

export const SCORING = {
  ask_offer_weight: 3, shared_tag_weight: 1, shared_tag_cap: 2, complementary_weight: 1, thin_penalty: 0.5,
  strong: "score ≥ 5 with an ask↔offer match", medium: "score ≥ 2.5", weak: "below 2.5",
} as const;

const compKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const COMP = new Set(COMPLEMENTARY_SIDES.map(([a, b]) => compKey(a, b)));
const r2 = (x: number) => Math.round(x * 100) / 100;

function canonicalSide(side: string | undefined, role: string | undefined, org: string | undefined): string | null {
  if (side) {
    const p = plain(side);
    if (SIDE_ALIASES[p]) return SIDE_ALIASES[p];
    for (const w of p.split(" ")) if (SIDE_ALIASES[w]) return SIDE_ALIASES[w];
    return null;
  }
  const r = role ?? "";
  for (const [re, s] of ROLE_SIDE_HINTS) if (re.test(r)) return s;
  if (INVESTOR_ROLE_HINT.test(r) && INVESTOR_ORG_HINT.test(org ?? "")) return "investor";
  return null;
}

export function pairAttendees(input: PairInput) {
  const opt = {
    max_per_person: input.options?.max_per_person ?? 3, backups: input.options?.backups ?? true,
    allow_trio: input.options?.allow_trio ?? true, mode: input.options?.mode ?? "match",
  };
  const warnings: string[] = [];
  // ---- validate ids ----
  const firstIndex = new Map<string, number>();
  input.guests.forEach((g, i) => {
    const id = String(g.id ?? "").trim();
    if (!id) throw new InputError(`guests[${i}].id is missing`);
    assertSafeId(id, `guests[${i}].id`);
    if (g.name) assertSafeId(g.name, `guests[${i}].name`);
    const j = firstIndex.get(id);
    if (j !== undefined) throw new InputError(`guests[${i}].id '${id}' is duplicated (also guests[${j}].id); every guest needs a unique id`);
    firstIndex.set(id, i);
  });
  // Trimmed exactly like guest ids, so "E " and "E" are the same guest.
  const exclude = new Set((input.exclude_ids ?? []).map((x) => String(x ?? "").trim()).filter(Boolean));
  const unknownExcl = [...exclude].filter((id) => !firstIndex.has(id));
  if (unknownExcl.length) warnings.push(`${unknownExcl.length} exclude_ids are not in guests and were ignored.`);
  const removed = input.guests.map((g) => String(g.id).trim()).filter((id) => exclude.has(id)).sort(cmp);

  // Deterministic order: by id (code-unit order), independent of input order.
  const G = input.guests.filter((g) => !exclude.has(String(g.id).trim())).map((g) => ({ ...g, id: String(g.id).trim() })).sort((a, b) => cmp(a.id, b.id));
  const n = G.length;
  const idx = new Map(G.map((g, i) => [g.id, i]));

  // ---- features ----
  const tokId = new Map<string, number>();
  const tokName: string[] = [];
  const tid = (t: string) => { let k = tokId.get(t); if (k === undefined) { k = tokName.length; tokId.set(t, k); tokName.push(t); } return k; };
  const asks = G.map((g) => keywords(g.asks ?? []).map(tid));
  const offers = G.map((g) => keywords(g.offers ?? []).map(tid));
  const tagDisplay = new Map<string, string>();
  const tags = G.map((g) => [...new Set((g.tags ?? []).filter((t) => !findSensitive(t).length).map((t) => {
    const k = plain(t); if (k && !tagDisplay.has(k)) tagDisplay.set(k, t.trim()); return k;
  }).filter(Boolean))]);
  const weights = () => Float32Array.from(tokName, (t) => tokenWeight(t));
  const orgs = G.map((g) => orgKey(g.organisation));
  const sides = G.map((g) => canonicalSide(g.side, g.role, g.organisation));
  const sideNames = [...new Set(sides.filter((x): x is string => !!x))].sort(cmp);
  const K = sideNames.length;
  const sideId = Int16Array.from(sides, (x) => (x ? sideNames.indexOf(x) : -1));
  const compTable = new Uint8Array(K * K);
  for (let x = 0; x < K; x++) for (let y = 0; y < K; y++) compTable[x * K + y] = COMP.has(compKey(sideNames[x], sideNames[y])) ? 1 : 0;
  const thin = G.map((g, i) => (g.thin ?? false) || (!asks[i].length && !offers[i].length));
  const member = G.map((g) => g.member === true);
  const first = (i: number) => (G[i].name ?? G[i].id).trim().split(/\s+/)[0];

  // ---- hard rules ----
  const BLOCK_SAME_ORG = 1, BLOCK_AVOID = 2;
  const blocked = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) blocked[i * n + i] = 3;
  const orgGroups = new Map<string, number[]>();
  orgs.forEach((o, i) => { if (o) orgGroups.set(o, [...(orgGroups.get(o) ?? []), i]); });
  for (const ms of orgGroups.values()) for (const a of ms) for (const b of ms) if (a !== b) blocked[a * n + b] = BLOCK_SAME_ORG;
  const avoidUsed: [string, string][] = [];
  (input.avoid_pairs ?? []).forEach((p, k) => {
    const [x, y] = [String(p[0]).trim(), String(p[1]).trim()];
    const a = idx.get(x), b = idx.get(y);
    if (a === undefined || b === undefined) {
      if (!exclude.has(x) && !exclude.has(y)) warnings.push(`avoid_pairs[${k}] names an id that is not a guest; ignored.`);
      return;
    }
    if (a === b) return;
    if (!blocked[a * n + b]) { blocked[a * n + b] = blocked[b * n + a] = BLOCK_AVOID; avoidUsed.push(x < y ? [x, y] : [y, x]); }
  });
  const viable = (a: number, b: number) => blocked[a * n + b] === 0;

  // ---- scores ----
  const w = weights();
  const dir = new Float32Array(n * n);
  const offerers: number[][] = tokName.map(() => []);
  offers.forEach((ts, b) => ts.forEach((t) => offerers[t].push(b)));
  asks.forEach((ts, a) => { for (const t of ts) for (const b of offerers[t]) if (b !== a) dir[a * n + b] += w[t]; });
  const tagShared = new Uint8Array(n * n);
  const tagMembers = new Map<string, number[]>();
  tags.forEach((ts, i) => ts.forEach((t) => tagMembers.set(t, [...(tagMembers.get(t) ?? []), i])));
  for (const ms of tagMembers.values()) for (const a of ms) for (const b of ms) if (a !== b && tagShared[a * n + b] < 255) tagShared[a * n + b]++;
  const score = new Float32Array(n * n);
  const aoArr = new Float32Array(n * n);
  const posCount = new Int32Array(n), viableCount = new Int32Array(n);
  const goodCount = new Int32Array(n), goodSum = new Float64Array(n);
  const thinW = Float32Array.from(thin, (t) => (t ? SCORING.thin_penalty : 0));
  const AOW = SCORING.ask_offer_weight, TAGW = SCORING.shared_tag_weight, TAGCAP = SCORING.shared_tag_cap, CW = SCORING.complementary_weight;
  for (let a = 0; a < n; a++) {
    const sa = sideId[a], rowA = a * n;
    for (let b = a + 1; b < n; b++) {
      const k = rowA + b, kb = b * n + a;
      if (blocked[k]) { score[k] = score[kb] = -1e9; continue; }
      const d1 = dir[k], d2 = dir[kb];
      const ao = AOW * ((d1 < 1 ? d1 : 1) + (d2 < 1 ? d2 : 1));
      const ts = tagShared[k];
      const st = (ts < TAGCAP ? ts : TAGCAP) * TAGW;
      const sb = sideId[b];
      const cp = sa >= 0 && sb >= 0 && compTable[sa * K + sb] ? CW : 0;
      const s = ao + st + cp - thinW[a] - thinW[b];
      score[k] = score[kb] = s;
      aoArr[k] = aoArr[kb] = ao;
      viableCount[a]++; viableCount[b]++;
      if (ao + st > 0) { posCount[a]++; posCount[b]++; }
      if (ao >= 3) { goodCount[a]++; goodCount[b]++; goodSum[a] += s; goodSum[b] += s; }
    }
  }
  const S = (a: number, b: number) => score[a * n + b];
  const aoOf = (a: number, b: number) => aoArr[a * n + b];
  const hardness = (i: number) => (posCount[i] === 0 ? 1e6 + viableCount[i] : posCount[i] * 1e4 + viableCount[i]);
  const order = [...Array(n).keys()].sort((a, b) => hardness(a) - hardness(b) || a - b);

  // ---- primary groups ----
  const groupOf = new Int32Array(n).fill(-1);
  const groups: number[][] = [];
  const unmatched: { id: string; reason: string }[] = [];
  const addGroup = (ms: number[]) => { const gi = groups.length; groups.push(ms); ms.forEach((m) => (groupOf[m] = gi)); return gi; };

  if (opt.mode === "host_buddy") {
    const hosts = order.filter((i) => member[i]), buddies = order.filter((i) => !member[i]);
    if (!hosts.length) warnings.push("host_buddy mode needs guests marked member: true; none were, so nobody could host.");
    const hostGroup = new Map<number, number>();
    for (const round of [1, 2]) {
      for (const nb of buddies) {
        if (groupOf[nb] >= 0) continue;
        let best = -1;
        for (const h of hosts) {
          const gi = hostGroup.get(h);
          const size = gi === undefined ? 1 : groups[gi].length;
          if (size > round || !viable(nb, h) || (gi !== undefined && groups[gi].some((m) => m !== h && !viable(nb, m)))) continue;
          if (best < 0 || S(nb, h) > S(nb, best) || (S(nb, h) === S(nb, best) && h < best)) best = h;
        }
        if (best < 0) continue;
        const gi = hostGroup.get(best);
        if (gi === undefined) hostGroup.set(best, addGroup([best, nb]));
        else { groups[gi].push(nb); groupOf[nb] = gi; }
      }
    }
    for (const nb of buddies) if (groupOf[nb] < 0) unmatched.push({ id: G[nb].id, reason: hosts.length ? "no member host left from a different organisation; host places at door" : "no member hosts in the guest list" });
    for (const h of hosts) if (groupOf[h] < 0) unmatched.push({ id: G[h].id, reason: "member not needed as a host (more members than non-members); pair members separately in match mode" });
  } else {
    const hard = Float64Array.from({ length: n }, (_v, i) => hardness(i));
    for (const a of order) {
      if (groupOf[a] >= 0) continue;
      let best = -1, bestS = -Infinity;
      const row = a * n;
      for (let b = 0; b < n; b++) {
        if (groupOf[b] >= 0 || blocked[row + b] !== 0) continue;
        const s = score[row + b];
        if (s > bestS || (s === bestS && (hard[b] < hard[best] || (hard[b] === hard[best] && b < best)))) { best = b; bestS = s; }
      }
      if (best >= 0) addGroup([a, best]);
    }
    // Repair: two leftovers who can't meet each other swap into an existing pair.
    let left = order.filter((i) => groupOf[i] < 0);
    for (let x = 0; x < left.length; x++) {
      for (let y = x + 1; y < left.length; y++) {
        const r1 = left[x], r2_ = left[y];
        if (groupOf[r1] >= 0 || groupOf[r2_] >= 0) continue;
        let bestG = -1, bestGain = -Infinity, cross = false;
        groups.forEach((g, gi) => {
          if (g.length !== 2) return;
          const [p, q] = g;
          if (viable(r1, p) && viable(r2_, q)) { const s = S(r1, p) + S(r2_, q); if (s > bestGain) { bestGain = s; bestG = gi; cross = false; } }
          if (viable(r1, q) && viable(r2_, p)) { const s = S(r1, q) + S(r2_, p); if (s > bestGain) { bestGain = s; bestG = gi; cross = true; } }
        });
        if (bestG < 0) continue;
        const [p, q] = groups[bestG];
        groups[bestG] = cross ? [r1, q] : [r1, p];
        groupOf[r1] = bestG;
        addGroup(cross ? [r2_, p] : [r2_, q]);
      }
    }
    left = order.filter((i) => groupOf[i] < 0);
    for (const r of left) {
      if (!opt.allow_trio) { unmatched.push({ id: G[r].id, reason: "odd one out and trios are off; host places at door" }); continue; }
      let bestG = -1, bestFit = -Infinity;
      groups.forEach((g, gi) => {
        if (g.length !== 2 || !g.every((m) => viable(r, m))) return;
        const fit = S(r, g[0]) + S(r, g[1]);
        if (fit > bestFit) { bestFit = fit; bestG = gi; }
      });
      if (bestG < 0) unmatched.push({ id: G[r].id, reason: "no viable partner: everyone left is from the same organisation or on the avoid list; host places at door" });
      else { groups[bestG].push(r); groupOf[r] = bestG; }
    }
  }

  // ---- backups (second pass) ----
  const load = new Int32Array(n);
  groups.forEach((g) => g.forEach((m) => (load[m] = 1)));
  const backup = new Int32Array(n).fill(-1);
  const backupNote = new Map<number, string>();
  const placed = order.filter((i) => groupOf[i] >= 0);
  const canBackup = (a: number, b: number) => a !== b && viable(a, b) && groupOf[a] !== groupOf[b] && groupOf[b] >= 0;
  const wantsBackup = (i: number) => opt.mode !== "host_buddy" || !member[i];
  if (!opt.backups) placed.forEach((i) => backupNote.set(i, "backups are off"));
  else if (opt.max_per_person < 2) placed.forEach((i) => backupNote.set(i, "max_per_person is 1, so no backups"));
  else {
    const eligible = (i: number) => wantsBackup(i) && backup[i] < 0;
    if (opt.mode !== "host_buddy") {
      // Mutual backups first: one link serves both people, using one introduction each.
      const cap = opt.max_per_person;
      for (const a of placed) {
        if (backup[a] >= 0 || load[a] >= cap) continue;
        let best = -1, bestS = -Infinity;
        const row = a * n, ga = groupOf[a];
        for (const b of placed) {
          if (backup[b] >= 0 || load[b] >= cap || blocked[row + b] !== 0 || groupOf[b] === ga) continue;
          const s = score[row + b];
          if (s > bestS || (s === bestS && b < best)) { best = b; bestS = s; }
        }
        if (best >= 0) { backup[a] = best; backup[best] = a; load[a]++; load[best]++; }
      }
    }
    for (const a of placed) {
      if (!eligible(a)) { if (!wantsBackup(a)) backupNote.set(a, "host (members host their buddies)"); continue; }
      let best = -1;
      for (const b of placed) {
        if (!canBackup(a, b) || load[b] >= opt.max_per_person || load[a] >= opt.max_per_person) continue;
        if (opt.mode === "host_buddy" && !member[b]) continue;
        if (best < 0 || S(a, b) > S(a, best) || (S(a, b) === S(a, best) && b < best)) best = b;
      }
      if (best >= 0) { backup[a] = best; load[a]++; load[best]++; }
      else backupNote.set(a, "host places at door (no viable backup under the cap)");
    }
  }

  // ---- describe ----
  const display = (t: number) => tokName[t];
  const overlap = (a: number, b: number) => asks[a].filter((t) => offers[b].includes(t)).map(display);
  const basisFor = (ms: number[]): Basis => {
    const ask_offer: Basis["ask_offer"] = [];
    const shared = new Set<string>();
    const comp: string[] = [];
    for (const a of ms) for (const b of ms) {
      if (a === b) continue;
      const kw = overlap(a, b);
      if (kw.length) ask_offer.push({ asker: G[a].id, offerer: G[b].id, keywords: kw });
      if (a < b) {
        tags[a].filter((t) => tags[b].includes(t)).forEach((t) => shared.add(tagDisplay.get(t) ?? t));
        if (sides[a] && sides[b] && COMP.has(compKey(sides[a]!, sides[b]!))) comp.push(`${sides[a]}↔${sides[b]}`);
      }
    }
    return { ask_offer, shared_tags: [...shared], complementary: comp.length ? [...new Set(comp)].join("; ") : null };
  };
  const hintFor = (ms: number[], basis: Basis) => {
    const parts = basis.ask_offer.slice(0, 2).map((e) => `${first(idx.get(e.asker)!)} wants ${e.keywords.slice(0, 3).join(", ")}; ${first(idx.get(e.offerer)!)} offers it`);
    if (!parts.length && basis.shared_tags.length) parts.push(`Both: ${basis.shared_tags.slice(0, 3).join(", ")}`);
    if (basis.complementary) parts.push(`(${basis.complementary})`);
    if (!parts.length) return `Little stated overlap; introduce by role${ms.some((m) => thin[m]) ? " (thin profile: confirm at the door)" : ""}`;
    return parts.join(". ");
  };
  const strengthOf = (s: number, ao: number): Group["strength"] => (s >= 5 && ao >= 3 ? "strong" : s >= 2.5 ? "medium" : "weak");
  const out: Group[] = groups.map((ms) => {
    const pairs: [number, number][] = [];
    for (let x = 0; x < ms.length; x++) for (let y = x + 1; y < ms.length; y++) pairs.push([ms[x], ms[y]]);
    const s = pairs.reduce((t, [a, b]) => t + S(a, b), 0) / pairs.length;
    const ao = Math.max(...pairs.map(([a, b]) => aoOf(a, b)));
    const basis = basisFor(ms);
    return { group: 0, ids: [...ms].sort((a, b) => a - b).map((m) => G[m].id), score: r2(s), strength: strengthOf(s, ao), basis, reason_hint: hintFor(ms, basis) };
  });
  const rankS = { strong: 0, medium: 1, weak: 2 } as const;
  out.sort((a, b) => rankS[a.strength] - rankS[b.strength] || b.score - a.score || cmp(a.ids[0], b.ids[0]));
  out.forEach((g, i) => (g.group = i + 1));

  const backups: Record<string, string | null> = {};
  const backup_notes: Record<string, string> = {};
  for (const i of [...placed].sort((a, b) => a - b)) {
    backups[G[i].id] = backup[i] >= 0 ? G[backup[i]].id : null;
    if (backup[i] < 0 && backupNote.has(i)) backup_notes[G[i].id] = backupNote.get(i)!;
  }
  const connectors_top5 = [...Array(n).keys()]
    .map((i) => ({ i, good: goodCount[i], sum: goodSum[i] }))
    .filter((c) => c.good > 0)
    .sort((a, b) => b.good - a.good || b.sum - a.sum || a.i - b.i)
    .slice(0, 5)
    .map((c) => ({ id: G[c.i].id, good_matches: c.good, offers: [...new Set(offers[c.i].map(display))].slice(0, 4) }));
  const same_org = [...orgGroups.entries()].filter(([, ms]) => ms.length > 1)
    .map(([, ms]) => ({ organisation: (G[ms[0]].organisation ?? "").trim(), ids: ms.map((m) => G[m].id) }))
    .sort((a, b) => cmp(a.organisation, b.organisation));
  const guests: Record<string, { name: string; organisation: string; org_key: string; member: boolean; thin: boolean }> = {};
  G.forEach((g, i) => (guests[g.id] = { name: (g.name ?? g.id).trim(), organisation: (g.organisation ?? "").trim(), org_key: orgs[i], member: member[i], thin: thin[i] }));
  unmatched.sort((a, b) => cmp(a.id, b.id));
  const counts = { strong: 0, medium: 0, weak: 0 };
  out.forEach((g) => counts[g.strength]++);
  return {
    event: { name: input.event?.name ?? "", starts_at: input.event?.starts_at ?? "" },
    options: opt,
    groups: out,
    backups,
    backup_notes,
    unmatched,
    excluded: { same_org, avoid: avoidUsed, removed },
    connectors_top5,
    describe_org_neutrally: G.filter((g) => findSensitive(g.organisation).length).map((g) => g.id),
    guests,
    stats: {
      guests_in: input.guests.length, considered: n, placed: placed.length, groups: out.length,
      pairs: out.filter((g) => g.ids.length === 2).length, trios: out.filter((g) => g.ids.length === 3).length,
      unmatched: unmatched.length, with_backup: Object.values(backups).filter(Boolean).length,
      without_backup: Object.values(backups).filter((v) => !v).length, ...counts, thin_profiles: thin.filter(Boolean).length,
      same_org_blocked: same_org.reduce((s, g) => s + (g.ids.length * (g.ids.length - 1)) / 2, 0), avoid_blocked: avoidUsed.length,
    },
    scoring: SCORING,
    warnings,
  };
}
export type PairOutput = ReturnType<typeof pairAttendees>;
