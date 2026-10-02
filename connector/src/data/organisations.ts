/**
 * Organisation-name data. Matching keys strip MATCH_SUFFIXES from the end (repeatedly); the
 * displayed name strips only DISPLAY_SUFFIXES (formal legal forms), so "Out & Proud Travel Co"
 * keeps its "Co" on screen but still matches "Out & Proud Travel Company".
 */

/** Formal legal forms removed from the displayed organisation name (DESIGN §4.2). */
export const DISPLAY_SUFFIXES: readonly string[] = [
  "ltd", "limited", "inc", "incorporated", "llc", "llp", "plc", "gmbh", "pty ltd", "pty",
];

/** Words removed from the end of the matching key. Never applied if it would leave the key empty. */
export const MATCH_SUFFIXES: readonly string[] = [
  ...DISPLAY_SUFFIXES,
  "corp", "corporation", "co", "company", "bv", "nv", "ag", "sa", "sas", "sarl", "srl", "oy", "ab", "aps", "pte", "cic", "ug", "kk",
];

/** Words removed from the start of the matching key. */
export const MATCH_PREFIXES: readonly string[] = ["the"];
