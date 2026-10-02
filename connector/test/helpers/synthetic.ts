/** Deterministic synthetic guests for load tests (mulberry32 PRNG; no real people). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIRST = ["Ada", "Bram", "Cleo", "Dara", "Eli", "Fen", "Gus", "Hana", "Ivo", "Juno", "Kit", "Lior", "Mae", "Nico", "Oona", "Pip", "Quin", "Rory", "Suki", "Tam"];
const LAST = ["Arden", "Birch", "Calder", "Dune", "Ember", "Frost", "Glen", "Heath", "Isle", "Jory", "Kestrel", "Linden", "Moss", "Noble", "Orchard", "Pike"];
const ASKS = ["seed investors", "angel investor", "help hiring engineers", "first customers in retail", "pilot sites in manufacturing", "grant funding",
  "legal advice on contracts", "a fractional CFO", "climate data buyers", "NHS procurement contacts", "brand refresh", "security review", "speaking slots", "venue for events"];
const OFFERS = ["seed funding", "angel cheques", "recruitment for startups", "retail buyer introductions", "factory pilot sites", "grant writing",
  "contract templates", "interim CFO work", "carbon accounting", "clinical advice", "brand strategy", "penetration testing", "speaker booking", "event space"];
const SIDES = ["founder", "investor", "operator", "advisor", "corporate"];
const TAGS = ["fintech", "climate", "health", "retail", "ai", "manufacturing", "education", "property"];
export function syntheticGuests(n: number, seed = 42) {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const orgs = Array.from({ length: Math.ceil(n / 3) }, (_v, i) => `Org ${i} ${pick(["Ltd", "Labs", "Partners", "Co", ""])}`.trim());
  return Array.from({ length: n }, (_v, i) => {
    const thin = r() < 0.08;
    return {
      id: `g${String(i).padStart(4, "0")}`, name: `${pick(FIRST)} ${pick(LAST)} ${i}`, organisation: r() < 0.05 ? "" : pick(orgs),
      role: pick(["Founder", "CEO", "Partner", "Head of Ops", "Engineer"]), side: pick(SIDES),
      tags: thin ? [] : [pick(TAGS), pick(TAGS)], asks: thin ? [] : [pick(ASKS), pick(ASKS)], offers: thin ? [] : [pick(OFFERS)],
      member: r() < 0.8, thin,
    };
  });
}
