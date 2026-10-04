/**
 * Generic column aliases → canonical member fields (DESIGN §4). Keys are normalised headers
 * (lowercase, punctuation → single spaces). Platform-specific overrides live in platforms.ts.
 */

export const CANONICAL_FIELDS = [
  "name", "first_name", "last_name", "organisation", "role", "location", "email", "source", "source_id", "joined",
  "last_active", "status", "asks", "offers", "tags", "opted_in", "notes",
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/** Fields that may take several columns (their values are combined). */
export const MULTI_FIELDS: readonly CanonicalField[] = ["asks", "offers", "tags", "notes"];

export interface AliasRule {
  field: CanonicalField;
  /** 0–1; exact generic aliases default to 0.9. */
  confidence?: number;
  /** Shown as the mapping reason. */
  note?: string;
  /** For opted_in: the column means "opted OUT" (a true value means no). */
  inverted?: boolean;
}

const r = (field: CanonicalField, confidence?: number, note?: string, inverted?: boolean): AliasRule => ({ field, confidence, note, inverted });

export const GENERIC_ALIASES: Readonly<Record<string, AliasRule>> = {
  // identity
  "name": r("name"), "full name": r("name"), "fullname": r("name"), "contact name": r("name"), "member name": r("name"),
  "attendee name": r("name"), "guest name": r("name"), "your name": r("name"), "what is your name": r("name"), "whats your name": r("name"),
  "your full name": r("name"), "names": r("name", 0.7),
  "first name": r("first_name"), "firstname": r("first_name"), "first": r("first_name", 0.7), "given name": r("first_name"),
  "forename": r("first_name"), "fname": r("first_name", 0.8),
  "last name": r("last_name"), "lastname": r("last_name"), "last": r("last_name", 0.6), "surname": r("last_name"),
  "family name": r("last_name"), "lname": r("last_name", 0.8),
  "email": r("email", 0.95, "identity only; never returned"), "email address": r("email", 0.95, "identity only; never returned"),
  "e mail": r("email", 0.95, "identity only; never returned"), "e mail address": r("email", 0.95, "identity only; never returned"),
  "primary email": r("email", 0.95, "identity only; never returned"), "email addresses": r("email", 0.9, "first address; identity only"),
  "work email": r("email", 0.95, "identity only; never returned"), "contact email": r("email", 0.9, "identity only; never returned"),
  "your email": r("email", 0.9, "identity only; never returned"), "business email": r("email", 0.9, "identity only; never returned"),
  "secondary email": r("email", 0.4, "second address; keep the primary one"),
  // organisation and role
  "company": r("organisation"), "company name": r("organisation"), "organisation": r("organisation"), "organization": r("organisation"),
  "org": r("organisation", 0.85), "organisation name": r("organisation"), "organization name": r("organisation"),
  "employer": r("organisation"), "account name": r("organisation", 0.85, "CRM account = organisation"),
  "associated company": r("organisation", 0.85), "business": r("organisation", 0.75), "business name": r("organisation"),
  "firm": r("organisation", 0.8), "startup": r("organisation", 0.7), "startup name": r("organisation"),
  "organizations": r("organisation", 0.85, "first organisation"), "organisations": r("organisation", 0.85, "first organisation"),
  "company organisation": r("organisation"), "company organization": r("organisation"), "where do you work": r("organisation", 0.8),
  "your company": r("organisation"), "company or organisation": r("organisation"),
  "job title": r("role"), "title": r("role", 0.8), "role": r("role"), "position": r("role", 0.85), "job": r("role", 0.75),
  "job role": r("role"), "what i do": r("role", 0.85), "job titles": r("role", 0.85, "first title"), "occupation": r("role", 0.85),
  "designation": r("role", 0.8), "your role": r("role"), "headline": r("role", 0.6, "profile headline; role is usually in it"),
  // location
  "city": r("location"), "location": r("location"), "town": r("location"), "primary location": r("location"),
  "mailing city": r("location"), "where are you based": r("location", 0.85), "based in": r("location", 0.85), "home city": r("location"),
  "region": r("location", 0.5, "region only; city is better"), "country": r("location", 0.5, "country only; city is better"),
  "country region": r("location", 0.5, "country only; city is better"),
  "timezone": r("location", 0.4, "time zone is a rough location (Europe/London covers the whole UK); use only if no city"),
  "time zone": r("location", 0.4, "time zone is a rough location; use only if no city"),
  // ids
  "record id": r("source_id"), "contact id": r("source_id"), "id": r("source_id", 0.8), "user id": r("source_id"), "userid": r("source_id"),
  "api id": r("source_id"), "member id": r("source_id"), "person id": r("source_id"), "vid": r("source_id", 0.85), "uid": r("source_id", 0.8),
  "subscriber id": r("source_id"), "member number": r("source_id"), "membership number": r("source_id"),
  // dates
  "create date": r("joined", 0.85, "record created; usually when they joined"), "created date": r("joined", 0.85, "record created; usually when they joined"),
  "created": r("joined", 0.75, "record created"), "created at": r("joined", 0.75, "record created"), "joined": r("joined"),
  "joined at": r("joined"), "date joined": r("joined"), "member since": r("joined"), "join date": r("joined"), "joined date": r("joined"),
  "account created": r("joined", 0.85), "account created utc": r("joined", 0.85), "signup date": r("joined", 0.85),
  "sign up date": r("joined", 0.85), "signed up": r("joined", 0.85), "add time": r("joined", 0.8), "membership start": r("joined"),
  "joined server": r("joined"),
  "last activity date": r("last_active", 0.85), "last active": r("last_active"), "last activity": r("last_active", 0.85),
  "last activity time": r("last_active", 0.85), "last active utc": r("last_active"), "last seen": r("last_active"),
  "last interaction": r("last_active", 0.8), "last contacted": r("last_active", 0.7, "last time someone contacted them, not their own activity"),
  "last message": r("last_active"), "last message at": r("last_active"), "last post": r("last_active"), "last posted": r("last_active"),
  "last engagement date": r("last_active", 0.8), "last login": r("last_active"), "last visit": r("last_active", 0.85),
  "last active date": r("last_active"), "checked in at": r("last_active", 0.75, "event check-in time; counts as activity"),
  "submitted at": r("last_active", 0.7, "form submission time; counts as activity and picks their latest answers"),
  "timestamp": r("last_active", 0.65, "form submission time; counts as activity and picks their latest answers"),
  "submission date": r("last_active", 0.7, "form submission time"), "submit date utc": r("last_active", 0.7, "form submission time"),
  "last email interaction": r("last_active", 0.7, "email with your team; CRM interaction"),
  "last calendar interaction": r("last_active", 0.7, "meeting with your team; CRM interaction"), "last meeting": r("last_active", 0.7),
  // status
  "status": r("status", 0.7), "member status": r("status"), "membership status": r("status"), "membership": r("status", 0.75),
  "account status": r("status", 0.85), "member type": r("status", 0.6), "account type": r("status", 0.55, "account type (admin, member, guest)"),
  "approval status": r("status", 0.7, "event approval (approved, waitlist, declined): keep approved guests only"),
  "attendee status": r("status", 0.7, "attending, checked in, not attending"),
  "lifecycle stage": r("status", 0.35, "a sales stage, not membership: confirm before using"),
  // asks, offers, tags, notes
  "asks": r("asks"), "ask": r("asks"), "needs": r("asks", 0.8), "wants": r("asks", 0.8), "goals": r("asks", 0.7), "looking for": r("asks"),
  "hope to get": r("asks"), "hoping to get": r("asks"), "seeking": r("asks", 0.8),
  "offers": r("offers"), "offer": r("offers"), "can offer": r("offers"), "could offer": r("offers"), "expertise": r("offers", 0.8),
  "skills": r("offers", 0.75), "can help with": r("offers"), "help with": r("offers", 0.75), "superpowers": r("offers", 0.8),
  "tags": r("tags"), "tag": r("tags"), "labels": r("tags"), "label": r("tags"), "industry": r("tags", 0.8), "industries": r("tags", 0.8),
  "sector": r("tags", 0.8), "sectors": r("tags", 0.8), "interests": r("tags", 0.7), "topics": r("tags", 0.75), "segment": r("tags", 0.7),
  "segments": r("tags", 0.7), "roles": r("tags", 0.75, "server roles; drop staff roles such as Moderator"), "groups": r("tags", 0.6),
  "categories": r("tags", 0.7), "category": r("tags", 0.7), "stage": r("tags", 0.6), "side": r("tags", 0.6),
  "notes": r("notes"), "note": r("notes"), "description": r("notes", 0.75), "about": r("notes", 0.75), "bio": r("notes", 0.8),
  "biography": r("notes", 0.8), "comments": r("notes", 0.7), "comment": r("notes", 0.7), "anything else": r("notes", 0.7),
  "additional information": r("notes", 0.7), "additional info": r("notes", 0.7), "about me": r("notes", 0.8),
  "tell us about yourself": r("notes", 0.8), "introduce yourself": r("notes", 0.8),
  // consent
  "opted in": r("opted_in"), "opt in": r("opted_in"), "optin": r("opted_in"), "consent": r("opted_in", 0.85),
  "marketing consent": r("opted_in"), "gdpr consent": r("opted_in"), "email consent": r("opted_in"), "subscribed": r("opted_in", 0.8),
  "subscription status": r("opted_in", 0.85), "marketing contact status": r("opted_in", 0.85, "HubSpot marketing status: 'Marketing contact' = yes, 'Non-marketing contact' = no"),
  "marketing status": r("opted_in", 0.85), "accepts marketing": r("opted_in"), "whatsapp opt in": r("opted_in"),
  "email opt out": r("opted_in", 0.9, "inverted: 1/true means opted out (no); 0/false proves nothing (unknown)", true),
  "opted out": r("opted_in", 0.9, "inverted: true means no", true), "unsubscribed": r("opted_in", 0.85, "inverted: true means no", true),
  "unsubscribed from all email": r("opted_in", 0.9, "inverted: true means no", true), "do not contact": r("opted_in", 0.9, "inverted: true means no", true),
  "do not email": r("opted_in", 0.9, "inverted: true means no", true), "unsub time": r("opted_in", 0.9, "any value means they unsubscribed (no)", true),
};

/** Column headers that are deliberately not used, with the reason shown to the manager. */
export const IGNORED_HEADERS: Readonly<Record<string, string>> = {
  "lead source": "how they first arrived, not the record's source system",
  "original source": "how they first arrived, not the record's source system",
  "contact owner": "internal owner, not member data", "owner": "internal owner, not member data", "person owner": "internal owner",
  "relationship owner": "internal owner, not member data", "record owner": "internal owner, not member data",
  "username": "chat handle, not a name (kept out of the directory)", "displayname": "chat display name; fullname is used for the name",
  "member rating": "based on email opens and clicks, which are not activity",
  "last open date": "email opens are not activity (privacy protection inflates them)",
  "opens": "email opens are not activity", "open rate": "email opens are not activity", "clicks": "email clicks are not member activity",
  "connected on": "date you connected on LinkedIn, not a community join date",
  "connection strength": "CRM relationship score, not member data",
  "submission id": "form response id, not a person id", "respondent id": "form respondent id, not stable per person",
  "network id": "device fingerprint; never used", "token": "form response token",
  "score": "form quiz score", "order": "order number", "order date": "ticket order date, not a join date",
  "ticket type": "ticket type", "ticket name": "ticket name", "registered at": "event registration time, not a join date",
  "last modified date": "record edit time, not member activity", "last edited time": "record edit time, not member activity",
  "modified time": "record edit time, not member activity", "last changed": "record edit time, not member activity",
  "update time": "record edit time, not member activity",
};

/**
 * Question-style form headers → asks/offers. Checked in this order: help-requests first (so
 * "what do you need help with" is an ask), then offers, then asks.
 */
export const ASK_HELP_PHRASES: readonly string[] = ["need help", "want help", "get help", "help do you need", "help you need", "help would you like"];
export const OFFER_PHRASES: readonly string[] = [
  "could offer", "can offer", "you offer", "offer other", "offer members", "offer the community", "help with", "can help", "could help",
  "can you help", "help others", "help other", "happy to help", "you give", "can you give", "could you give", "expertise", "skills",
  "superpower", "contribute", "you bring", "bring to", "good at", "share with", "what you know",
];
export const ASK_PHRASES: readonly string[] = [
  "hoping to get", "hope to get", "hoping to find", "looking for", "want to get", "want from", "would like to get", "like to meet",
  "want to meet", "hoping to meet", "would you like to meet", "who should you meet", "what do you need", "are you seeking",
  "your goals", "goals for", "what brings you", "get out of", "biggest challenge", "your challenges", "your ask", "trying to achieve",
  "working on", "need from",
];
export const NOTE_PHRASES: readonly string[] = ["about yourself", "introduce yourself", "your bio", "tell us about", "anything else"];

/** Header patterns for contact details: listed in contact_columns and ignored downstream. */
export const CONTACT_PATTERNS: readonly RegExp[] = [
  /\b(phone|phones|mobile|cell|cellphone|telephone|tel|fax|sms|whatsapp)\b/,
  /\b(street|postcode|post code|zip|zip code|postal code|address line|address 1|address 2|home address|mailing address|mailing street)\b/,
  /^address$/,
  /\b(ip|ip address|optin ip|confirm ip|submission ip|subscribed from ip|ip opted in)\b/,
  /\b(linkedin|twitter|instagram|facebook|tiktok|github|website|url|profile url|social|x handle|bluesky|threads)\b/,
  /\b(latitude|longitude|lat|lng|gmtoff|dstoff|leid|euid|stripe customer id)\b/,
  /\b(skype|wechat|telegram|signal)\b/,
  /\b(eth address|solana address|wallet)\b/,
];

/**
 * Header patterns for sensitive personal data: listed in sensitive_columns and never used. Whole words
 * and specific phrases only ("Health status", "Diagnosis", "Relationship status"), so sector and CRM
 * headers such as "Industry (e.g. Healthcare)", "Healthtech focus", "Diagnostics" or "Relationship owner"
 * are not flagged.
 */
export const SENSITIVE_COLUMN_PATTERNS: readonly RegExp[] = [
  /\b(?:gender|sex|pronouns|ethnicity|ethnic|race|religion|religious|faith|sexual orientation|sexuality|disability|disabilities|disabled|accessibility|access needs|dietary|diet|allergies|allergy|medical|date of birth|dob|birthday|birth date|age|nationality|marital|caste|political|politics)\b/,
  /\bhealth (?:status|conditions?|issues?|problems?|needs?|info|information|details?|history|records?|data|notes?|declaration)\b/,
  /\bmental health\b/,
  /\bdiagnos(?:is|es|ed)\b/,
  /\bdisabilit(?:y|ies)\b/,
  /\bpregnan\w*/,
  /\breligio\w*/,
  /\bethnic\w*/,
  /\bracial\b/,
  /\bgender identity\b/,
  /\bmarried\b/,
  /\brelationship status\b/,
  /\b(?:maternity|paternity)\b/,
  /\bimpairments?\b/,
  /\bpolitic\w*/,
];

/** Words that show a row is a header row (a first row with none of them, made of names and organisations, is data). */
export const HEADER_WORDS: readonly string[] = [
  "name", "names", "first", "last", "full", "given", "surname", "email", "mail", "company", "organisation", "organization", "org", "employer",
  "title", "role", "job", "position", "city", "location", "country", "region", "state", "phone", "mobile", "date", "joined", "created", "updated",
  "modified", "status", "id", "tags", "tag", "notes", "note", "bio", "consent", "subscribed", "source", "type", "website", "url", "address",
  "postcode", "zip", "timezone", "industry", "sector", "interests", "asks", "offers", "owner", "lead", "stage", "score", "number", "amount",
  "total", "time", "year", "month", "team", "group", "level", "plan", "account", "contact", "member", "members", "event", "ticket", "order",
  "registered", "attendee", "guest", "approval", "checked", "response", "submitted", "timestamp", "label", "category", "description",
  "comments", "feedback", "rating", "count", "budget", "manager", "department", "segment", "cohort",
];

/** Header patterns that look like activity but are not (email engagement). */
export const NOT_ACTIVITY_PATTERNS: readonly RegExp[] = [/\b(open|opens|opened|open rate|click|clicks|clicked|member rating)\b/];
