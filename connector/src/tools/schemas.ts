/** zod input schemas for every tool (list limits per DESIGN §4). Unknown keys are ignored. */
import { z } from "zod";

const s = (max: number) => z.string().max(max);
const opt = (max: number) => z.string().max(max).nullish();
const date = (what = "date") => z.string().max(40).describe(`${what}: YYYY-MM-DD (ISO date-times also accepted)`);
const textOrList = (maxText: number, maxItems: number, maxItem: number) => z.union([s(maxText), z.array(s(maxItem)).max(maxItems)]).nullish();

export const detectShape = {
  source_name: z.string().min(1).max(200).describe("Where the export came from, e.g. 'hubspot-contacts.csv' or 'Slack member list'"),
  headers: z.array(s(300)).min(1).max(200).describe("Column headers exactly as they appear in the export"),
  sample_rows: z.array(z.union([z.array(s(2000)).max(205), z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))]))
    .max(5).optional().describe("Up to 5 rows (arrays aligned with headers, or objects keyed by header) to check date and consent formats; values are never returned"),
};

const INFERABLE = ["asks", "offers", "tags", "organisation", "role", "location", "notes"] as const;
export const mergeRecord = z.object({
  name: opt(200), first_name: opt(100), last_name: opt(100), organisation: opt(300), role: opt(300), location: opt(300),
  email: opt(320).describe("Used only to match records; never returned"),
  source: z.string().min(1).max(60).describe("Source system or file kind, e.g. hubspot, salesforce, slack, discord, typeform, application-form, notes"),
  source_id: z.union([s(200), z.number()]).nullish().describe("The record's ID in its source (HubSpot Record ID, Slack user ID …)"),
  source_ids: z.array(s(200)).max(10).nullish().describe("Other IDs for the same person, written 'source:id' (e.g. 'slack:U0ABC')"),
  joined: opt(40), last_active: opt(40), status: opt(60),
  asks: textOrList(4000, 30, 1000), offers: textOrList(4000, 30, 1000), tags: textOrList(1000, 50, 100),
  opted_in: z.union([z.boolean(), s(60)]).nullish().describe("Explicit consent value as exported (yes/no, subscribed, 'Non-marketing contact' …); 1/0 alone is treated as unknown"),
  notes: opt(4000),
  inferred_fields: z.array(z.enum(INFERABLE)).max(7).nullish().describe("Fields in this record that were inferred from free text (labelled inferred in the directory)"),
});
export const mergeShape = {
  records: z.array(mergeRecord).min(1).max(5000),
  precedence: z.object({
    identity: z.array(s(60)).max(20).optional().describe("Order of sources or kinds (crm, form, sheet, email, event, notes, chat) for name, organisation, role, location, status"),
    asks_offers: z.array(s(60)).max(20).optional().describe("Order of sources or kinds for asks and offers"),
  }).optional(),
  today: date("Today's date").optional(),
  merge_exact_names: z.boolean().optional().describe("Also merge chat accounts (no email or organisation) whose display name exactly matches one member's full name. Default false: they are returned as uncertain."),
  decisions: z.array(z.object({ a: s(40), b: s(40), same: z.boolean() })).max(1000).optional()
    .describe("The manager's answers to earlier uncertain matches, by member_id or account id: same=true merges, same=false keeps apart"),
  date_order: z.enum(["DMY", "MDY"]).optional().describe("How to read ambiguous dates like 03/04/2026 (default DMY, day first)"),
};

export const pairShape = {
  event: z.object({ name: opt(200), starts_at: opt(40) }).optional(),
  guests: z.array(z.object({
    id: z.string().min(1).max(200).describe("A name or the platform's guest ID (never an email or phone number)"),
    name: z.string().max(200).optional(), organisation: opt(200), role: opt(200),
    side: opt(40).describe("founder, investor, operator, advisor, corporate, academic or talent"),
    tags: z.array(s(60)).max(20).nullish().describe("Short professional tags (sector, stage); never sensitive attributes"),
    asks: z.array(s(300)).max(20).nullish().describe("What they want, as short phrases"),
    offers: z.array(s(300)).max(20).nullish().describe("What they can offer, as short phrases"),
    member: z.boolean().nullish(), thin: z.boolean().nullish().describe("True when the profile has too little to match on"),
  })).min(1).max(1000),
  avoid_pairs: z.array(z.array(s(200)).length(2)).max(5000).optional().describe("Pairs of guest ids who must not be matched (already met, conflict)"),
  exclude_ids: z.array(s(200)).max(1000).optional().describe("Guest ids to leave out entirely"),
  options: z.object({
    max_per_person: z.number().int().min(1).max(10).optional().describe("Most introductions per person, counting their group and each backup link (default 3)"),
    backups: z.boolean().optional().describe("Give each guest a backup (default true)"),
    allow_trio: z.boolean().optional().describe("Allow a trio for an odd guest (default true)"),
    mode: z.enum(["match", "host_buddy"]).optional().describe("match (default) or host_buddy: one member hosts up to two non-members"),
  }).optional(),
};

export const segmentShape = {
  today: date("Today's date"),
  members: z.array(z.object({
    id: z.string().min(1).max(200).describe("A name or member_id (never an email or phone number)"),
    joined: opt(40), last_active: opt(40), last_inbound: opt(40).describe("Last message from the member to the community team"),
    proactive_touches: z.array(s(40)).max(200).nullish().describe("Dates of messages the team started (include queued ones)"),
    contacted_ever: z.boolean().nullish(), initiated_90d: z.number().int().min(0).max(100000).nullish().describe("Conversations the member started in the last 90 days"),
    opted_in: z.union([z.boolean(), s(60)]).nullish(),
  })).min(1).max(5000),
  options: z.object({ spacing_days: z.number().int().min(1).max(60).optional(), min_gap_hours: z.number().int().min(0).max(720).optional() }).optional(),
};

const planLedgerRow = z.object({
  intro_id: opt(120), created: opt(40), source: opt(40), event: opt(200), requester: z.string().min(1).max(200), target: z.string().min(1).max(200),
  status: opt(40), asked_on: opt(40), answered_on: opt(40), connected_on: opt(40), outcome: opt(40), next_check: opt(40), notes: opt(2000),
});
export const planShape = {
  today: date("Today's date"),
  ledger: z.array(planLedgerRow).max(5000).optional(),
  events: z.array(z.object({
    name: z.string().min(1).max(200), starts_at: z.string().max(40), matched: z.boolean().nullish().describe("Attendees already paired"),
    invitations_sent: z.boolean().nullish().describe("False for invite-only events whose invitations have not gone out"),
    people: z.array(s(200)).max(500).nullish().describe("Invitees who would receive an invitation (names or ids)"),
  })).max(50).optional().describe("Events in the next 14 days"),
  new_members: z.array(z.object({ id: opt(200), name: opt(200), joined: z.string().max(40), welcomed: z.boolean().nullish() })).max(1000).optional(),
  segments: z.array(z.object({ id: s(200), segment: s(40), eligible_now: z.boolean().nullish(), next_eligible: opt(40), opted_in: z.union([z.boolean(), s(60)]).nullish() })).max(5000).optional(),
  planned_touches: z.array(z.object({ person: s(200), date: s(40), kind: opt(60) })).max(5000).optional().describe("Messages already scheduled, so the plan does not double up"),
  options: z.object({
    max_items: z.number().int().min(1).max(20).optional(), spacing_days: z.number().int().min(1).max(60).optional(),
    min_gap_hours: z.number().int().min(0).max(720).optional(), reengagement_batch: z.number().int().min(1).max(50).optional(),
  }).optional(),
};

export const impactShape = {
  period: z.object({ start: date("Period start"), end: date("Period end (inclusive)") }),
  ledger: z.array(z.object({
    intro_id: opt(120), created: z.string().max(40), source: opt(40), status: z.string().max(40), asked_on: opt(40), answered_on: opt(40),
    connected_on: opt(40), outcome: opt(40), rating: z.union([z.number(), s(10)]).nullish(),
  })).max(10000),
  events: z.array(z.object({
    name: opt(200), date: opt(40), registered: z.number().int().min(0).nullish(), attended: z.number().int().min(0).nullish(),
    pairs_made: z.number().int().min(0).nullish(), pairs_met: z.number().int().min(0).nullish(),
  })).max(500).optional(),
  new_members: z.array(z.object({ id: opt(200), joined: opt(40), first_active: opt(40) })).max(10000).optional(),
};

export const draftShape = {
  channel: z.enum(["whatsapp", "sms", "email", "slack", "discord", "linkedin"]),
  text: z.string().min(1).max(20000).describe("The draft message body"),
  subject: z.string().max(500).optional().describe("Email subject line"),
  purpose: z.enum(["consent_ask", "connection", "welcome", "reengagement", "event", "followup", "other"]).optional(),
};
