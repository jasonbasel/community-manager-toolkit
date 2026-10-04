/** check_draft_message: every rule in DESIGN §4.7. */
import { describe, expect, it } from "vitest";
import { checkDraftMessage, smsInfo, type DraftInput } from "../src/tools/draft.js";

const rules = (d: DraftInput) => checkDraftMessage(d).issues.map((i) => `${i.severity}:${i.rule}`);

describe("channel limits", () => {
  it("WhatsApp: over 1,024 is an error, over 500 a warning", () => {
    expect(rules({ channel: "whatsapp", text: "a ".repeat(520) })).toEqual(["error:length"]);
    expect(rules({ channel: "whatsapp", text: "a".repeat(600) })).toEqual(["warning:length"]);
  });
  it("LinkedIn connection notes over 300 characters are flagged", () => {
    expect(rules({ channel: "linkedin", text: "x".repeat(301) })).toEqual(["error:length"]);
    expect(checkDraftMessage({ channel: "linkedin", text: "x".repeat(300) }).ok).toBe(true);
  });
  it("Discord over 2,000 is an error", () => {
    expect(rules({ channel: "discord", text: "y".repeat(2001) })).toContain("error:length");
  });
  it("counts SMS segments and spots UCS-2 characters", () => {
    expect(smsInfo("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsInfo("a".repeat(161))).toMatchObject({ segments: 2 });
    expect(smsInfo("It’s great")).toMatchObject({ encoding: "UCS-2", nonGsm: ["’"] });
    expect(checkDraftMessage({ channel: "sms", text: "It’s " + "a".repeat(80) }).issues[0].detail).toMatch(/UCS-2/);
  });
});

describe("message craft", () => {
  it("flags markdown on WhatsApp but not on Slack", () => {
    const md = "**Hi Kasper**\n- point one\n# Heading";
    expect(rules({ channel: "whatsapp", text: md })).toContain("warning:markdown");
    expect(rules({ channel: "slack", text: md })).not.toContain("warning:markdown");
    expect(checkDraftMessage({ channel: "whatsapp", text: md }).issues[0].detail).toMatch(/bold markers.*headings.*list bullets/);
  });
  it("flags more than one question", () => {
    expect(rules({ channel: "email", subject: "Hi", text: "Free on Tuesday? Or Wednesday?" })).toContain("warning:questions");
    expect(rules({ channel: "email", subject: "Hi", text: "See https://x.com/a?b=c. Free on Tuesday?" })).not.toContain("warning:questions");
  });
  it("flags unfilled placeholders", () => {
    expect(checkDraftMessage({ channel: "whatsapp", text: "Hi [Name], meet {{1}} at <event>." }).issues.find((i) => i.rule === "placeholders")?.detail).toMatch(/\[Name\].*\{\{1\}\}.*<event>/);
  });
  it("flags contact details in a consent ask, without repeating them", () => {
    const r = checkDraftMessage({ channel: "whatsapp", purpose: "consent_ask", text: "Odalys asked to meet you. Yes or no? She is on 07700 900114 and odalys@example.com" });
    const i = r.issues.find((x) => x.rule === "contact_details")!;
    expect(i.severity).toBe("error");
    expect(i.detail).toMatch(/an email address and a phone number/);
    expect(JSON.stringify(r)).not.toMatch(/07700|example\.com/);
    expect(rules({ channel: "whatsapp", purpose: "connection", text: "Here is her number: 07700 900114" })).not.toContain("error:contact_details");
  });
  it("flags broadcast openers, vague check-ins and sensitive-attribute words", () => {
    expect(rules({ channel: "whatsapp", text: "Hi all, we miss you!" })).toEqual(["warning:broadcast", "warning:vague_checkin"]);
    expect(rules({ channel: "slack", text: "@channel Just checking in" })).toEqual(["warning:broadcast", "warning:vague_checkin"]);
    expect(checkDraftMessage({ channel: "whatsapp", text: "Meet Dominic from Out & Proud Travel Co." }).issues[0]).toMatchObject({ rule: "sensitive_attribute" });
  });
  it("requires an email subject", () => {
    expect(rules({ channel: "email", text: "Hello Harriet" })).toEqual(["error:email_subject"]);
    expect(rules({ channel: "email", text: "Subject: Invite\nHello Harriet" })).toEqual(["info:email_subject"]);
    expect(checkDraftMessage({ channel: "email", subject: "Founders & Operators Evening", text: "Hello Harriet" }).ok).toBe(true);
  });
  it("passes a short, plain, one-question welcome", () => {
    const r = checkDraftMessage({ channel: "whatsapp", purpose: "welcome", text: "Hi Kasper, welcome to Northbridge. Yusuf at Aperture Drones would like to meet you about warehouse pilots. Shall I introduce you?\n— Priya, Northbridge" });
    expect(r).toMatchObject({ ok: true, issues: [] });
    expect(r.stats).toMatchObject({ questions: 1, lines: 2 });
  });
});

describe("review findings 9 and 10", () => {
  it("flags a WhatsApp link in a consent ask", () => {
    const r = checkDraftMessage({ channel: "whatsapp", purpose: "consent_ask", text: "Odalys would like to meet you. Yes or no? Reply here or on wa.me/447700900114" });
    const i = r.issues.find((x) => x.rule === "contact_details")!;
    expect(i).toMatchObject({ severity: "error" });
    expect(i.detail).toMatch(/a WhatsApp link/);
    expect(JSON.stringify(r)).not.toMatch(/447700900114/);
    expect(rules({ channel: "whatsapp", purpose: "consent_ask", text: "Shall I introduce you? Call 4155550100." })).toContain("error:contact_details");
  });
  it("checks worst-case 20,000-character drafts in under 100 ms each", () => {
    const units = ["a", "\n", " \n", "[", "[a](", "*", " *a", "_", "|", "\n|", "- ", "1.", "a@", "@a.", "+1", "1 ", "0", "#", "`", "~", "wa.me/"];
    const texts = units.map((u) => u.repeat(Math.ceil(20000 / u.length)).slice(0, 20000));
    checkDraftMessage({ channel: "whatsapp", text: texts[0] }); // warm up
    for (const [k, text] of texts.entries()) {
      const t0 = performance.now();
      checkDraftMessage({ channel: "whatsapp", purpose: "consent_ask", text });
      expect(performance.now() - t0, JSON.stringify(units[k])).toBeLessThan(100);
    }
  });
});
