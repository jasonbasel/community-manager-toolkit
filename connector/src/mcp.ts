/**
 * MCP server definition: seven read-only tools and three MCP App views. A fresh server is built
 * per request (stateless). Descriptions say what each tool does and when to use it; they never
 * tell the model to call another tool and never promote anything.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SERVICE } from "./config.js";
import { logTool } from "./log.js";
import { checkDraftMessage, type DraftInput } from "./tools/draft.js";
import { detectMemberFields, type DetectInput } from "./tools/detect.js";
import { InputError } from "./tools/errors.js";
import { computeImpactMetrics, type ImpactInput } from "./tools/impact.js";
import { mergeMemberRecords, type MergeInput } from "./tools/merge.js";
import { pairAttendees, type PairInput } from "./tools/pair.js";
import { planWeek, type PlanInput } from "./tools/plan.js";
import { detectShape, draftShape, impactShape, mergeShape, pairShape, planShape, segmentShape } from "./tools/schemas.js";
import { segmentMembers, type SegmentInput } from "./tools/segment.js";
import { summariseDetect, summariseDraft, summariseImpact, summariseMerge, summarisePairs, summarisePlan, summariseSegments } from "./tools/summaries.js";
import { getUiHtml, UI, UI_MIME, UI_NAMES, uiResourceMeta, uiTitle, uiToolMeta } from "./ui.js";

// Friendlier zod messages: a missing value says so, with the SDK adding " at guests[3].id".
z.config({
  customError: (iss) => {
    if (iss.code === "invalid_type" && iss.input === undefined) return "required value is missing";
    if (iss.code === "too_big" && iss.origin === "array") return `too many items (the limit is ${String(iss.maximum)})`;
    if (iss.code === "too_big" && iss.origin === "string") return `text is too long (the limit is ${String(iss.maximum)} characters)`;
    return undefined;
  },
});

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

export const TOOL_TEXT = {
  detect_member_fields: {
    title: "Detect member fields",
    description: "Maps the column headers of a member, contact or guest export to standard member fields (name, organisation, role, location, email for matching, joined, last active, status, asks, offers, tags, opt-in, notes) and guesses the source: CRMs (HubSpot, Salesforce, Attio, Pipedrive, Affinity, Zoho), Slack and Discord member lists, Airtable, Notion or spreadsheet tables, form responses (Typeform, Tally, Google Forms, Jotform), email tools (Mailchimp, Kit, beehiiv, MailerLite), Luma, Eventbrite and LinkedIn connections. Flags contact-detail and sensitive columns to leave out, inverted consent columns and date formats. Use it when a manager shares an export and you need to know which column means what. Takes the headers and up to five sample rows; nothing is stored.",
  },
  merge_member_records: {
    title: "Merge member records",
    description: "Merges member records from several sources (CRM, forms, notes, Slack, Discord, spreadsheets, event and email tools) into one de-duplicated member directory without contact details. Certain matches (same email, same source ID, or same name and organisation) are merged; uncertain ones (same or similar names that can't be confirmed, chat handles) are returned for the manager and never merged. Applies source precedence, keeps the latest activity and the most restrictive consent, and reports coverage and the most important profile gaps. Emails are used only for matching and are never returned. Use it to build, clean or refresh a member directory. Nothing is stored.",
  },
  pair_attendees: {
    title: "Pair event attendees",
    description: "Pairs event guests from their asks, offers, tags and sides under hard rules: never two people from the same organisation, never a pair on the avoid list, nobody in more than max_per_person introductions. The hardest-to-match guests go first, an odd guest joins the best-fitting pair as a trio, and everyone gets a backup where the rules allow. Returns groups with strength and the basis of each match, backups, anyone not placed and why, and the top connectors. Deterministic: the same input gives the same pairs. Use it when matching attendees before or at an event. Nothing is stored.",
  },
  segment_members: {
    title: "Segment members by engagement",
    description: "Sorts members into engagement segments (regular, occasional, nudge-only, dark, never contacted, unknown) from conversations started, replies, proactive touches and last activity, and works out who can be contacted now under the spacing rule (one proactive touch per 7 days, at least 72 hours apart; opted-out members never). Returns counts, each member's segment with the reason, and the recommended kind of touch for each segment. Use it for re-engagement planning or engagement reporting. Nothing is stored.",
  },
  plan_week: {
    title: "Plan the community week",
    description: "Builds a prioritised plan of at most seven items for the coming week from the intro ledger, events in the next 14 days, new members and optional engagement segments: removal requests, overdue intro answers and lapse notices, follow-through and outcome checks, events to match or invite, new members to welcome, a small re-engagement batch, and an impact report after a month or quarter ends. Runs one spacing check across the whole plan (one proactive touch per person in 7 days, at least 72 hours apart, opted-out people excluded) and reports what it moved. Use it for a weekly review or when a manager asks what to do this week. Nothing is stored.",
  },
  compute_impact_metrics: {
    title: "Compute impact metrics",
    description: "Computes exact counts and rates from an intro ledger for a period: requests, asked, accepted, declined, lapsed and connected; conversation rate (connected / requests); acceptance and lapse rates (over asked); outcome mix; average rating with n; outcome coverage; by source and by month; plus event totals and new-member activation (active within 30 days) when given. Numbers only, no benchmarks. Use it for community impact, ROI, board or sponsor reports. Nothing is stored.",
  },
  check_draft_message: {
    title: "Check a draft message",
    description: "Checks a draft message to a member against its channel's limits and message-craft rules: length (WhatsApp, LinkedIn connection notes, Discord), SMS segments and encoding, markdown in plain-text channels, more than one question, unfilled [placeholders], contact details in a consent ask, broadcast openers such as 'Hi all', 'we miss you' or 'just checking in', sensitive-attribute words, and an email without a subject. Returns each issue with its severity and an ok flag. Use it on a draft before showing it to the manager. It never sends anything.",
  },
} as const;
export type ToolName = keyof typeof TOOL_TEXT;

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function run<I, O extends object>(name: ToolName, fn: (i: I) => O, summarise: (o: O) => string, countIn: (i: I) => number, countOut: (o: O) => number) {
  return async (args: unknown): Promise<Result> => {
    const t0 = performance.now();
    const input = args as I;
    try {
      const out = fn(input);
      logTool(name, performance.now() - t0, "ok", countIn(input), countOut(out));
      return { content: [{ type: "text", text: summarise(out) }], structuredContent: out as Record<string, unknown> };
    } catch (e) {
      const isInput = e instanceof InputError;
      logTool(name, performance.now() - t0, isInput ? "input_error" : "error", countIn(input), 0);
      const msg = isInput ? `Input problem: ${(e as Error).message}` : `${name} could not finish (${(e as Error).name}). Nothing was stored; check the input shape and try again.`;
      return { content: [{ type: "text", text: msg }], isError: true };
    }
  };
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: SERVICE.name, title: SERVICE.title, version: SERVICE.version, websiteUrl: SERVICE.website },
    { instructions: "Exact, deterministic helpers for community managers. Every call is processed in memory and nothing is stored or logged apart from the tool name, timing and record counts." },
  );
  const reg = (name: ToolName, inputSchema: Record<string, z.ZodType>, handler: (a: unknown) => Promise<Result>, meta?: Record<string, unknown>) =>
    server.registerTool(name, { title: TOOL_TEXT[name].title, description: TOOL_TEXT[name].description, inputSchema, annotations: { title: TOOL_TEXT[name].title, ...READ_ONLY }, ...(meta ? { _meta: meta } : {}) },
      handler as never);

  reg("detect_member_fields", detectShape, run("detect_member_fields", (i: DetectInput) => detectMemberFields(i), summariseDetect, (i) => i.headers?.length ?? 0, (o) => o.mapping.length));
  reg("merge_member_records", mergeShape, run("merge_member_records", (i: MergeInput) => mergeMemberRecords(i), summariseMerge, (i) => i.records?.length ?? 0, (o) => o.members.length), uiToolMeta("directory"));
  reg("pair_attendees", pairShape, run("pair_attendees", (i: PairInput) => pairAttendees(i), summarisePairs, (i) => i.guests?.length ?? 0, (o) => o.groups.length), uiToolMeta("pairs"));
  reg("segment_members", segmentShape, run("segment_members", (i: SegmentInput) => segmentMembers(i), summariseSegments, (i) => i.members?.length ?? 0, (o) => o.members.length));
  reg("plan_week", planShape, run("plan_week", (i: PlanInput) => planWeek(i), summarisePlan, (i) => (i.ledger?.length ?? 0) + (i.events?.length ?? 0) + (i.new_members?.length ?? 0), (o) => o.items.length));
  reg("compute_impact_metrics", impactShape, run("compute_impact_metrics", (i: ImpactInput) => computeImpactMetrics(i), summariseImpact, (i) => i.ledger?.length ?? 0, (o) => o.rows_in_period), uiToolMeta("report"));
  reg("check_draft_message", draftShape, run("check_draft_message", (i: DraftInput) => checkDraftMessage(i), summariseDraft, () => 1, (o) => o.issues.length));

  for (const name of UI_NAMES) {
    server.registerResource(`${name}-view`, UI[name], { title: uiTitle(name), description: uiResourceMeta(name)["openai/widgetDescription"], mimeType: UI_MIME, _meta: uiResourceMeta(name) },
      async () => ({ contents: [{ uri: UI[name], mimeType: UI_MIME, text: await getUiHtml(name), _meta: uiResourceMeta(name) }] }));
  }
  return server;
}
