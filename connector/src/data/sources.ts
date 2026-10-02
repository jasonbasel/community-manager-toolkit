/**
 * Source data for merge_member_records: which kind each source is, the default precedence per
 * field group (DESIGN §4.2), and the vocabularies for status and opt-in values.
 */

export type SourceKind = "crm" | "form" | "notes" | "sheet" | "email" | "event" | "chat" | "other";

/** Source label (lowercase, spaces/underscores → hyphen) or a word in it → kind. */
export const SOURCE_KINDS: Readonly<Record<string, SourceKind>> = {
  crm: "crm", hubspot: "crm", salesforce: "crm", attio: "crm", pipedrive: "crm", affinity: "crm", zoho: "crm", "zoho-crm": "crm",
  copper: "crm", close: "crm", folk: "crm", dynamics: "crm",
  form: "form", forms: "form", application: "form", applications: "form", typeform: "form", tally: "form", "google-forms": "form",
  jotform: "form", survey: "form", registration: "form",
  notes: "notes", note: "notes", "meeting-notes": "notes", fireflies: "notes", granola: "notes", otter: "notes", transcript: "notes",
  sheet: "sheet", sheets: "sheet", "google-sheets": "sheet", spreadsheet: "sheet", excel: "sheet", csv: "sheet", airtable: "sheet",
  notion: "sheet", directory: "sheet", manual: "sheet",
  mailchimp: "email", kit: "email", convertkit: "email", beehiiv: "email", mailerlite: "email", newsletter: "email", substack: "email",
  luma: "event", eventbrite: "event", "ticket-tailor": "event", rsvpify: "event", event: "event", events: "event", meetup: "event",
  slack: "chat", discord: "chat", whatsapp: "chat", circle: "chat", telegram: "chat", chat: "chat", community: "chat",
  linkedin: "other",
};

/** Default precedence (first wins) for identity, organisation, role, location and status. */
export const IDENTITY_PRECEDENCE: readonly SourceKind[] = ["crm", "form", "sheet", "email", "event", "notes", "chat", "other"];
/** Default precedence for asks and offers (chat-derived stays inferred). */
export const ASKS_PRECEDENCE: readonly SourceKind[] = ["form", "notes", "crm", "sheet", "event", "email", "chat", "other"];

/** Membership status vocabulary → directory status. Unlisted values are not guessed. */
export const STATUS_VALUES: Readonly<Record<string, "member" | "lapsed" | "prospect" | "guest">> = {
  member: "member", members: "member", active: "member", "active member": "member", current: "member", paid: "member",
  admin: "member", owner: "member", "primary owner": "member", moderator: "member", fellow: "member", alumni: "member", alumnus: "member",
  lapsed: "lapsed", former: "lapsed", "former member": "lapsed", churned: "lapsed", cancelled: "lapsed", canceled: "lapsed",
  expired: "lapsed", left: "lapsed", resigned: "lapsed", inactive: "lapsed", paused: "lapsed",
  prospect: "prospect", applicant: "prospect", applied: "prospect", lead: "prospect", waitlist: "prospect", waitlisted: "prospect",
  pending: "prospect", invited: "prospect",
  guest: "guest", attendee: "guest", "event guest": "guest", registrant: "guest", visitor: "guest", approved: "guest", going: "guest",
  attending: "guest", "checked in": "guest", registered: "guest",
};

/** Chat-account states that mean the account is gone: kept as a note, never as activity. */
export const DEACTIVATED_VALUES: readonly string[] = ["deactivated", "disabled", "deleted", "removed", "banned", "left", "kicked"];

/** Opt-in vocabulary. Values not listed (including bare 1/0) are treated as unknown, never as consent. */
export const OPT_IN_YES: readonly string[] = [
  "yes", "y", "true", "opted in", "opt in", "opted-in", "opt-in", "subscribed", "subscriber", "consented", "consent given", "granted",
  "marketing contact", "confirmed", "active", "agreed", "accepted",
];
export const OPT_IN_NO: readonly string[] = [
  "no", "n", "false", "opted out", "opt out", "opted-out", "opt-out", "unsubscribed", "cleaned", "bounced", "complained", "spam",
  "non-marketing contact", "non marketing contact", "do not contact", "dnc", "do not email", "no consent", "consent withdrawn",
  "withdrawn", "cancelled", "canceled", "inactive", "junk", "blocked", "removed",
];
