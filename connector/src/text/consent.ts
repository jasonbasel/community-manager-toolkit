/**
 * Opt-out and removal signals in a free-text ledger note (guardrails §12), table-driven from
 * src/data/consent-signals.ts. The note is never attributed to a person here: the caller holds both
 * people of the row when it cannot tell. Returns the ids of the rules that fired, never note text.
 */
import { ACTIONED_RE, CLAUSE_SPLIT, OPT_OUT_SIGNALS, REMOVAL_SIGNALS, SIGNAL_CANCELLERS } from "../data/consent-signals.js";
import { APOSTROPHES, fold } from "./normalise.js";

export interface ConsentSignals { opt_out: string[]; removal: string[] }

/** Clauses of a note as padded word strings: lowercase, accents and apostrophes gone, other punctuation a space. */
export function noteClauses(note: string): string[] {
  const text = fold(note).replace(APOSTROPHES, "").replace(/&/g, " and ");
  const out: string[] = [];
  for (const raw of text.split(CLAUSE_SPLIT)) {
    const words = raw.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (words) out.push(` ${words} `);
  }
  return out;
}

export function findConsentSignals(note: string | null | undefined): ConsentSignals {
  const optOut = new Set<string>(), removal = new Set<string>();
  if (note) {
    for (let clause of noteClauses(note)) {
      for (const re of SIGNAL_CANCELLERS) clause = clause.replace(re, " ");
      for (const s of OPT_OUT_SIGNALS) if (s.re.test(clause)) optOut.add(s.id);
      for (const s of REMOVAL_SIGNALS) if (s.re.test(clause)) removal.add(s.id);
    }
  }
  return { opt_out: [...optOut], removal: [...removal] };
}

export const hasConsentSignal = (note: string | null | undefined): boolean => { const s = findConsentSignals(note); return s.opt_out.length > 0 || s.removal.length > 0; };
export const isActioned = (note: string | null | undefined): boolean => !!note && ACTIONED_RE.test(note);
