/** The data tables (aliases, synonyms, sensitive terms, email domains …) are consistent. */
import { describe, expect, it } from "vitest";
import { KEEP_TRAILING_S, PHRASES, STOPWORDS, SYNONYM_GROUPS, WEAK_TOKENS } from "../src/data/keywords.js";
import { SENSITIVE_TERMS } from "../src/data/sensitive-terms.js";
import { DOMAIN_ALIASES, DOTLESS_DOMAINS, PERSONAL_EMAIL_DOMAINS, ROLE_LOCAL_PARTS } from "../src/data/email-domains.js";
import { DISPLAY_SUFFIXES, MATCH_SUFFIXES } from "../src/data/organisations.js";
import { COMPLEMENTARY_SIDES, NICKNAME_GROUPS, SIDE_ALIASES } from "../src/data/people.js";
import { ASKS_PRECEDENCE, IDENTITY_PRECEDENCE, OPT_IN_NO, OPT_IN_YES, SOURCE_KINDS, STATUS_VALUES } from "../src/data/sources.js";
import { BROADCAST_PHRASES, VAGUE_CHECKIN_PHRASES } from "../src/data/messages.js";
import { RECOMMENDED_TOUCH, SEGMENT_RULES, SEGMENTS } from "../src/data/segments.js";
import { CANONICAL_FIELDS, GENERIC_ALIASES } from "../src/fields/aliases.js";
import { PLATFORMS } from "../src/fields/platforms.js";
import { plain } from "../src/text/normalise.js";

const lower = (xs: readonly string[]) => xs.every((x) => x === x.toLowerCase() && x.trim() === x && x.length > 0);

describe("keyword tables", () => {
  it("no variant appears in two synonym groups", () => {
    const seen = new Map<string, string>();
    for (const [g, vs] of Object.entries(SYNONYM_GROUPS)) for (const v of vs) {
      expect(seen.has(v) && seen.get(v) !== g, `'${v}' is in ${seen.get(v)} and ${g}`).toBe(false);
      seen.set(v, g);
    }
  });
  it("stopwords never hide a concept", () => {
    const stop = new Set(STOPWORDS);
    for (const [g, vs] of Object.entries(SYNONYM_GROUPS)) { expect(stop.has(g)).toBe(false); for (const v of vs) expect(stop.has(v), v).toBe(false); }
    for (const w of WEAK_TOKENS) expect(stop.has(w), w).toBe(false);
  });
  it("phrases fold to real tokens and every table is lowercase", () => {
    for (const [p, t] of Object.entries(PHRASES)) { expect(p).toBe(plain(p)); expect(t).toMatch(/^[a-z0-9]+$/); }
    expect(lower(STOPWORDS) && lower(WEAK_TOKENS) && lower(KEEP_TRAILING_S)).toBe(true);
  });
  it("hire/hiring/recruit and raise/raising/fundraising/investors share a concept", () => {
    expect(SYNONYM_GROUPS.hiring).toEqual(expect.arrayContaining(["hire", "hiring", "recruit"]));
    expect(SYNONYM_GROUPS.funding).toEqual(expect.arrayContaining(["raise", "raising", "fundraising", "investor"]));
  });
});

describe("sensitive terms", () => {
  it("covers the six categories in DESIGN.md §3 and is lowercase", () => {
    expect(Object.keys(SENSITIVE_TERMS).sort()).toEqual(["disability", "ethnicity", "health", "politics", "religion", "sexuality"]);
    for (const ts of Object.values(SENSITIVE_TERMS)) expect(lower(ts)).toBe(true);
  });
  it("does not list sector words that are professional context", () => {
    const all = new Set(Object.values(SENSITIVE_TERMS).flat());
    for (const w of ["health", "healthcare", "clinical", "medical", "care", "wellbeing", "pharmacy", "travel", "finance"]) expect(all.has(w), w).toBe(false);
  });
});

describe("email, organisation and people tables", () => {
  it("personal domains are lowercase domains, aliases and dotless rules are consistent", () => {
    expect(lower(PERSONAL_EMAIL_DOMAINS)).toBe(true);
    for (const d of PERSONAL_EMAIL_DOMAINS) expect(d).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    for (const d of ["gmail.com", "outlook.com", "icloud.com", "hotmail.com", "yahoo.com", "proton.me"]) expect(PERSONAL_EMAIL_DOMAINS).toContain(d);
    for (const d of DOTLESS_DOMAINS) expect(PERSONAL_EMAIL_DOMAINS).toContain(d);
    for (const [a, b] of Object.entries(DOMAIN_ALIASES)) { expect(PERSONAL_EMAIL_DOMAINS).toContain(a); expect(PERSONAL_EMAIL_DOMAINS).toContain(b); }
    expect(PERSONAL_EMAIL_DOMAINS).not.toContain("example.com");
    expect(lower(ROLE_LOCAL_PARTS)).toBe(true);
  });
  it("legal suffixes include the DESIGN list and display suffixes are a subset of match suffixes", () => {
    for (const s of ["ltd", "limited", "inc", "llc", "llp", "plc", "gmbh"]) expect(DISPLAY_SUFFIXES).toContain(s);
    for (const s of DISPLAY_SUFFIXES) expect(MATCH_SUFFIXES).toContain(s);
  });
  it("nickname groups are lowercase with no name in two groups; sides are canonical", () => {
    const seen = new Set<string>();
    for (const g of NICKNAME_GROUPS) for (const n of g) { expect(n).toBe(n.toLowerCase()); expect(seen.has(n), n).toBe(false); seen.add(n); }
    const sides = new Set(Object.values(SIDE_ALIASES));
    for (const [a, b] of COMPLEMENTARY_SIDES) { expect(sides.has(a)).toBe(true); expect(sides.has(b)).toBe(true); }
  });
});

describe("source, status and consent vocabularies", () => {
  it("every source kind has a place in both precedence lists", () => {
    for (const k of new Set(Object.values(SOURCE_KINDS))) { expect(IDENTITY_PRECEDENCE).toContain(k); expect(ASKS_PRECEDENCE).toContain(k); }
    expect(IDENTITY_PRECEDENCE.indexOf("crm")).toBeLessThan(IDENTITY_PRECEDENCE.indexOf("form"));
    expect(IDENTITY_PRECEDENCE.indexOf("form")).toBeLessThan(IDENTITY_PRECEDENCE.indexOf("chat"));
    expect(ASKS_PRECEDENCE.indexOf("form")).toBeLessThan(ASKS_PRECEDENCE.indexOf("notes"));
    expect(ASKS_PRECEDENCE.indexOf("notes")).toBeLessThan(ASKS_PRECEDENCE.indexOf("chat"));
  });
  it("opt-in yes and no never overlap, and bare 1/0 are in neither", () => {
    const yes = new Set(OPT_IN_YES);
    for (const n of OPT_IN_NO) expect(yes.has(n), n).toBe(false);
    for (const v of ["1", "0"]) { expect(OPT_IN_YES).not.toContain(v); expect(OPT_IN_NO).not.toContain(v); }
    expect(new Set(Object.values(STATUS_VALUES))).toEqual(new Set(["member", "lapsed", "prospect", "guest"]));
  });
  it("message phrases are lowercase; every segment has a rule and a recommended touch", () => {
    expect(lower(BROADCAST_PHRASES) && lower(VAGUE_CHECKIN_PHRASES)).toBe(true);
    for (const s of SEGMENTS) { expect(SEGMENT_RULES[s]).toBeTruthy(); expect(RECOMMENDED_TOUCH[s]).toBeTruthy(); }
  });
});

describe("field alias tables", () => {
  it("every alias and platform override points to a canonical field", () => {
    const fields = new Set<string>(CANONICAL_FIELDS);
    for (const [k, r] of Object.entries(GENERIC_ALIASES)) { expect(fields.has(r.field), `${k} → ${r.field}`).toBe(true); expect(k).toBe(plain(k)); }
    for (const p of PLATFORMS) for (const [k, ov] of Object.entries(p.overrides ?? {})) {
      if (ov.field !== null) expect(fields.has(ov.field), `${p.id}: ${k}`).toBe(true);
      expect(k, `${p.id}: ${k}`).toBe(plain(k));
    }
  });
  it("platform ids are unique and every signature can reach its minimum", () => {
    expect(new Set(PLATFORMS.map((p) => p.id)).size).toBe(PLATFORMS.length);
    for (const p of PLATFORMS) {
      const max = p.signals.reduce((s, x) => s + (x.re ? x.w * 5 : x.w), 0);
      expect(max, p.id).toBeGreaterThanOrEqual(p.min);
      for (const s of p.signals) if (s.h) expect(s.h, `${p.id}`).toBe(plain(s.h));
    }
  });
});
