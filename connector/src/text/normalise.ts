/** Text normalisation shared by every tool. Pure functions; no I/O. */
import { DISPLAY_SUFFIXES, MATCH_PREFIXES, MATCH_SUFFIXES } from "../data/organisations.js";
import { DOMAIN_ALIASES, DOTLESS_DOMAINS, PERSONAL_EMAIL_DOMAINS, ROLE_LOCAL_PARTS } from "../data/email-domains.js";
import { SENSITIVE_TERMS } from "../data/sensitive-terms.js";
import { NICKNAME_GROUPS } from "../data/people.js";

/** Lowercase and strip accents. */
export const fold = (s: string): string => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lowercase, accents and punctuation removed, single spaces. "Ifeoma Adeyemi-Brandt" → "ifeoma adeyemi brandt". */
export const plain = (s: string): string => fold(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "professor", "sir", "dame", "lord", "lady", "rev"]);

/** Matching key for a person's name. */
export function nameKey(s: string | null | undefined): string {
  if (!s) return "";
  const toks = plain(s).split(" ").filter(Boolean);
  while (toks.length > 1 && HONORIFICS.has(toks[0])) toks.shift();
  return toks.join(" ");
}

/** Display form: collapse whitespace; title-case only when the whole name is in one case. */
export function tidyName(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters && (letters === letters.toLowerCase() || letters === letters.toUpperCase())) {
    return t.toLowerCase().replace(/(^|[\s\-'’])([a-zà-ÿ])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  }
  return t;
}

const matchSuffixes = new Set(MATCH_SUFFIXES.flatMap((s) => s.split(" ")));
const matchPrefixes = new Set(MATCH_PREFIXES);

/** Matching key for an organisation: case, punctuation, "&" and legal suffixes removed. */
export function orgKey(s: string | null | undefined): string {
  if (!s) return "";
  const toks = plain(s).split(" ").filter(Boolean);
  while (toks.length > 1 && matchPrefixes.has(toks[0])) toks.shift();
  while (toks.length > 1 && (matchSuffixes.has(toks[toks.length - 1]) || toks[toks.length - 1] === "and")) toks.pop();
  return toks.join(" ");
}

const displaySuffixRe = new RegExp(
  `[\\s,]+(?:${[...DISPLAY_SUFFIXES].sort((a, b) => b.length - a.length).map((s) => s.replace(/ /g, "\\s+")).join("|")})\\.?\\s*$`, "i");

/** Displayed organisation name: whitespace tidied, formal legal suffix removed ("Tidewater Robotics Ltd" → "Tidewater Robotics"). */
export function displayOrg(s: string | null | undefined): string {
  if (!s) return "";
  let t = s.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(displaySuffixRe, "").trim();
    if (!next || next === t) break;
    t = next;
  }
  return t;
}

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_FULL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const isEmailLike = (s: string): boolean => EMAIL_FULL.test(s.trim()) || /\S@\S+\.\S/.test(s);

export interface EmailParts { key: string; domain: string; local: string; personal: boolean; role: boolean }
const personalDomains = new Set(PERSONAL_EMAIL_DOMAINS);
const dotless = new Set(DOTLESS_DOMAINS);
const roleLocals = new Set(ROLE_LOCAL_PARTS);

/** Normalised email for matching (lowercase; +tags removed; Gmail dots removed). Null if not an address. */
export function emailParts(s: string | null | undefined): EmailParts | null {
  if (!s) return null;
  const m = s.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/);
  if (!m) return null;
  const domain = DOMAIN_ALIASES[m[2]] ?? m[2];
  let local = m[1].split("+")[0];
  if (dotless.has(domain)) local = local.replace(/\./g, "");
  return { key: `${local}@${domain}`, domain, local, personal: personalDomains.has(domain), role: roleLocals.has(local) };
}

// Phone numbers: international (+code), UK-style national (leading 0, incl. "(020)") and US-style 3-3-4.
const PHONE_RES = [
  /(?<![\w.+/])\+\d{1,3}[\s.-]?(?:\(\d{1,5}\)[\s.-]?)?\d{1,5}(?:[\s.-]?\d{2,5}){1,4}(?![\w/])/g,
  /(?<![\w.+/])(?:\(0\d{1,4}\)|0\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w/])/g,
  /(?<![\w.+/])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w/])/g,
  /(?<![\w.+/])0\d{9,10}(?![\w/])/g,
];
const digitCount = (s: string) => (s.match(/\d/g) ?? []).length;

/** Find phone numbers (9–15 digits) in free text. */
export function findPhones(text: string): string[] {
  const out: string[] = [];
  for (const re of PHONE_RES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const n = digitCount(m[0]);
      if (n >= 9 && n <= 15) out.push(m[0]);
    }
  }
  return out;
}
export const isPhoneLike = (s: string): boolean => {
  const t = s.trim();
  return findPhones(t).some((p) => digitCount(p) >= digitCount(t) - 1);
};

/** Remove email addresses and phone numbers from free text. */
export function scrubContacts(text: string): { text: string; removed: number } {
  let removed = 0;
  let t = text.replace(EMAIL_RE, () => { removed++; return "[email removed]"; });
  for (const p of [...new Set(findPhones(t))].sort((a, b) => b.length - a.length)) {
    const parts = t.split(p);
    removed += parts.length - 1;
    t = parts.join("[phone removed]");
  }
  return { text: t, removed };
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8,
  august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");
function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export type DateOrder = "DMY" | "MDY";

/**
 * Parse a date to ISO YYYY-MM-DD. Accepts ISO dates/datetimes, dd/mm/yyyy (day first unless
 * `order` is "MDY"; unambiguous values are read correctly either way), "22 Sep 2026",
 * "Sep 22, 2026", and Unix timestamps (seconds or milliseconds). Returns null if unreadable.
 */
export function parseDate(v: unknown, order: DateOrder = "DMY"): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return epochToDate(v);
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    if (/[T\s]\d{1,2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) { const t = Date.parse(s); if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10); }
    return ymd(+m[1], +m[2], +m[3]);
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T\s,].*)?$/);
  if (m) {
    const a = +m[1], b = +m[2];
    const dayFirst = a > 12 ? true : b > 12 ? false : order === "DMY";
    return dayFirst ? ymd(+m[3], b, a) : ymd(+m[3], a, b);
  }
  if (/^\d{10}(\.\d+)?$/.test(s)) return epochToDate(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return epochToDate(Number(s));
  const t = fold(s).replace(/,/g, " ").replace(/\s+/g, " ");
  m = t.match(/(?:^|\s)(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.? (\d{4})/);
  if (m && MONTHS[m[2]]) return ymd(+m[3], MONTHS[m[2]], +m[1]);
  m = t.match(/(?:^|\s)([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)? (\d{4})/);
  if (m && MONTHS[m[1]]) return ymd(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}
const epochToDate = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null);

/** Parse to epoch milliseconds (UTC). Date-only values are midnight UTC. */
export function parseInstant(v: unknown, order: DateOrder = "DMY"): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}/.test(s)) {
    const t = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s.replace(" ", "T") : s.replace(" ", "T") + "Z");
    if (!Number.isNaN(t)) return t;
  }
  const d = parseDate(v, order);
  return d ? Date.parse(d + "T00:00:00Z") : null;
}

export const DAY_MS = 86_400_000;
export const addDays = (isoDate: string, days: number): string => new Date(Date.parse(isoDate + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (fromIso: string, toIso: string): number => Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / DAY_MS);
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Jaro-Winkler similarity (0–1). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a ? 1 : 0;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const win = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array<boolean>(la).fill(false), mb = new Array<boolean>(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    for (let j = Math.max(0, i - win); j < Math.min(lb, i + win + 1); j++) {
      if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; matches++; break; }
    }
  }
  if (!matches) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / la + matches / lb + (matches - t / 2) / matches) / 3;
  let p = 0;
  while (p < Math.min(4, la, lb) && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

const nickIndex = new Map<string, number>();
NICKNAME_GROUPS.forEach((g, i) => g.forEach((n) => nickIndex.set(n, i)));

/** How two first names relate: "same", "variant" (nickname group), "prefix" ("sam"/"samantha"), "initial" ("s"/"sam") or null. */
export function firstNameRelation(a: string, b: string): "same" | "variant" | "prefix" | "initial" | null {
  if (!a || !b) return null;
  if (a === b) return "same";
  const ga = nickIndex.get(a), gb = nickIndex.get(b);
  if (ga !== undefined && ga === gb) return "variant";
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length === 1 && l.startsWith(s)) return "initial";
  if (s.length >= 3 && l.startsWith(s)) return "prefix";
  return null;
}

// ---- sensitive terms ----
const sensitiveIndex: { category: string; term: string; toks: string[] }[] = Object.entries(SENSITIVE_TERMS)
  .flatMap(([category, terms]) => terms.map((term) => ({ category, term, toks: plain(term).split(" ").filter(Boolean) })));

/** Sensitive-attribute terms found in the text (whole words/phrases). */
export function findSensitive(text: string | null | undefined): { category: string; term: string }[] {
  if (!text) return [];
  const toks = plain(text).split(" ").filter(Boolean);
  if (!toks.length) return [];
  const out: { category: string; term: string }[] = [];
  for (const s of sensitiveIndex) {
    for (let i = 0; i + s.toks.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < s.toks.length; j++) if (toks[i + j] !== s.toks[j]) { ok = false; break; }
      if (ok) { out.push({ category: s.category, term: s.term }); break; }
    }
  }
  return out;
}
export const hasSensitive = (text: string | null | undefined): boolean => findSensitive(text).length > 0;

/** Split a list-ish value ("a; b", ["a","b"], "a\nb") into trimmed items. Commas are kept (they appear inside items). */
export function toList(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap((x) => String(x ?? "").split(/[;\n]+/)).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Deterministic string comparison (code-unit order; never locale-dependent). */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
