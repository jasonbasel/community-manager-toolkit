/** detect_member_fields: map an export's columns to the canonical member fields (DESIGN §4.1). */
import {
  ASK_HELP_PHRASES, ASK_PHRASES, CONTACT_PATTERNS, GENERIC_ALIASES, IGNORED_HEADERS, MULTI_FIELDS, NOTE_PHRASES, NOT_ACTIVITY_PATTERNS,
  OFFER_PHRASES, SENSITIVE_COLUMN_PATTERNS, type AliasRule, type CanonicalField,
} from "../fields/aliases.js";
import { GENERIC_FORM, GENERIC_SHEET, PLATFORMS, type Platform } from "../fields/platforms.js";
import { OPT_IN_NO, OPT_IN_YES, STATUS_VALUES, DEACTIVATED_VALUES } from "../data/sources.js";
import { fold, isEmailLike, isPhoneLike, plain } from "../text/normalise.js";
import { InputError } from "./errors.js";

export interface DetectInput {
  source_name: string;
  headers: string[];
  sample_rows?: (string[] | Record<string, unknown>)[];
}
export interface MappingEntry {
  column: string;
  field: CanonicalField;
  confidence: number;
  reason: string;
  inverted?: boolean;
  values?: Record<string, "yes" | "no" | "unknown" | string>;
  date_format?: "ISO" | "DD/MM/YYYY" | "MM/DD/YYYY" | "ambiguous: read day-first" | "timestamp";
  splits?: "role_at_organisation";
}
export interface ColumnNote { column: string; reason: string }
export interface DetectOutput {
  source_name: string;
  platform_guess: { id: string; name: string; confidence: number; evidence: string[] };
  mapping: MappingEntry[];
  unmapped: ColumnNote[];
  contact_columns: ColumnNote[];
  sensitive_columns: ColumnNote[];
  warnings: string[];
}

const GENERIC_EVENT = { id: "event", name: "Event guest list (registration export)", kind: "event" } as const;
const round = (n: number) => Math.round(n * 100) / 100;
const hkey = (h: string) => plain(h) || h.trim();
const yes = new Set(OPT_IN_YES), no = new Set(OPT_IN_NO);

function scorePlatform(p: Platform, keys: string[], raws: string[], sourceName: string) {
  let score = 0;
  const evidence: string[] = [];
  for (const s of p.signals) {
    if (s.h && keys.includes(s.h)) { score += s.w; evidence.push(raws[keys.indexOf(s.h)]); }
    else if (s.raw && raws.includes(s.raw)) { score += s.w; evidence.push(s.raw); }
    else if (s.re) {
      const hits = raws.filter((_r, i) => s.re!.test(keys[i]));
      score += Math.min(hits.length, 5) * s.w;
      evidence.push(...hits.slice(0, 3));
    }
  }
  const sn = ` ${plain(sourceName)} `;
  const named = p.names.some((n) => sn.includes(` ${plain(n)} `));
  if (named) evidence.unshift(`source name mentions ${p.name.split(" ")[0]}`);
  let conf = score >= p.min ? 1 - Math.pow(0.5, score / p.min) : 0;
  if (named) conf = score >= p.min ? conf + 0.1 : Math.max(conf, score > 0 ? 0.5 : 0.45);
  return { conf: Math.min(0.98, conf), evidence: [...new Set(evidence)] };
}

function phraseField(k: string): { field: CanonicalField; confidence: number; reason: string } | null {
  const hit = (list: readonly string[]) => list.find((p) => ` ${k} `.includes(` ${p} `));
  let p = hit(ASK_HELP_PHRASES);
  if (p) return { field: "asks", confidence: 0.75, reason: `question text reads as an ask ("${p}")` };
  p = hit(OFFER_PHRASES);
  if (p) return { field: "offers", confidence: 0.75, reason: `question text reads as an offer ("${p}")` };
  p = hit(ASK_PHRASES);
  if (p) return { field: "asks", confidence: 0.7, reason: `question text reads as an ask ("${p}")` };
  p = hit(NOTE_PHRASES);
  if (p) return { field: "notes", confidence: 0.6, reason: `question text reads as a bio or note ("${p}")` };
  return null;
}

function containsField(k: string): { field: CanonicalField; confidence: number; inverted?: boolean } | null {
  const t = new Set(k.split(" "));
  const has = (...w: string[]) => w.some((x) => t.has(x));
  if (has("opt", "optin", "consent", "gdpr", "subscribed", "unsubscribed", "subscription")) return { field: "opted_in", confidence: 0.6, inverted: has("out", "unsubscribed") };
  if (has("email", "e")) return k.includes("mail") ? { field: "email", confidence: 0.7 } : null;
  if (has("company", "organisation", "organization", "employer", "org")) return { field: "organisation", confidence: 0.7 };
  if (has("title", "role", "position", "job")) return { field: "role", confidence: 0.65 };
  if (has("city", "location", "town")) return { field: "location", confidence: 0.65 };
  if (has("first", "given") && has("name")) return { field: "first_name", confidence: 0.7 };
  if (has("surname") || (has("last", "family") && has("name"))) return { field: "last_name", confidence: 0.7 };
  if (has("name")) return { field: "name", confidence: 0.55 };
  if (has("last") && has("active", "activity", "seen", "message", "login", "post", "posted", "interaction")) return { field: "last_active", confidence: 0.65 };
  if (has("joined", "signup", "since") || (has("created") && has("date", "at", "time"))) return { field: "joined", confidence: 0.6 };
  if (has("tags", "tag", "label", "labels", "interests", "industry", "sector")) return { field: "tags", confidence: 0.6 };
  if (has("notes", "note", "bio", "comments")) return { field: "notes", confidence: 0.55 };
  if (has("status")) return { field: "status", confidence: 0.5 };
  if (k.endsWith(" id") && !has("submission", "respondent", "order", "ticket", "event", "campaign")) return { field: "source_id", confidence: 0.5 };
  return null;
}

function dateFormat(values: string[]): MappingEntry["date_format"] | undefined {
  const vs = values.filter(Boolean);
  if (!vs.length) return undefined;
  if (vs.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) return "ISO";
  if (vs.every((v) => /^\d{10}(\d{3})?(\.\d+)?$/.test(v))) return "timestamp";
  const slash = vs.map((v) => v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/)).filter(Boolean) as RegExpMatchArray[];
  if (!slash.length) return undefined;
  if (slash.some((m) => +m[1] > 12)) return "DD/MM/YYYY";
  if (slash.some((m) => +m[2] > 12)) return "MM/DD/YYYY";
  return "ambiguous: read day-first";
}

const truthy = (v: string) => ["1", "true", "yes", "y", "x", "checked"].includes(v);
const falsy = (v: string) => ["0", "false", "no", "n", ""].includes(v);

function optInValues(values: string[], inverted: boolean, preset?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of [...new Set(values.map((v) => v.trim()))].slice(0, 12)) {
    if (!raw || raw.length > 40 || isEmailLike(raw) || isPhoneLike(raw)) continue;
    const v = fold(raw);
    const p = preset?.[v];
    if (p) out[raw] = p;
    else if (inverted) out[raw] = truthy(v) || v.length > 3 ? "no" : "unknown";
    else out[raw] = yes.has(v) ? "yes" : no.has(v) ? "no" : "unknown";
  }
  return out;
}

function statusValues(values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of [...new Set(values.map((v) => v.trim()))].slice(0, 12)) {
    if (!raw || raw.length > 40 || isEmailLike(raw)) continue;
    const v = fold(raw);
    out[raw] = DEACTIVATED_VALUES.includes(v) ? "deactivated account (note only)" : STATUS_VALUES[v] ?? "not recognised (left blank)";
  }
  return out;
}

export function detectMemberFields(input: DetectInput): DetectOutput {
  const raws = input.headers.map((h) => String(h ?? "").trim());
  raws.forEach((h, i) => { if (!h) throw new InputError(`headers[${i}] is empty; pass the header text exactly as it appears in the export`); });
  // Disambiguate duplicate headers so every column is reported once.
  const seen = new Map<string, number>();
  const cols = raws.map((h) => { const n = (seen.get(h) ?? 0) + 1; seen.set(h, n); return n > 1 ? `${h} (${n})` : h; });
  const keys = raws.map(hkey);
  const rows = (input.sample_rows ?? []).map((row, ri) => {
    if (Array.isArray(row)) {
      if (row.length > raws.length + 5) throw new InputError(`sample_rows[${ri}] has ${row.length} cells but there are ${raws.length} headers`);
      return raws.map((_h, i) => String(row[i] ?? "").slice(0, 300));
    }
    return raws.map((h) => String((row as Record<string, unknown>)[h] ?? "").slice(0, 300));
  });
  const colValues = (i: number) => rows.map((r) => r[i] ?? "").filter((v) => v.trim() !== "");

  // ---- platform ----
  let best: { p: Platform | null; conf: number; evidence: string[] } = { p: null, conf: 0, evidence: [] };
  for (const p of PLATFORMS) {
    const s = scorePlatform(p, keys, raws, input.source_name);
    if (s.conf > best.conf) best = { p, conf: s.conf, evidence: s.evidence };
  }
  const questionCols = keys.filter((k) => phraseField(k) !== null).length;
  let platform_guess: DetectOutput["platform_guess"];
  if (best.p && best.conf >= 0.5) platform_guess = { id: best.p.id, name: best.p.name, confidence: round(best.conf), evidence: best.evidence.slice(0, 8) };
  else if (keys.some((k) => /\b(approval status|registered at|ticket|checked in|rsvp|attendee)\b/.test(k)))
    platform_guess = { id: GENERIC_EVENT.id, name: GENERIC_EVENT.name, confidence: 0.55, evidence: raws.filter((_r, i) => /\b(approval status|registered at|ticket|checked in|rsvp|attendee)\b/.test(keys[i])).slice(0, 4) };
  else if (questionCols >= 2 || (questionCols >= 1 && keys.some((k) => /\b(submitted at|timestamp|submission date)\b/.test(k))))
    platform_guess = { id: GENERIC_FORM.id, name: GENERIC_FORM.name, confidence: 0.6, evidence: [`${questionCols} question-style column(s)`, ...raws.filter((_r, i) => /\b(submitted at|timestamp|submission date)\b/.test(keys[i]))] };
  else platform_guess = { id: GENERIC_SHEET.id, name: GENERIC_SHEET.name, confidence: 0.4, evidence: ["no platform-specific columns"] };
  const plat = best.p && best.conf >= 0.5 ? best.p : null;

  // ---- per-column mapping ----
  const mapping: MappingEntry[] = [];
  const unmapped: ColumnNote[] = [];
  const contact_columns: ColumnNote[] = [];
  const sensitive_columns: ColumnNote[] = [];
  const warnings: string[] = [];
  let notActivity = false;

  keys.forEach((k, i) => {
    const column = cols[i];
    if (SENSITIVE_COLUMN_PATTERNS.some((re) => re.test(k))) {
      sensitive_columns.push({ column, reason: "may reveal a sensitive personal attribute; never used for matching, tags or reasons" });
      return;
    }
    const ov = plat?.overrides?.[k];
    if (ov) {
      if (ov.field === null) { unmapped.push({ column, reason: ov.note }); return; }
      const e: MappingEntry = { column, field: ov.field, confidence: ov.confidence ?? 0.9, reason: ov.note ?? `${plat!.name.split(" ")[0]} column` };
      if (ov.inverted) e.inverted = true;
      if ("values" in ov && ov.values) e.values = { ...ov.values };
      mapping.push(e);
      return;
    }
    if (IGNORED_HEADERS[k]) {
      if (NOT_ACTIVITY_PATTERNS.some((re) => re.test(k))) notActivity = true;
      unmapped.push({ column, reason: IGNORED_HEADERS[k] });
      return;
    }
    const g: AliasRule | undefined = GENERIC_ALIASES[k];
    if (g) {
      const e: MappingEntry = { column, field: g.field, confidence: g.confidence ?? 0.9, reason: g.note ?? "standard column name" };
      if (g.inverted) e.inverted = true;
      mapping.push(e);
      return;
    }
    if (CONTACT_PATTERNS.some((re) => re.test(k))) { contact_columns.push({ column, reason: "contact detail or online identifier; stays in the source system" }); return; }
    if (NOT_ACTIVITY_PATTERNS.some((re) => re.test(k))) { unmapped.push({ column, reason: "email opens and clicks are not member activity" }); notActivity = true; return; }
    const ph = phraseField(k);
    if (ph) { mapping.push({ column, ...ph }); return; }
    const c = containsField(k);
    if (c) { mapping.push({ column, field: c.field, confidence: c.confidence, reason: "column name contains a field word", ...(c.inverted ? { inverted: true } : {}) }); return; }
    const vals = colValues(i);
    if (vals.length && vals.filter((v) => isEmailLike(v)).length >= Math.ceil(vals.length * 0.6)) { mapping.push({ column, field: "email", confidence: 0.8, reason: "values are email addresses; identity only" }); return; }
    if (vals.length && vals.filter((v) => isPhoneLike(v)).length >= Math.ceil(vals.length * 0.6)) { contact_columns.push({ column, reason: "values are phone numbers" }); return; }
    unmapped.push({ column, reason: /\?\s*$/.test(raws[i]) ? "free-text question that is not about asks, offers or a bio" : "no matching field" });
  });

  // ---- one column per single-value field ----
  const byField = new Map<CanonicalField, MappingEntry[]>();
  for (const e of mapping) byField.set(e.field, [...(byField.get(e.field) ?? []), e]);
  for (const [field, es] of byField) {
    if (MULTI_FIELDS.includes(field) || es.length < 2) continue;
    const keep = [...es].sort((a, b) => b.confidence - a.confidence)[0];
    for (const e of es) {
      if (e === keep) continue;
      mapping.splice(mapping.indexOf(e), 1);
      unmapped.push({ column: e.column, reason: `also looks like ${field}; '${keep.column}' is used for it` });
    }
  }

  // ---- value hints from the sample rows ----
  const idx = (column: string) => cols.indexOf(column);
  for (const e of mapping) {
    const vals = colValues(idx(e.column));
    if (e.field === "joined" || e.field === "last_active") {
      const f = dateFormat(vals);
      if (f) e.date_format = f;
      if (f === "ambiguous: read day-first") warnings.push(`'${e.column}' dates are ambiguous (day and month both 12 or under); they are read day-first. Say if the export is US-style.`);
    }
    if (e.field === "opted_in") {
      const preset = e.values as Record<string, string> | undefined;
      const seenVals = optInValues(vals, !!e.inverted, preset ? Object.fromEntries(Object.entries(preset).map(([k2, v]) => [fold(k2), v])) : undefined);
      const seenKeys = new Set(Object.keys(seenVals).map((k2) => fold(k2)));
      const rest = Object.fromEntries(Object.entries(preset ?? {}).filter(([k2]) => !seenKeys.has(fold(k2))));
      if (Object.keys(seenVals).length || Object.keys(rest).length) e.values = { ...seenVals, ...rest };
    }
    if (e.field === "status" && vals.length) e.values = statusValues(vals);
    if (e.field === "email" && vals.length && vals.filter((v) => isEmailLike(v)).length < vals.length * 0.5) {
      e.confidence = Math.min(e.confidence, 0.4);
      warnings.push(`'${e.column}' does not hold email addresses in the sample rows; check the mapping.`);
    }
    if (e.field === "role" && vals.length && !mapping.some((m) => m.field === "organisation")
      && vals.filter((v) => /\s(at|@|\|)\s|,\s/.test(v)).length >= Math.ceil(vals.length * 0.5)) {
      e.splits = "role_at_organisation";
      e.reason += "; values look like 'Role at Organisation', so the organisation is taken from the text after 'at', '@', '|' or ','";
    }
  }

  // ---- warnings ----
  const fields = new Set(mapping.map((m) => m.field));
  if (!fields.has("name") && !(fields.has("first_name") || fields.has("last_name"))) warnings.push("No name column found: records without a name cannot be matched or paired.");
  if (!fields.has("email") && !fields.has("source_id")) warnings.push("No email or ID column: records can only be matched on name plus organisation.");
  if (!fields.has("opted_in")) warnings.push("No consent column: opt-in stays unknown for these records (being in a tool is not consent).");
  if (fields.has("asks") || fields.has("offers")) {
    const free = mapping.filter((m) => (m.field === "asks" || m.field === "offers") && m.reason.startsWith("question text"));
    if (free.length) warnings.push("Asks and offers from free-text answers should be summarised and labelled inferred; never add anything the person did not write.");
  }
  if (contact_columns.length) warnings.push(`${contact_columns.length} contact column(s) are ignored downstream; contact details stay in the source system.`);
  if (sensitive_columns.length) warnings.push(`${sensitive_columns.length} column(s) may reveal sensitive attributes and are never used.`);
  if (notActivity) warnings.push("Email opens and clicks are not activity (privacy protection inflates them).");
  for (const w of plat?.warnings ?? []) warnings.push(w);

  return { source_name: input.source_name, platform_guess, mapping, unmapped, contact_columns, sensitive_columns, warnings: [...new Set(warnings)] };
}
