/** check_draft_message: channel and message-craft checks on a draft (DESIGN §4.7). Never stores or sends anything. */
import { BROADCAST_PHRASES, GSM_BASIC, GSM_EXTENDED, LIMITS, PLAIN_TEXT_CHANNELS, VAGUE_CHECKIN_PHRASES } from "../data/messages.js";
import { findEmails, findPhones, findSensitive, fold, isWhatsAppLink } from "../text/normalise.js";

export type Channel = "whatsapp" | "sms" | "email" | "slack" | "discord" | "linkedin";
export type Purpose = "consent_ask" | "connection" | "welcome" | "reengagement" | "event" | "followup" | "other";
export interface DraftInput { channel: Channel; text: string; subject?: string; purpose?: Purpose }
export interface Issue { severity: "error" | "warning" | "info"; rule: string; detail: string }

const gsmBasic = new Set([...GSM_BASIC]), gsmExt = new Set([...GSM_EXTENDED]);
const CHANNEL_NAME: Record<Channel, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email", slack: "Slack", discord: "Discord", linkedin: "LinkedIn" };

export function smsInfo(text: string) {
  const nonGsm = [...new Set([...text].filter((c) => !gsmBasic.has(c) && !gsmExt.has(c)))];
  if (nonGsm.length) {
    const units = text.length; // UTF-16 code units: emoji count as 2
    return { encoding: "UCS-2" as const, units, segments: units <= LIMITS.smsUcs2 ? 1 : Math.ceil(units / LIMITS.smsUcs2Multi), nonGsm };
  }
  const units = [...text].reduce((s, c) => s + (gsmExt.has(c) ? 2 : 1), 0);
  return { encoding: "GSM-7" as const, units, segments: units <= LIMITS.smsGsm ? 1 : Math.ceil(units / LIMITS.smsGsmMulti), nonGsm };
}

const phraseHits = (text: string, phrases: readonly string[]) => {
  const t = ` ${fold(text).replace(/[’`]/g, "'").replace(/[^a-z0-9@' ]+/g, " ").replace(/\s+/g, " ")} `;
  return phrases.filter((p) => t.includes(` ${p} `) || (p.startsWith("@") && t.includes(p)));
};

export function checkDraftMessage(input: DraftInput) {
  const { channel } = input;
  const purpose = input.purpose ?? "other";
  const text = input.text ?? "";
  const issues: Issue[] = [];
  const add = (severity: Issue["severity"], rule: string, detail: string) => issues.push({ severity, rule, detail });
  const len = [...text].length;
  const name = CHANNEL_NAME[channel];

  // length
  if (channel === "whatsapp") {
    if (len > LIMITS.whatsappHard) add("error", "length", `${len} characters: WhatsApp template bodies are capped at ${LIMITS.whatsappHard.toLocaleString("en-GB")}. Cut it to under ${LIMITS.whatsappAdvised}.`);
    else if (len > LIMITS.whatsappAdvised) add("warning", "length", `${len} characters: keep WhatsApp messages under ${LIMITS.whatsappAdvised} (2 to 4 short lines).`);
  }
  if (channel === "linkedin" && len > LIMITS.linkedinNote) add("error", "length", `${len} characters: LinkedIn connection notes are capped at ${LIMITS.linkedinNote}. If this is a message to an existing connection, keep it short anyway.`);
  if (channel === "discord" && len > LIMITS.discordHard) add("error", "length", `${len} characters: Discord messages are capped at ${LIMITS.discordHard.toLocaleString("en-GB")}.`);
  if ((channel === "slack" || channel === "discord") && len > LIMITS.dmAdvised && len <= LIMITS.discordHard) add("warning", "length", `${len} characters: long for a direct message; aim for under ${LIMITS.dmAdvised}.`);
  if (channel === "email" && len > LIMITS.emailAdvised) add("info", "length", `${len} characters: a short email (3 to 5 lines) gets more replies.`);
  let sms: ReturnType<typeof smsInfo> | null = null;
  if (channel === "sms") {
    sms = smsInfo(text);
    if (sms.segments > 1) {
      const why = sms.encoding === "UCS-2" ? ` (${sms.nonGsm.slice(0, 3).map((c) => `'${c}'`).join(", ")} force${sms.nonGsm.length === 1 ? "s" : ""} UCS-2, which allows ${LIMITS.smsUcs2} characters per text)` : "";
      add("warning", "sms_segments", `Sends as ${sms.segments} SMS segments${why}. One segment is ${sms.encoding === "UCS-2" ? LIMITS.smsUcs2 : LIMITS.smsGsm} characters.`);
    }
  }

  // markdown in plain-text channels
  if (PLAIN_TEXT_CHANNELS.includes(channel)) {
    const md: string[] = [];
    if (/\*\*[^*\n]+\*\*|__[^_\n]+__/.test(text)) md.push("bold markers (** or __)");
    else if (/(^|\s)\*[^*\n]+\*(?=\s|[.,!?;:]|$)/m.test(text)) md.push("*asterisk* emphasis");
    if (/(^|\s)_[^_\n]+_(?=\s|[.,!?;:]|$)/m.test(text)) md.push("_underscore_ emphasis");
    if (/^\s{0,3}#{1,6}\s/m.test(text)) md.push("headings (#)");
    // Line-start patterns use [ \t] (never \s, which crosses newlines) and link text excludes "[", so every check stays linear.
    if (/\[[^[\]\n]{1,500}\]\([^()[\]\s]{1,2000}\)/.test(text)) md.push("markdown links [text](url)");
    if (/`[^`\n]+`|```/.test(text)) md.push("code formatting (`)");
    if (/^[ \t]*(?:[-*•+]|\d{1,9}[.)])[ \t]+\S/m.test(text)) md.push("list bullets");
    if (/^[ \t]*\|[^\n]*\|[ \t]*$/m.test(text) || /\|[ \t]*:?-{3,}/.test(text)) md.push("a table");
    if (/~~[^~\n]+~~/.test(text)) md.push("strikethrough (~~)");
    if (md.length) add("warning", "markdown", `${name} shows text as typed: remove ${md.join(", ")}. Use plain sentences.`);
  }

  // questions
  const noUrls = text.replace(/https?:\/\/\S+/g, " ");
  const questions = (noUrls.match(/\?+/g) ?? []).length;
  if (questions > 1) add("warning", "questions", `${questions} questions: ask one clear yes/no (or 3-option) question per message.`);

  // placeholders
  const ph = [...new Set([...(text.match(/\[[^\]\n]{1,40}\](?!\()/g) ?? []), ...(text.match(/\{\{[^}\n]{1,40}\}\}/g) ?? []), ...(text.match(/<[A-Za-z][A-Za-z _-]{1,30}>/g) ?? [])])];
  if (ph.length) add("error", "placeholders", `Unfilled placeholder${ph.length > 1 ? "s" : ""}: ${ph.slice(0, 5).join(", ")}.`);

  // contact details in a consent ask
  const phones = findPhones(text);
  const hasEmail = findEmails(text).length > 0, hasPhone = phones.some((p) => !isWhatsAppLink(p)), hasWaLink = phones.some(isWhatsAppLink);
  if (purpose === "consent_ask" && (hasEmail || hasPhone || hasWaLink)) {
    const found = [hasEmail && "an email address", hasPhone && "a phone number", hasWaLink && "a WhatsApp link (it carries a phone number)"].filter(Boolean) as string[];
    add("error", "contact_details", `The consent ask contains ${found.length > 1 ? `${found.slice(0, -1).join(", ")} and ${found[found.length - 1]}` : found[0]}. Share contact details only after both people say yes.`);
  } else if ((hasEmail || hasPhone || hasWaLink) && (channel === "slack" || channel === "discord")) {
    add("info", "contact_details", "Contains contact details: check both people agreed to share them.");
  }

  // broadcast smells and vague check-ins
  const bc = phraseHits(text, BROADCAST_PHRASES);
  if (bc.length) add("warning", "broadcast", `Reads like a broadcast ("${bc[0]}"). Address one named person; personal messages get far more replies than broadcasts.`);
  const vague = phraseHits(text, VAGUE_CHECKIN_PHRASES);
  if (vague.length) add("warning", "vague_checkin", `"${vague[0]}" gives no reason to reply. Name a person who asked for them, or a specific event, with a yes/no question.`);

  // sensitive attributes
  const sens = findSensitive(`${input.subject ?? ""} ${text}`);
  if (sens.length) add("warning", "sensitive_attribute", `Mentions ${[...new Set(sens.map((s) => `'${s.term}'`))].slice(0, 3).join(", ")} (${[...new Set(sens.map((s) => s.category))].join(", ")}). Keep reasons to professional overlap; describe organisations by sector if their name signals a personal attribute.`);

  // email subject
  if (channel === "email") {
    const subj = (input.subject ?? "").trim();
    const inline = /^\s*subject\s*:/i.test(text);
    if (!subj && !inline) add("error", "email_subject", "Email has no subject line: add a short, specific subject.");
    else if (!subj && inline) add("info", "email_subject", "The subject is written inside the body: put it in the subject field.");
  }

  const ok = !issues.some((i) => i.severity === "error" || i.severity === "warning");
  return {
    channel, purpose, ok, issues,
    stats: {
      characters: len, words: (text.trim().match(/\S+/g) ?? []).length, lines: text.split(/\n/).filter((l) => l.trim()).length, questions,
      ...(sms ? { sms_segments: sms.segments, sms_encoding: sms.encoding } : {}),
    },
  };
}
export type DraftOutput = ReturnType<typeof checkDraftMessage>;
