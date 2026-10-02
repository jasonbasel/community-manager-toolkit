/**
 * Export signatures per platform (DESIGN §4.1) and platform-specific column meanings that
 * override the generic aliases. Header keys are normalised (lowercase, punctuation → spaces);
 * `raw` entries match the original header text exactly (case-sensitive), for formats whose
 * casing is the giveaway (Kit's snake_case, Eventbrite's "Order #").
 */
import type { AliasRule, CanonicalField } from "./aliases.js";

export interface Signal { h?: string; raw?: string; re?: RegExp; w: number }
export interface Platform {
  id: string;
  name: string;
  kind: "crm" | "chat" | "sheet" | "form" | "email" | "event" | "other";
  /** Words in the file/source name that point to this platform. */
  names: readonly string[];
  signals: readonly Signal[];
  /** Minimum signal score before this platform is considered. */
  min: number;
  /** Column meanings that differ from the generic aliases (null = deliberately unmapped, with reason). */
  overrides?: Readonly<Record<string, (AliasRule & { values?: Readonly<Record<string, "yes" | "no" | "unknown">> }) | { field: null; note: string }>>;
  /** Extra notes for the manager when this platform is detected. */
  warnings?: readonly string[];
}

const o = (field: CanonicalField, confidence: number, note?: string, extra: Partial<AliasRule> & { values?: Record<string, "yes" | "no" | "unknown"> } = {}) =>
  ({ field, confidence, note, ...extra });
const skip = (note: string) => ({ field: null, note } as const);

export const PLATFORMS: readonly Platform[] = [
  {
    id: "hubspot", name: "HubSpot contacts export", kind: "crm", names: ["hubspot", "hs"], min: 3,
    signals: [
      { h: "record id", w: 2 }, { h: "lifecycle stage", w: 2 }, { h: "lead status", w: 2 }, { h: "marketing contact status", w: 3 },
      { h: "associated company", w: 2 }, { h: "create date", w: 1 }, { h: "last activity date", w: 1 }, { h: "contact owner", w: 0.5 },
      { h: "country region", w: 1.5 }, { h: "hubspot score", w: 2 }, { h: "unsubscribed from all email", w: 2 }, { h: "original source", w: 1 },
      { h: "number of sales activities", w: 2 }, { h: "phone number", w: 0.3 }, { h: "company name", w: 0.3 },
    ],
    overrides: {
      "record id": o("source_id", 0.97, "HubSpot record ID (hubspot:<id>)"),
      "last activity date": o("last_active", 0.85, "last CRM activity (calls, emails, meetings logged in HubSpot)"),
      "create date": o("joined", 0.85, "date the contact was created; usually when they joined"),
      "marketing contact status": o("opted_in", 0.85, "the only consent signal in a HubSpot export", { values: { "marketing contact": "yes", "non-marketing contact": "no" } }),
      "lifecycle stage": skip("a sales stage (Subscriber, Customer, Evangelist), not membership status"),
      "country region": skip("country; City is used for location"),
    },
    warnings: ["HubSpot Last Activity Date is CRM activity your team logged, not necessarily the member's own activity."],
  },
  {
    id: "salesforce", name: "Salesforce contact report", kind: "crm", names: ["salesforce", "sfdc"], min: 3,
    signals: [
      { h: "account name", w: 2 }, { h: "mailing city", w: 2 }, { h: "mailing street", w: 1.5 }, { h: "mailing country", w: 1.5 },
      { h: "email opt out", w: 2 }, { h: "contact id", w: 1.5 }, { h: "account id", w: 2 }, { h: "lead source", w: 1 }, { h: "created date", w: 1 },
      { h: "last activity", w: 1 }, { h: "do not call", w: 1.5 }, { h: "salutation", w: 1 }, { h: "contact owner", w: 0.5 }, { h: "title", w: 0.3 },
    ],
    overrides: {
      "last activity": o("last_active", 0.8, "last CRM activity your team logged, not the member's own activity"),
      "created date": o("joined", 0.85, "contact created; usually when they joined"),
      "email opt out": o("opted_in", 0.9, "inverted: 1 = opted out (no); 0 proves nothing (unknown)", { inverted: true, values: { "1": "no", "true": "no", "0": "unknown", "false": "unknown" } }),
      "contact id": o("source_id", 0.95, "Salesforce contact ID (salesforce:<id>)"),
    },
    warnings: ["Salesforce report dates follow the exporting user's locale; dd/mm/yyyy is read day-first."],
  },
  {
    id: "attio", name: "Attio people export", kind: "crm", names: ["attio"], min: 3,
    signals: [
      { h: "email addresses", w: 1.5 }, { h: "phone numbers", w: 1.5 }, { h: "primary location", w: 2.5 }, { h: "connection strength", w: 3 },
      { h: "last interaction", w: 2 }, { h: "strongest connection user", w: 3 }, { h: "last email interaction", w: 2.5 },
      { h: "last calendar interaction", w: 2.5 }, { h: "record id", w: 0.5 }, { h: "created at", w: 0.5 },
    ],
    overrides: { "record id": o("source_id", 0.95, "Attio record ID (attio:<id>)"), "description": o("notes", 0.75) },
  },
  {
    id: "pipedrive", name: "Pipedrive people export", kind: "crm", names: ["pipedrive"], min: 3,
    signals: [{ re: /^person /, w: 1 }, { h: "person marketing status", w: 2 }, { h: "person label", w: 1 }],
    overrides: {
      "person id": o("source_id", 0.95, "Pipedrive person ID"), "person name": o("name", 0.95), "person first name": o("first_name", 0.95),
      "person last name": o("last_name", 0.95), "person email": o("email", 0.95, "identity only; never returned"),
      "person email work": o("email", 0.95, "identity only; never returned"), "person organization": o("organisation", 0.95),
      "person job title": o("role", 0.9), "person label": o("tags", 0.85), "person add time": o("joined", 0.8, "person created"),
      "person person created": o("joined", 0.8, "person created"), "person last activity date": o("last_active", 0.8, "last CRM activity"),
      "person marketing status": o("opted_in", 0.85, "Pipedrive marketing status", { values: { subscribed: "yes", unsubscribed: "no", "no consent": "no", archived: "unknown" } }),
      "person update time": skip("record edit time, not member activity"), "person owner": skip("internal owner, not member data"),
    },
  },
  {
    id: "affinity", name: "Affinity people export", kind: "crm", names: ["affinity"], min: 3,
    signals: [
      { h: "organizations", w: 1.5 }, { h: "job titles", w: 2 }, { h: "source of introduction", w: 3 }, { h: "first email", w: 2 },
      { h: "last email", w: 1.5 }, { h: "last meeting", w: 2 }, { h: "next meeting", w: 2 }, { h: "last contacted", w: 1.5 }, { h: "primary email", w: 1 },
    ],
    overrides: {
      "last email": o("last_active", 0.7, "last email with your team (CRM interaction)"), "first email": skip("first email with your team, not a join date"),
      "source of introduction": skip("who introduced them; keep in the CRM"), "next meeting": skip("scheduling, not member data"),
    },
  },
  {
    id: "zoho", name: "Zoho CRM contacts export", kind: "crm", names: ["zoho"], min: 3,
    signals: [
      { h: "created time", w: 2 }, { h: "modified time", w: 2 }, { h: "last activity time", w: 3 }, { h: "secondary email", w: 1.5 },
      { h: "skype id", w: 2 }, { h: "reporting to", w: 2 }, { h: "contact name", w: 1 }, { h: "account name", w: 1 }, { h: "mailing city", w: 1 },
      { h: "email opt out", w: 1 }, { h: "contact owner", w: 0.5 }, { h: "record id", w: 0.5 },
    ],
    overrides: {
      "created time": o("joined", 0.85, "contact created"), "last activity time": o("last_active", 0.8, "last CRM activity"),
      "email opt out": o("opted_in", 0.9, "inverted: true = opted out (no); false proves nothing (unknown)", { inverted: true, values: { true: "no", "1": "no", false: "unknown", "0": "unknown" } }),
      "record id": o("source_id", 0.95, "Zoho record ID"), "contact id": o("source_id", 0.95, "Zoho contact ID"),
    },
  },
  {
    id: "slack", name: "Slack members export", kind: "chat", names: ["slack"], min: 3,
    signals: [
      { h: "userid", w: 2 }, { h: "fullname", w: 2 }, { h: "displayname", w: 2 }, { h: "billing active", w: 3 }, { h: "has 2fa", w: 3 },
      { h: "has sso", w: 3 }, { h: "expiration timestamp", w: 2 }, { h: "username", w: 1 }, { h: "timezone", w: 0.5 }, { h: "status", w: 0.3 },
      { h: "days active", w: 2.5 }, { h: "messages posted", w: 2.5 }, { h: "what i do", w: 3 }, { h: "account created utc", w: 2 },
      { h: "last active utc", w: 2 }, { h: "claimed date utc", w: 2 }, { h: "last message at", w: 0.5 },
    ],
    overrides: {
      "userid": o("source_id", 0.97, "Slack user ID (slack:U…)"), "user id": o("source_id", 0.95, "Slack user ID"), "fullname": o("name", 0.95),
      "name": o("name", 0.9),
      "title": o("role", 0.8, "Slack profile title, often 'Role at Organisation'; the organisation is split out when no organisation column exists"),
      "status": o("status", 0.8, "workspace account status; Deactivated = left the workspace (kept as a note, not activity)"),
      "account type": o("status", 0.7, "workspace account type"),
      "last message at": o("last_active", 0.9, "last message posted"), "last active utc": o("last_active", 0.9),
      "billing active": skip("Slack billing flag"), "has 2fa": skip("security setting"), "has sso": skip("security setting"),
      "expiration timestamp": skip("guest account expiry"), "displayname": skip("display name (a handle); fullname is used for the name"),
      "username": skip("Slack handle, not a name"),
    },
    warnings: ["Slack profile fields are self-written: treat title as a hint, and never use message content as profile facts.",
      "Presence in Slack is not consent to be messaged."],
  },
  {
    id: "discord", name: "Discord member list (bot or role export)", kind: "chat", names: ["discord"], min: 3,
    signals: [
      { h: "user id", w: 1 }, { h: "display name", w: 1 }, { h: "global name", w: 2.5 }, { h: "nickname", w: 1.5 }, { h: "joined at", w: 1.5 },
      { h: "joined server", w: 2 }, { h: "roles", w: 2 }, { h: "discriminator", w: 3 }, { h: "is bot", w: 2.5 }, { h: "bot", w: 1.5 },
      { h: "account created", w: 1 }, { h: "avatar", w: 1 }, { h: "username", w: 0.5 }, { h: "last message at", w: 1 },
    ],
    overrides: {
      "user id": o("source_id", 0.97, "Discord user ID (discord:<snowflake>)"),
      "display name": o("name", 0.6, "server display name; may be a handle rather than a real name"),
      "global name": o("name", 0.55, "Discord global name; may be a handle"), "nickname": o("name", 0.55, "server nickname; may be a handle"),
      "username": skip("Discord handle, not a name"), "joined at": o("joined", 0.85, "joined the server"),
      "roles": o("tags", 0.75, "server roles; drop staff roles such as Moderator or Admin"), "last message at": o("last_active", 0.9, "last message posted"),
      "discriminator": skip("legacy Discord tag"), "avatar": skip("avatar image"), "bot": skip("bot flag (drop bots)"), "is bot": skip("bot flag (drop bots)"),
    },
    warnings: ["Discord exports have no email or organisation: display names are matched to people only on an exact full name, and handles are listed for the manager.",
      "Presence in Discord is not consent to be messaged."],
  },
  {
    id: "notion", name: "Notion database export", kind: "sheet", names: ["notion"], min: 3,
    signals: [{ h: "created time", w: 1.5 }, { h: "last edited time", w: 3 }, { h: "created by", w: 2 }, { h: "last edited by", w: 3 }],
    overrides: { "created time": o("joined", 0.6, "page created; may not be the join date"), "created by": skip("internal editor"), "last edited by": skip("internal editor") },
  },
  {
    id: "typeform", name: "Typeform responses", kind: "form", names: ["typeform"], min: 3,
    signals: [{ raw: "#", w: 1.5 }, { h: "network id", w: 3 }, { h: "submit date utc", w: 3 }, { h: "start date utc", w: 3 }, { h: "token", w: 1 }],
    overrides: { "start date utc": skip("time the form was opened") },
  },
  {
    id: "tally", name: "Tally responses", kind: "form", names: ["tally"], min: 3,
    signals: [{ h: "submission id", w: 1.5 }, { h: "respondent id", w: 3 }, { h: "submitted at", w: 1.5 }],
  },
  {
    id: "google_forms", name: "Google Forms responses", kind: "form", names: ["google form", "google forms", "gform", "form responses"], min: 2.5,
    signals: [{ h: "timestamp", w: 2.5 }, { h: "email address", w: 0.5 }, { h: "score", w: 1 }],
  },
  {
    id: "jotform", name: "Jotform submissions", kind: "form", names: ["jotform"], min: 3,
    signals: [{ h: "submission date", w: 2 }, { h: "submission id", w: 1 }, { h: "submission ip", w: 3 }, { h: "last update date", w: 2 }],
    overrides: { "last update date": skip("edit time, not activity") },
  },
  {
    id: "mailchimp", name: "Mailchimp audience export", kind: "email", names: ["mailchimp"], min: 3,
    signals: [
      { h: "member rating", w: 3 }, { h: "optin time", w: 3 }, { h: "optin ip", w: 3 }, { h: "confirm time", w: 3 }, { h: "confirm ip", w: 3 },
      { h: "gmtoff", w: 3 }, { h: "dstoff", w: 3 }, { h: "leid", w: 3 }, { h: "euid", w: 3 }, { h: "last changed", w: 2 }, { h: "unsub time", w: 3 },
      { h: "unsub campaign title", w: 3 }, { h: "clean time", w: 3 }, { h: "email address", w: 0.5 },
    ],
    overrides: {
      "optin time": o("joined", 0.5, "date they subscribed to the newsletter, not necessarily joined the community"),
      "confirm time": skip("double opt-in confirmation time"), "unsub time": o("opted_in", 0.95, "unsubscribed export: every row is no", { inverted: true }),
      "clean time": o("opted_in", 0.9, "cleaned (bounced) export: every row is no", { inverted: true }),
      "unsub campaign title": skip("campaign they unsubscribed from"), "unsub reason": skip("free-text reason; keep in Mailchimp"),
    },
    warnings: ["Mailchimp exports subscribed, unsubscribed and cleaned contacts as separate files: which file this is decides opt-in.",
      "Opens and member rating are not activity (privacy protection inflates opens)."],
  },
  {
    id: "kit", name: "Kit (ConvertKit) subscribers export", kind: "email", names: ["kit", "convertkit"], min: 3,
    signals: [{ raw: "email_address", w: 2 }, { raw: "state", w: 1.5 }, { raw: "first_name", w: 0.5 }, { raw: "created_at", w: 0.3 }],
    overrides: {
      "state": o("opted_in", 0.85, "subscriber state", { values: { active: "yes", inactive: "no", cancelled: "no", bounced: "no", complained: "no" } }),
      "created at": o("joined", 0.5, "date subscribed to the newsletter, not necessarily joined the community"),
    },
  },
  {
    id: "beehiiv", name: "beehiiv subscribers export", kind: "email", names: ["beehiiv"], min: 3,
    signals: [
      { h: "subscription tier", w: 3 }, { h: "subscription premium tier names", w: 3 }, { h: "utm channel", w: 2 }, { h: "referring site", w: 2 },
      { h: "referral code", w: 2 }, { h: "stripe customer id", w: 2 }, { h: "utm source", w: 1 }, { h: "utm medium", w: 1 }, { h: "utm campaign", w: 1 },
    ],
    overrides: {
      "status": o("opted_in", 0.85, "subscription status", { values: { active: "yes", validating: "unknown", inactive: "no", unsubscribed: "no", pending: "unknown" } }),
      "created at": o("joined", 0.5, "date subscribed to the newsletter, not necessarily joined the community"),
      "subscription tier": skip("newsletter tier"), "referral code": skip("referral code"), "referring site": skip("acquisition data"),
    },
  },
  {
    id: "mailerlite", name: "MailerLite subscribers export", kind: "email", names: ["mailerlite"], min: 3,
    signals: [
      { h: "subscriber", w: 1.5 }, { h: "date subscribed", w: 1.5 }, { h: "subscribed from ip", w: 3 }, { h: "ip opted in", w: 3 },
      { h: "date opted in", w: 2 }, { h: "sent", w: 1 }, { h: "opens", w: 1 }, { h: "clicks", w: 1 }, { h: "subscribed", w: 0.5 },
    ],
    overrides: {
      "subscriber": o("email", 0.9, "subscriber email; identity only"), "name": o("first_name", 0.8, "MailerLite 'Name' holds the first name"),
      "status": o("opted_in", 0.85, "subscriber status", { values: { active: "yes", unsubscribed: "no", bounced: "no", junk: "no", unconfirmed: "unknown" } }),
      "type": o("opted_in", 0.7, "subscriber type", { values: { active: "yes", unsubscribed: "no", bounced: "no", junk: "no", unconfirmed: "unknown" } }),
      "date subscribed": o("joined", 0.5, "date subscribed to the newsletter"), "sent": skip("emails sent"),
    },
  },
  {
    id: "luma", name: "Luma guest export", kind: "event", names: ["luma", "lu.ma"], min: 3,
    signals: [
      { h: "api id", w: 3 }, { h: "approval status", w: 2 }, { h: "checked in at", w: 2.5 }, { h: "eth address", w: 3 }, { h: "solana address", w: 3 },
      { h: "ticket name", w: 1.5 }, { h: "ticket type id", w: 2 }, { h: "custom source", w: 2 }, { h: "survey response rating", w: 2.5 },
      { h: "survey response feedback", w: 2.5 },
    ],
    overrides: {
      "api id": o("source_id", 0.95, "Luma guest ID"), "created at": skip("registration time for this event, not a join date"),
      "approval status": o("status", 0.7, "event approval: keep approved guests only"), "custom source": skip("registration source"),
    },
    warnings: ["Registration is not attendance: checked_in_at (if filled) is the attendance signal."],
  },
  {
    id: "eventbrite", name: "Eventbrite attendee report", kind: "event", names: ["eventbrite"], min: 3,
    signals: [
      { raw: "Order #", w: 2.5 }, { raw: "Attendee #", w: 3 }, { h: "ticket type", w: 1.5 }, { h: "attendee status", w: 2.5 }, { h: "eventbrite fees", w: 3 },
      { h: "eventbrite payment processing", w: 3 }, { h: "total paid", w: 1.5 }, { h: "fees paid", w: 2 }, { h: "order date", w: 1.5 }, { h: "order type", w: 2 },
    ],
    overrides: {
      "attendee": o("source_id", 0.8, "Eventbrite attendee number"), "attendee status": o("status", 0.75, "Attending / Checked In / Not Attending"),
      "total paid": skip("payment data"), "fees paid": skip("payment data"), "eventbrite fees": skip("payment data"),
      "eventbrite payment processing": skip("payment data"), "order type": skip("payment data"),
    },
    warnings: ["Use Checked In / Attendee Status for attendance; registration is not attendance."],
  },
  {
    id: "linkedin", name: "LinkedIn connections export", kind: "other", names: ["linkedin", "connections"], min: 3,
    signals: [{ h: "connected on", w: 3 }, { h: "position", w: 1.5 }, { h: "url", w: 1 }, { h: "email address", w: 0.3 }],
    overrides: { "position": o("role", 0.9), "connected on": skip("date you connected on LinkedIn, not a community join date") },
    warnings: ["LinkedIn connections are your network, not necessarily members, and not consent to be messaged."],
  },
];

/** Shown when no platform signature matches. */
export const GENERIC_SHEET = { id: "sheet", name: "Spreadsheet or database table (Airtable, Notion, Google Sheets, Excel)", kind: "sheet" } as const;
export const GENERIC_FORM = { id: "form", name: "Form responses (Typeform, Tally, Google Forms or Jotform)", kind: "form" } as const;
