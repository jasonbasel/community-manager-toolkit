/** Text normalisation shared by every tool. Pure functions; no I/O. */
import { DISPLAY_SUFFIXES, MATCH_PREFIXES, MATCH_SUFFIXES } from "../data/organisations.js";
import {
  BARE_COUNTRY_CODES, HANDLE_ID_LABELS, HANDLE_ID_WORDS, PHONE_ID_LABELS, PHONE_ID_NUMBER_WORDS, PHONE_ID_QUALIFIERS, PHONE_ID_STEMS, PHONE_ID_WORDS, PLACEHOLDER_NAMES,
  PLACEHOLDER_TOKENS,
} from "../data/contacts.js";
import { DOMAIN_ALIASES, DOTLESS_DOMAINS, PERSONAL_EMAIL_DOMAINS, ROLE_LOCAL_PARTS } from "../data/email-domains.js";
import { SENSITIVE_TERMS } from "../data/sensitive-terms.js";
import { NICKNAME_GROUPS } from "../data/people.js";

/** Latin letters that have no decomposition but one plain spelling: "Søren" = "Soren", "Straße" = "Strasse". */
const LETTER_FOLDS: Readonly<Record<string, string>> = { ł: "l", ø: "o", đ: "d", ð: "d", þ: "th", ß: "ss", æ: "ae", œ: "oe", ı: "i", ħ: "h", ŧ: "t", ŋ: "n", ĸ: "k", ƶ: "z" };
const LETTER_FOLD_RE = new RegExp(`[${Object.keys(LETTER_FOLDS).join("")}]`, "g");

/**
 * Lowercase; strip accents from Latin letters only ("Zoë" → "zoe"), since in other scripts a mark can be part
 * of the letter ("й" is not "и"); join the Latin letters above to their plain spelling. Compatibility
 * decomposition first, so ligatures and full-width forms fold too.
 */
export const fold = (s: string): string =>
  s.normalize("NFKD").replace(/([A-Za-z])[̀-ͯ]+/g, "$1").normalize("NFC").toLowerCase().replace(LETTER_FOLD_RE, (c) => LETTER_FOLDS[c]);

/** Apostrophes in every common form; dropped (not turned into spaces) so "O'Brien" and "OBrien" normalise alike. */
export const APOSTROPHES = /['’‘`´ʼʻ]/g;

/**
 * Lowercase, accents, apostrophes and punctuation removed, single spaces; letters and digits of every
 * script are kept, so a non-Latin name never normalises to "". "Ifeoma Adeyemi-Brandt" → "ifeoma adeyemi brandt",
 * "O'Brien" → "obrien", "李明" → "李明".
 */
export const plain = (s: string): string =>
  fold(s).replace(APOSTROPHES, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().normalize("NFC");

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

// Emails are found by a scan outwards from each "@" rather than by the regex
// /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, which backtracks quadratically on long unbroken runs.
const LOCAL = new Uint8Array(128), DOMAIN = new Uint8Array(128), ALPHA = new Uint8Array(128);
for (let c = 0; c < 128; c++) {
  const ch = String.fromCharCode(c), alnum = /[A-Za-z0-9]/.test(ch);
  ALPHA[c] = /[A-Za-z]/.test(ch) ? 1 : 0;
  DOMAIN[c] = alnum || ch === "." || ch === "-" ? 1 : 0;
  LOCAL[c] = alnum || "._%+-".includes(ch) ? 1 : 0;
}
const inSet = (set: Uint8Array, c: number) => c < 128 && set[c] === 1;

/** Email addresses in free text, left to right: the same matches as the regex above, in linear time. */
export function findEmails(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let floor = 0; // a match never starts inside the previous one
  for (let at = text.indexOf("@"); at !== -1;) {
    let start = at, end = -1;
    while (start > floor && inSet(LOCAL, text.charCodeAt(start - 1))) start--;
    if (start < at) {
      let e = at + 1;
      while (e < text.length && inSet(DOMAIN, text.charCodeAt(e))) e++;
      // The last "." (after at least one domain character) followed by two letters, then every letter after it.
      for (let k = e - 1; k >= at + 2; k--) {
        if (text.charCodeAt(k) === 46 && inSet(ALPHA, text.charCodeAt(k + 1)) && inSet(ALPHA, text.charCodeAt(k + 2))) {
          end = k + 1;
          while (end < text.length && inSet(ALPHA, text.charCodeAt(end))) end++;
          break;
        }
      }
    }
    if (end > 0) { out.push({ start, end }); floor = end; at = text.indexOf("@", end); }
    else at = text.indexOf("@", at + 1);
  }
  return out;
}

/** Something shaped like an email address (\S@\S+\.\S within one word), in linear time. */
export const isEmailLike = (s: string): boolean =>
  s.split(/\s+/).some((w) => { const at = w.indexOf("@", 1); return at > 0 && w.slice(at + 2, -1).includes("."); });

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

// Phone numbers. Every pattern either moves one digit per step or uses short bounded groups, so
// matching stays linear on long digit runs. Each match must also have a phone's digit count.
const digitCount = (s: string) => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 48 && c <= 57) n++; } return n; };
const bareCountryCode = (m: string) => BARE_COUNTRY_CODES.some(([cc, min, max]) => m.startsWith(cc) && m[cc.length] !== "0" && m.length - cc.length >= min && m.length - cc.length <= max);
/** Grouped digits that read as a phone: not thousands grouping (1 000 000 000) and not a list of small numbers (12 14 16 18 20 22). */
const phoneGrouping = (m: string) => { const g = m.split(/[ .-]/).slice(1); return !g.every((x) => x.length === 3) && g.some((x) => x.length >= 3); };
const PHONE_PATTERNS: readonly { re: RegExp; min: number; max: number; ok?: (m: string) => boolean }[] = [
  // +44 7700 900311, +1 (415) 555-0100, +44 (0)20 7946 0123
  { re: /(?<![\w.+/])\+\d(?:[\s.-]?(?:\(\d{1,5}\)|\d)){6,18}(?![\w/])/g, min: 9, max: 15 },
  // UK-style national: 07700 900311, (020) 7946 0123 (a trunk 0 is never followed by another 0)
  { re: /(?<![\w.+/])(?:\(0[1-9]\d{0,3}\)|0[1-9]\d{1,3})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w/])/g, min: 9, max: 15 },
  // US-style 3-3-4 with separators: 415-555-0100, (415) 555 0100
  { re: /(?<![\w.+/])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w/])/g, min: 10, max: 10 },
  // bare national with a trunk 0: 07700900311
  { re: /(?<![\w.+/])0[1-9]\d{8,9}(?![\w/])/g, min: 10, max: 11 },
  // international prefix 00: 0044 7700 900311
  { re: /(?<![\w.+/])00[1-9](?:[\s.-]?\d){7,13}(?![\w/])/g, min: 11, max: 15 },
  // international without "+", one kind of separator throughout: 44 7700 900311, 1-415-555-0100
  { re: /(?<![\w.+/-])[1-9]\d{0,2}([ .-])\d{1,6}(?:\1\d{1,6}){1,5}(?![\w/-])/g, min: 11, max: 15, ok: phoneGrouping },
  // US/Canada without separators: 4155550100, 14155550100 (area code and exchange never start with 0 or 1)
  { re: /(?<![\w.+/-])1?[2-9]\d{2}[2-9]\d{6}(?![\w/-])/g, min: 10, max: 11 },
  // bare international with a known country code: 447700900311
  { re: /(?<![\w.+/-])\d{11,15}(?![\w/-])/g, min: 11, max: 15, ok: bareCountryCode },
];
/** WhatsApp click-to-chat links carry a phone number (wa.me/447700900311, api.whatsapp.com/send?phone=…). */
const WHATSAPP_LINKS: readonly RegExp[] = [
  /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?wa\.me\/[^\s<>"'()[\]{}]*/gi,
  /(?<![\w.-])(?:https?:\/\/)?(?:www\.|api\.|web\.)?whatsapp\.com\/send\/?\?[^\s<>"'()[\]{}]*/gi,
];
export const isWhatsAppLink = (s: string): boolean => WHATSAPP_LINKS.some((re) => s.search(re) >= 0);

/** Find phone numbers (by shape and digit count) and WhatsApp contact links in free text. */
export function findPhones(text: string): string[] {
  const out: string[] = [];
  for (const re of WHATSAPP_LINKS) { re.lastIndex = 0; for (const m of text.matchAll(re)) out.push(m[0]); }
  for (const p of PHONE_PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      const n = digitCount(m[0]);
      if (n >= p.min && n <= p.max && (!p.ok || p.ok(m[0]))) out.push(m[0]);
    }
  }
  return out;
}
export const isPhoneLike = (s: string): boolean => {
  const t = s.trim();
  return findPhones(t).some((p) => digitCount(p) >= digitCount(t) - 1);
};

/** A web address: a scheme, "www.", host/path, or a profile or chat link. */
export function isUrlLike(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.includes("://") || t.startsWith("www.") || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?\//.test(t)
    || /(?:^|[^\w.-])(?:wa\.me|t\.me|lnkd\.in|(?:[\w-]+\.)?linkedin\.com)\//.test(t);
}

export type ContactKind = "email" | "phone" | "link" | "handle";
const phoneWords = new Set(PHONE_ID_WORDS), phoneLabels = new Set(PHONE_ID_LABELS), handleWords = new Set(HANDLE_ID_WORDS), handleLabels = new Set(HANDLE_ID_LABELS);
const phoneQualifiers = new Set(PHONE_ID_QUALIFIERS), numberWords = new Set(PHONE_ID_NUMBER_WORDS);
/** Whole words or segments of a label: "mobile_phone" → [mobile, phone], "WA group" → [wa, group]. */
const labelWords = (label: string) => fold(label).split(/[^a-z0-9]+/).filter(Boolean);
const wholeLabel = (label: string) => fold(label).replace(/[^a-z0-9]/g, "");
/**
 * A source name or ID prefix whose IDs are phone numbers: a phone word anywhere in it ("whatsapp:", "mobile_phone",
 * "phone_number", "WA group", "sms"), a long stem even when glued ("WhatsAppExport"), a generic label on its own
 * ("tel", "mobile"), or a qualifier with a number word ("mobile number"). Short generic words never match inside
 * other labels, so "mobile-app" and "tel-aviv-chapter" are not phone labels.
 */
export const isPhoneLabel = (label: string): boolean => {
  const words = labelWords(label), whole = wholeLabel(label);
  return words.some((w) => phoneWords.has(w)) || PHONE_ID_STEMS.some((st) => whole.includes(st)) || phoneLabels.has(whole)
    || (words.some((w) => phoneQualifiers.has(w)) && words.some((w) => numberWords.has(w)));
};
/** A source name or ID prefix whose values are social handles or profile slugs: LinkedIn, Telegram, Instagram; "x" only as the whole label. */
export const isHandleLabel = (label: string): boolean => labelWords(label).some((w) => handleWords.has(w)) || handleLabels.has(wholeLabel(label));

/**
 * Whether an identifier (source ID, guest ID, member ID) is really a contact detail. Stricter than
 * free-text scanning about bare numbers, which are usually platform IDs (HubSpot, Discord), unless
 * a label says the ID is a phone number (WhatsApp, SMS, tel:) or the number has a trunk 0. With
 * `handles`, an "@handle", any value under a phone label, and any value under a social label
 * (LinkedIn, Telegram, X …) other than an opaque numeric ID or URN are contact details too.
 */
export function idContactKind(value: string, opts: { labels?: readonly string[]; handles?: boolean } = {}): ContactKind | null {
  const v = value.trim();
  if (!v) return null;
  if (isEmailLike(v)) return "email";
  if (isUrlLike(v)) return "link";
  const labels = opts.labels ?? [];
  const digits = digitCount(v);
  const phoneLabel = labels.some(isPhoneLabel);
  if (opts.handles) {
    if (/^@[\w.]/.test(v)) return "handle";
    if (phoneLabel) return digits >= 5 ? "phone" : "handle";
    if (labels.some(isHandleLabel) && !/^\d{5,20}$/.test(v) && !/^urn:[a-z0-9-]+:/i.test(v)) return "handle";
  }
  const phoneChars = /^[+\d\s().-]+$/.test(v);
  if (phoneChars && digits >= 7 && digits <= 15 && phoneLabel) return "phone";
  if (/^\d+$/.test(v)) return /^0[1-9]/.test(v) && digits >= 9 && digits <= 15 ? "phone" : null;
  if (phoneChars && /^(?:\+|\(|0[1-9])/.test(v) && digits >= 9 && digits <= 15) return "phone";
  return isPhoneLike(v) ? "phone" : null;
}

const placeholderNames = new Set(PLACEHOLDER_NAMES), placeholderTokens = new Set(PLACEHOLDER_TOKENS);
/**
 * A name key that identifies nobody: empty, "unknown", "n/a", "test", Latin initials only ("j s"), numbers.
 * A single character of another script is a name ("王 芳", "李").
 */
export function isPlaceholderName(key: string): boolean {
  if (!key) return true;
  if (placeholderNames.has(key)) return true;
  return key.split(" ").every((t) => /^[a-z]$/.test(t) || /^\d+$/.test(t) || placeholderTokens.has(t));
}

/**
 * Exact-string identity key: NFKC, whitespace collapsed, case-folded, nothing else removed. The fallback
 * that lets the same string name the same person in every input even when `nameKey` has nothing to say
 * ("☺", a one-letter name) — but never for a placeholder name such as "Unknown".
 */
export const exactKey = (s: string): string => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Remove email addresses, phone numbers and WhatsApp links from free text. */
export function scrubContacts(text: string): { text: string; removed: number } {
  const emails = findEmails(text);
  let removed = emails.length, t = text;
  if (emails.length) {
    let out = "", last = 0;
    for (const e of emails) { out += text.slice(last, e.start) + "[email removed]"; last = e.end; }
    t = out + text.slice(last);
  }
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

const sensitiveByFirst = new Map<string, number[]>();
sensitiveIndex.forEach((s, k) => { const f = s.toks[0]; if (!f) return; const ks = sensitiveByFirst.get(f); if (ks) ks.push(k); else sensitiveByFirst.set(f, [k]); });

/** Sensitive-attribute terms found in the text (whole words/phrases), in the data's order. One pass over the words. */
export function findSensitive(text: string | null | undefined): { category: string; term: string }[] {
  if (!text) return [];
  const toks = plain(text).split(" ").filter(Boolean);
  const hit = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    for (const k of sensitiveByFirst.get(toks[i]) ?? []) {
      const st = sensitiveIndex[k].toks;
      if (hit.has(k) || i + st.length > toks.length) continue;
      let ok = true;
      for (let j = 1; j < st.length; j++) if (toks[i + j] !== st[j]) { ok = false; break; }
      if (ok) hit.add(k);
    }
  }
  return [...hit].sort((a, b) => a - b).map((k) => ({ category: sensitiveIndex[k].category, term: sensitiveIndex[k].term }));
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
