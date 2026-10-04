/**
 * Contact-detail data: country codes for international numbers written without "+", the sources
 * that identify people by phone number, and placeholder names that say nothing about identity.
 */

/**
 * Bare international numbers (no "+", no separators, e.g. 447700900123): [country code, national
 * digits min, max]. Deliberately short: bare digit runs are usually IDs, so only common markets
 * with a fixed national length are recognised. US/Canada (1) is handled by the NANP pattern.
 */
export const BARE_COUNTRY_CODES: readonly (readonly [string, number, number])[] = [
  ["44", 10, 10], ["353", 9, 9], ["33", 9, 9], ["49", 10, 11], ["34", 9, 9], ["39", 9, 10], ["31", 9, 9], ["91", 10, 10],
  ["61", 9, 9], ["27", 9, 9], ["234", 10, 10], ["254", 9, 9], ["971", 9, 9], ["966", 9, 9], ["55", 10, 11], ["52", 10, 10],
];

/*
 * Labels (a record's source, or an ID's own prefix such as "wa:") that say what an ID is. Distinctive
 * names count as a word anywhere in the label ("whatsapp-export"); generic or short ones only as the
 * whole label, separators ignored ("wa_id", "tel", "mobile"; never "mobile-app" or "tel-aviv").
 */
/** IDs under these labels are phone numbers. */
export const PHONE_ID_WORDS: readonly string[] = ["whatsapp", "msisdn", "sms", "viber", "imessage"];
export const PHONE_ID_LABELS: readonly string[] = [
  "wa", "waid", "tel", "phone", "phones", "phonenumber", "telephone", "mobile", "mobilenumber", "cell", "cellphone", "text", "texts", "signal",
];
/** IDs under these labels are handles or profile slugs (contact details) unless they are opaque numeric IDs or URNs. */
export const HANDLE_ID_WORDS: readonly string[] = ["linkedin", "telegram", "twitter", "instagram", "facebook", "tiktok", "bluesky", "mastodon", "snapchat"];
export const HANDLE_ID_LABELS: readonly string[] = ["x", "threads", "ig", "fb", "tg"];

/** Whole normalised names that are placeholders, not people. */
export const PLACEHOLDER_NAMES: readonly string[] = [
  "no name", "not known", "not given", "not provided", "not applicable", "prefer not to say", "first last", "firstname lastname",
  "first name last name", "john doe", "jane doe", "contact", "customer", "name", "person", "someone", "somebody",
];

/** Name tokens that are placeholders: a name made only of these (or single letters, or numbers) is a placeholder. */
export const PLACEHOLDER_TOKENS: readonly string[] = [
  "unknown", "unnamed", "anonymous", "anon", "test", "tester", "testing", "none", "null", "nil", "undefined", "na", "tbc", "tbd", "tba",
  "xx", "xxx", "dummy", "sample", "example", "placeholder", "noname", "user", "member", "guest", "asdf", "qwerty",
];
