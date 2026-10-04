/**
 * Opt-out and removal signals in a free-text ledger note (guardrails §12), table-driven from
 * src/data/consent-signals.ts. The note is never attributed to a person here: the caller holds both
 * people of the row when it cannot tell. Returns the ids of the rules that fired, never note text.
 * Work per note is capped (MAX_NOTE_CHARS, MAX_NOTE_CLAUSES) and reported as `truncated`.
 */
import {
  ACTIONED_RE, ANY_SIGNAL_STEM, BE_PARTICIPLE, CLAUSE_SPLIT, CONTACT_TERMS, MAX_NOTE_CHARS, MAX_NOTE_CLAUSES, NOTE_REWRITES, OPT_OUT_SIGNALS, REMOVAL_SIGNALS,
  REPORTING_WORDS, SIGNAL_CANCELLERS, STOPPED_REPORTING, STOP_KEYWORD, STRONG_REFUSALS, WEAK_NEGATORS, WISH_WORDS,
} from "../data/consent-signals.js";
import { APOSTROPHES, fold } from "./normalise.js";

export interface ConsentSignals { opt_out: string[]; removal: string[]; truncated: boolean }

/** Clauses of a note as padded word strings: lowercase, accents and apostrophes gone, other punctuation a space. */
export function noteClauses(note: string): { clauses: string[]; truncated: boolean } {
  let truncated = note.length > MAX_NOTE_CHARS;
  let text = fold(truncated ? note.slice(0, MAX_NOTE_CHARS) : note).replace(APOSTROPHES, "").replace(/&/g, " and ");
  for (const [re, to] of NOTE_REWRITES) text = text.replace(re, to);
  const out: string[] = [];
  for (const raw of text.split(CLAUSE_SPLIT)) {
    const words = raw.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!words) continue;
    if (out.length >= MAX_NOTE_CLAUSES) { truncated = true; break; }
    out.push(` ${words} `);
  }
  return { clauses: out, truncated };
}

/**
 * The lexical net: a contact term with a refusal in the same clause. A strong refusal (an instruction or
 * wish: "no further contact", "do not contact", "should not be contacted") always counts, even in a clause
 * that also reports something ("she has moved abroad"). The reporting exemption only softens WEAK
 * negations, so "no reply to my email" and "never contacted" stay silent.
 */
export function contactRefusal(clause: string): boolean {
  clause = clause.replace(STOPPED_REPORTING, " ");
  if (!CONTACT_TERMS.test(clause)) return false;
  if (STRONG_REFUSALS.test(clause)) return true;
  const wish = WISH_WORDS.test(clause);
  if (!wish && REPORTING_WORDS.test(clause)) return false;
  return WEAK_NEGATORS.test(clause) && (wish || BE_PARTICIPLE.test(clause));
}

export function findConsentSignals(note: string | null | undefined): ConsentSignals {
  const optOut = new Set<string>(), removal = new Set<string>();
  if (!note) return { opt_out: [], removal: [], truncated: false };
  if (STOP_KEYWORD.test(note.slice(0, MAX_NOTE_CHARS))) optOut.add("stop_keyword");
  const { clauses, truncated } = noteClauses(note);
  const seen = new Set<string>();
  for (let clause of clauses) {
    if (seen.has(clause) || !ANY_SIGNAL_STEM.test(clause)) continue;
    seen.add(clause);
    for (const re of SIGNAL_CANCELLERS) clause = clause.replace(re, " ");
    for (const s of OPT_OUT_SIGNALS) if (s.re.test(clause)) optOut.add(s.id);
    if (contactRefusal(clause)) optOut.add("contact_refusal");
    for (const s of REMOVAL_SIGNALS) if (s.re.test(clause)) removal.add(s.id);
  }
  return { opt_out: [...optOut], removal: [...removal], truncated };
}

export const hasConsentSignal = (note: string | null | undefined): boolean => { const s = findConsentSignals(note); return s.opt_out.length > 0 || s.removal.length > 0; };
export const isActioned = (note: string | null | undefined): boolean => !!note && ACTIONED_RE.test(note.slice(0, MAX_NOTE_CHARS));
