/**
 * Message-check data for check_draft_message (DESIGN §4.7, shared/message-craft.md).
 */

/** Openers that make a message read as a broadcast. */
export const BROADCAST_PHRASES: readonly string[] = [
  "dear members", "dear member", "dear all", "dear everyone", "dear community", "dear friends", "hi all", "hi everyone",
  "hi everybody", "hello all", "hello everyone", "hey all", "hey everyone", "hi team", "hello team", "hi folks", "hey folks",
  "hi guys", "hey guys", "to all members", "attention all", "@channel", "@here", "@everyone",
];

/** Guilt or vague check-ins that give the member no reason to reply. */
export const VAGUE_CHECKIN_PHRASES: readonly string[] = [
  "we miss you", "we've missed you", "we have missed you", "missing you", "just checking in", "checking in on you",
  "touching base", "touch base", "haven't heard from you", "have not heard from you", "it's been a while", "it has been a while",
  "long time no see", "just wanted to reach out", "just reaching out",
];

/** Channel limits. */
export const LIMITS = {
  whatsappHard: 1024,
  whatsappAdvised: 500,
  linkedinNote: 300,
  discordHard: 2000,
  dmAdvised: 600,
  emailAdvised: 1500,
  smsGsm: 160,
  smsGsmMulti: 153,
  smsUcs2: 70,
  smsUcs2Multi: 67,
} as const;

/** GSM 03.38 basic + extension characters; anything else forces UCS-2 (70-character segments). */
export const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
export const GSM_EXTENDED = "^{}\\[~]|€\f";

/** Channels that show text literally (markdown markers appear as typed). */
export const PLAIN_TEXT_CHANNELS: readonly string[] = ["whatsapp", "sms", "linkedin", "email"];
