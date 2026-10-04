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
 * Labels (a record's source, or an ID's own prefix such as "wa:") that say what an ID is. Labels are
 * read as whole words or segments ("mobile_phone", "WA group", "WhatsApp export"), never as substrings.
 * Distinctive words count anywhere in the label; generic or short ones only as the whole label,
 * separators ignored ("tel", "mobile"; never "mobile-app" or "tel-aviv-chapter"); and a qualifier plus
 * a number word counts too ("mobile number", "cell no"). No country-code list is involved.
 */
/** IDs under a label containing any of these words are phone numbers. */
export const PHONE_ID_WORDS: readonly string[] = [
  "whatsapp", "wa", "waid", "msisdn", "sms", "mms", "phone", "phones", "phonenumber", "phonenumbers", "telephone", "cellphone", "mobilenumber",
  "mobilephone", "viber", "imessage",
];
/** Long distinctive stems that count even glued into one word ("WhatsAppExport", "msisdn_list"). */
export const PHONE_ID_STEMS: readonly string[] = ["whatsapp", "msisdn", "telephone", "phonenumber", "cellphone", "mobilenumber", "mobilephone", "imessage"];
/** IDs under exactly one of these labels (separators ignored) are phone numbers. */
export const PHONE_ID_LABELS: readonly string[] = ["tel", "mobile", "cell", "text", "texts", "signal", "handy"];
/** Generic words that mark a phone label only together with a number word: "mobile number", "cell no", "tel nr". */
export const PHONE_ID_QUALIFIERS: readonly string[] = ["mobile", "cell", "tel", "telephone", "handy", "contact"];
export const PHONE_ID_NUMBER_WORDS: readonly string[] = ["number", "numbers", "no", "num", "nr", "digits"];
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
