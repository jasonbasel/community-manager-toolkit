/**
 * Engagement segments (DESIGN.md §3 and §6.5) and the recommended touch for each.
 */

export const SEGMENTS = ["regular", "occasional", "nudge_only", "dark", "never_contacted", "unknown"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_RULES: Readonly<Record<Segment, string>> = {
  regular: "Started 2 or more conversations in the last 90 days.",
  occasional: "Started 1 conversation in the last 90 days.",
  nudge_only: "Started none in the last 90 days but replied to a proactive touch.",
  dark: "Contacted before, but no reply or activity in the last 90 days.",
  never_contacted: "Never contacted and no conversation on record.",
  unknown: "Not enough data to tell (no conversation counts, replies or touches).",
};

export const RECOMMENDED_TOUCH: Readonly<Record<Segment, string>> = {
  regular: "Keep it personal and light. They already start conversations; offer a specific named introduction or event only when there is a real fit, and never add them to broadcasts.",
  occasional: "A specific named person or event that matches what they asked for, as a yes/no question.",
  nudge_only: "A specific person or event, not a general update: they reply when asked something concrete.",
  dark: "Make them wanted: a named person who asked to meet them, as a yes/no question. Not a broadcast or a 'we miss you'.",
  never_contacted: "A short profile ask first (what they want, what they can help with), personal and with one question.",
  unknown: "Collect activity data first (replies, conversations started, last touch) before choosing a touch.",
};
