/** Keyword extraction for ask↔offer overlap. Deterministic; driven by src/data/keywords.ts. */
import { KEEP_TRAILING_S, PHRASES, STOPWORDS, SYNONYM_GROUPS, WEAK_TOKENS } from "../data/keywords.js";
import { SENSITIVE_TERMS } from "../data/sensitive-terms.js";
import { plain } from "./normalise.js";

const stop = new Set(STOPWORDS);
const weak = new Set(WEAK_TOKENS);
const keepS = new Set(KEEP_TRAILING_S);
const synonym = new Map<string, string>();
for (const [concept, variants] of Object.entries(SYNONYM_GROUPS)) {
  synonym.set(concept, concept);
  for (const v of variants) synonym.set(v, concept);
}
const phraseKeys = Object.keys(PHRASES).sort((a, b) => b.length - a.length);
const phraseRe = new RegExp(`(?:^| )(${phraseKeys.map((p) => p.replace(/ /g, " ")).join("|")})(?= |$)`, "g");
const sensitiveWords = new Set<string>();
const sensitivePhrases: string[] = [];
for (const terms of Object.values(SENSITIVE_TERMS)) {
  for (const t of terms) {
    const p = plain(t);
    if (p.includes(" ")) sensitivePhrases.push(p); else sensitiveWords.add(p);
  }
}
const sensitivePhraseRe = new RegExp(`(?:^| )(${sensitivePhrases.sort((a, b) => b.length - a.length).join("|")})(?= |$)`, "g");

/** Singular form of an English word (simple rules; exceptions in KEEP_TRAILING_S). */
export function singular(w: string): string {
  if (w.length <= 3 || keepS.has(w)) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (/(xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Concept tokens in a piece of text: phrases folded, stopwords and sensitive terms dropped, synonyms mapped. */
export function keywords(text: string | readonly string[] | null | undefined): string[] {
  if (!text) return [];
  const src = Array.isArray(text) ? text.join(" ; ") : String(text);
  let p = plain(src);
  if (!p) return [];
  p = p.replace(sensitivePhraseRe, " ");
  p = p.replace(phraseRe, (_m, ph: string) => ` ${PHRASES[ph]}`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of p.split(" ")) {
    if (!raw || raw.length < 2 || /^\d+$/.test(raw) || stop.has(raw) || sensitiveWords.has(raw)) continue;
    const s = singular(raw);
    if (stop.has(s) || sensitiveWords.has(s)) continue;
    const c = synonym.get(s) ?? synonym.get(raw) ?? s;
    if (stop.has(c) || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Weight of a token in overlap scoring (broad words count half). */
export const tokenWeight = (t: string): number => (weak.has(t) ? 0.5 : 1);
