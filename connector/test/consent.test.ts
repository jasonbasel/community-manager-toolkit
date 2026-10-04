/** Opt-out and removal signals in free-text notes (src/data/consent-signals.ts): every phrase in both directions. */
import { describe, expect, it } from "vitest";
import { OPT_OUT_SIGNALS, REMOVAL_SIGNALS } from "../src/data/consent-signals.js";
import { findConsentSignals, isActioned, noteClauses } from "../src/text/consent.js";

const signal = (n: string) => { const s = findConsentSignals(n); return s.opt_out.length + s.removal.length > 0; };

describe("signal phrases (round-3 3)", () => {
  it("every listed form is a signal, in any clause and however it is qualified", () => {
    for (const n of [
      "DNC", "dnc", "Do not contact", "do not message", "do not email", "don't contact", "Don’t contact again", "never contact her again", "please don't introduce her to anyone",
      "opted out", "opted-out", "opt out", "Opt-out", "opts out of intros", "unsubscribe", "unsubscribed", "Unsubscribing from everything",
      "stop messaging", "stop contacting", "stopped all contact", "asked us to stop", "told them to stop emailing",
      "no more messages", "no more intros", "no further contact", "no contact",
      "doesn't want to be contacted", "does not want to be contacted", "don't want to be contacted", "no longer wants intros", "didn't want any more messages",
      "remove me", "remove me from the list", "removed from all intro requests", "asked to be removed", "wants to be left alone", "take her off the mailing list",
      "delete my data", "delete my details", "delete my information", "erase her personal information", "erase", "redact", "redacted the figures",
      "forget me", "please forget about him", "right to be forgotten", "wants to be forgotten", "forget what she said about the merger",
      "GDPR erasure", "GDPR removal request", "data deletion request", "DSAR received", "withdrew consent", "consent withdrawn", "revoked permission",
      "not to receive intro requests", "asked not to be re-introduced", "blocked us on WhatsApp",
      // negation that does not touch the phrase, or sits in another clause
      "No longer interested — DNC", "Never again — DNC", "Not a fit (DNC)", "No reply and unsubscribed", "No reply - DNC", "Not now, but then unsubscribed", "Not keen; stop messaging",
      "Never mind the dinner [DNC]", "No response / unsubscribed", "Don't email her again: she opted out", "Please do not remove her from the list",
      "2026-09-30 removal request: project details, do not use", "Target asked on 2026-08-22 to be removed from all intro requests and outreach; opt-out honoured",
      "Target asked on 2026-09-03 not to receive intro requests; opt-out honoured",
    ]) expect(signal(n), n).toBe(true);
  });
  it("a negator cancels only the phrase it directly precedes, for the listed forms", () => {
    for (const n of [
      "not opted out", "has not opted out", "did not opt out", "hasn't opted out yet", "never opted out", "no longer opted out", "has not yet opted out", "isn't opted out",
      "never unsubscribed", "hasn't unsubscribed", "did not unsubscribe", "no longer unsubscribed",
      "don't forget", "do not forget her for the dinner", "Don't forget to send the deck", "never forget the venue", "mustn't forget the follow-up",
      "Bo did not opt out and is keen", "Not opted out; happy to hear from us",
    ]) expect(signal(n), n).toBe(false);
  });
  it("ordinary notes are not signals", () => {
    for (const n of [
      "", "Both said yes; requester did not send the first message", "Declined: no capacity this quarter", "No reply after 4 days; lapse notice sent", "Morning-after follow-up unanswered",
      "Queued, not yet sent", "No contact details on file yet", "Forgot to send the deck", "She took notes at the dinner", "Dropped me a message afterwards", "Will take the intro in October",
      "Connected on 3 Oct; outcome unknown", "Requester informed; both keen", "Remove the duplicate record in HubSpot", "had forgotten to ask about the venue", "An unforgettable evening",
      "Re-engagement batch 2", "Email bounced; try LinkedIn", "Stopped by the office to say hello",
    ]) expect(signal(n), n).toBe(false);
  });
  it("splits clauses on punctuation, dashes between words and the words and, but, then; keeps hyphenated words and dates whole", () => {
    expect(noteClauses("No longer interested — DNC")).toEqual([" no longer interested ", " dnc "]);
    expect(noteClauses("Not a fit (DNC)")).toEqual([" not a fit ", " dnc "]);
    expect(noteClauses("No reply and unsubscribed, but keen then")).toEqual([" no reply ", " unsubscribed ", " keen "]);
    expect(noteClauses("opt-out on 2026-09-30 - e-mail Delacroix-Burke")).toEqual([" opt out on 2026 09 30 ", " e mail delacroix burke "]);
    expect(noteClauses("O'Brien’s note: Don't")).toEqual([" obriens note ", " dont "]);
  });
  it("returns rule ids only, never note text, and the tables are well formed", () => {
    const s = findConsentSignals("Zebedee Quarrington opted out; delete his notes about Ottoline");
    expect(JSON.stringify(s)).not.toMatch(/Zebedee|Ottoline/);
    expect(s.opt_out).toContain("opt_out");
    expect(s.removal).toContain("delete_info");
    const ids = [...OPT_OUT_SIGNALS, ...REMOVAL_SIGNALS].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of [...OPT_OUT_SIGNALS, ...REMOVAL_SIGNALS]) { expect(r.id).toMatch(/^[a-z_]+$/); expect(r.re.global, r.id).toBe(false); }
  });
  it("knows when a note says the request was dealt with", () => {
    expect(isActioned("opt-out honoured")).toBe(true);
    expect(isActioned("removal request: project details, do not use; actioned 2026-10-01")).toBe(true);
    expect(isActioned("DNC")).toBe(false);
  });
});
