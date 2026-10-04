/** Opt-out and removal signals in free-text notes (src/data/consent-signals.ts): every phrase in both directions, caps and timing. */
import { describe, expect, it } from "vitest";
import { MAX_NOTE_CHARS, MAX_NOTE_CLAUSES, OPT_OUT_SIGNALS, REMOVAL_SIGNALS } from "../src/data/consent-signals.js";
import { contactRefusal, findConsentSignals, isActioned, noteClauses } from "../src/text/consent.js";

const signal = (n: string) => { const s = findConsentSignals(n); return s.opt_out.length + s.removal.length > 0; };

describe("signal phrases (round-3 3, final-round 2)", () => {
  it("every listed form is a signal, in any clause and however it is qualified", () => {
    for (const n of [
      // standalone
      "DNC", "dnc", "D.N.C.", "D N C", "d.n.c", "Not a fit (D.N.C.)", "opted out", "opted-out", "opt out", "Opt-out", "opts out of intros", "unsubscribe", "unsubscribed", "unsubbed", "unsub",
      "Unsubscribing from everything", "replied STOP", "texted STOP", "She sent STOP", "replied stop", "reported as spam", "marked us as spam", "spam complaint", "GDPR erasure", "GDPR removal",
      "GDPR deletion request", "data deletion request", "DSAR received", "withdrew consent", "consent withdrawn", "revoked permission", "right to be forgotten", "wants to be forgotten",
      "forget me", "please forget about him", "delete my data", "delete my details", "delete my information", "erase her personal information", "delete her profile", "forget her details",
      "erase", "redact", "redacted the figures", "forget what she said about the merger", "remove me", "remove me from the list", "removed from all intro requests", "asked to be removed",
      "wants to be left alone", "take her off the mailing list", "blocked us on WhatsApp", "no contact",
      // the lexical net: a contact term with a refusal
      "Do not contact", "do not message", "do not email", "don't contact", "Don’t contact again", "never contact her again", "please don't introduce her to anyone",
      "does not wish to be contacted", "asked to not be contacted", "asked not to be invited", "should not be contacted", "must not be emailed", "don't reach out", "do not reach out again",
      "doesn't want to be contacted", "does not want to be contacted", "don't want to be contacted", "no longer wants intros", "didn't want any more messages", "wishes not to be contacted",
      "stop messaging", "stop contacting", "stopped all contact", "stop pinging", "please cease all contact", "asked us to stop", "told them to stop emailing", "asked us to stop sending messages",
      "no more messages", "no more intros", "no further contact", "no further calls", "no marketing", "no newsletter", "remove her from the newsletter", "blocked our messages",
      "Target asked not to receive intro requests", "asked not to be re-introduced", "not to be contacted", "She is not to be emailed", "asked that she not be contacted", "Not open to further intros",
      "doesn't want messages", "refuses all contact", "declined any further contact", "no comms please", "won't accept calls", "not keen to be emailed", "no WhatsApp messages",
      // negation that does not touch the phrase, or sits in another clause
      "No longer interested — DNC", "Never again — DNC", "Not a fit (DNC)", "No reply and unsubscribed", "No reply - DNC", "Not now, but then unsubscribed", "Not keen; stop messaging",
      "Never mind the dinner [DNC]", "No response / unsubscribed", "Don't email her again: she opted out", "Please do not remove her from the list", "No reply, unsubscribed",
      "2026-09-30 removal request: project details, do not use", "Target asked on 2026-08-22 to be removed from all intro requests and outreach; opt-out honoured",
      "Target asked on 2026-09-03 not to receive intro requests; opt-out honoured", "Replied that she does not want any more emails", "Replied asking to be removed from the mailing list",
    ]) expect(signal(n), n).toBe(true);
  });
  it("a negator cancels only the phrase it directly precedes, for the listed forms", () => {
    for (const n of [
      "not opted out", "has not opted out", "did not opt out", "hasn't opted out yet", "never opted out", "no longer opted out", "has not yet opted out", "isn't opted out",
      "never unsubscribed", "hasn't unsubscribed", "did not unsubscribe", "no longer unsubscribed", "never unsubbed",
      "don't forget", "do not forget her for the dinner", "Don't forget to send the deck", "never forget the venue", "mustn't forget the follow-up",
      "Bo did not opt out and is keen", "Not opted out; happy to hear from us",
    ]) expect(signal(n), n).toBe(false);
  });
  it("ordinary notes are not signals (at least twenty, as written in a real ledger)", () => {
    for (const n of [
      "", "Met at dinner, keen to follow up on hiring", "Prefers email to WhatsApp", "Sent the deck", "No reply to my email after 4 days; lapse notice sent", "Did not call back; try again Thursday",
      "Both said yes; requester did not send the first message", "Declined: no capacity this quarter", "Queued, not yet sent", "No contact details on file yet", "Stopped replying to messages in August",
      "Hasn't opened the invite", "Email bounced; try LinkedIn", "Will take the intro in October", "Connected on 3 Oct; outcome unknown", "Not a good fit for the dinner, suggest the breakfast instead",
      "She took notes at the dinner", "Remove the duplicate record in HubSpot", "Forgot to send the deck", "Follow-up call booked for Monday", "Texted to confirm the venue",
      "Marketing lead at Acme; wants intros to CFOs", "No-show at the event; invite again next month", "Not interested in the breakfast; keen on the dinner", "Never emailed her, only called",
      "Doesn't have an email for her yet", "Not sure the email reached her; resend", "Hasn't been contacted since the welcome", "Not yet contacted", "Never contacted; start with a welcome",
      "Wasn't invited to the dinner", "Don't have her email", "No email address on file", "Requester informed; both keen", "had forgotten to ask about the venue", "An unforgettable evening",
      "Re-engagement batch 2", "Stopped by the office to say hello", "No update since the dinner", "Dropped me a message afterwards", "Call went well; intro to Priya next",
    ]) expect(signal(n), n).toBe(false);
  });
  it("the net reads one clause at a time", () => {
    expect(contactRefusal(" does not wish to be contacted ")).toBe(true);
    expect(contactRefusal(" no reply to my email ")).toBe(false);
    expect(contactRefusal(" stopped replying to messages ")).toBe(false);
    expect(contactRefusal(" asked us to stop sending messages ")).toBe(true);
    expect(contactRefusal(" never contacted ")).toBe(false);
    expect(contactRefusal(" asked that she not be contacted ")).toBe(true);
    expect(contactRefusal(" sent the deck ")).toBe(false);
  });
  it("splits clauses on punctuation, dashes between words and the words and, but, then; keeps hyphenated words and dates whole", () => {
    expect(noteClauses("No longer interested — DNC").clauses).toEqual([" no longer interested ", " dnc "]);
    expect(noteClauses("Not a fit (D.N.C.)").clauses).toEqual([" not a fit ", " dnc "]);
    expect(noteClauses("No reply and unsubscribed, but keen then").clauses).toEqual([" no reply ", " unsubscribed ", " keen "]);
    expect(noteClauses("opt-out on 2026-09-30 - e-mail Delacroix-Burke").clauses).toEqual([" opt out on 2026 09 30 ", " email delacroix burke "]);
    expect(noteClauses("O'Brien’s note: Don't").clauses).toEqual([" obriens note ", " dont "]);
    expect(noteClauses("no-show; follow-up; reached out").clauses).toEqual([" noshow ", " followup ", " reachout "]);
  });
  it("returns rule ids only, never note text, and the tables are well formed", () => {
    const s = findConsentSignals("Zebedee Quarrington opted out; delete his notes about Ottoline");
    expect(JSON.stringify(s)).not.toMatch(/Zebedee|Ottoline/);
    expect(s.opt_out).toContain("opt_out");
    expect(s.removal).toContain("delete_info");
    expect(findConsentSignals("does not wish to be contacted").opt_out).toEqual(["contact_refusal"]);
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

describe("work per note is capped (final-round 6)", () => {
  it("reads at most the first characters and clauses, reports truncation, and still finds early signals", () => {
    const long = `DNC ${"a.".repeat(MAX_NOTE_CHARS)}`;
    const s = findConsentSignals(long);
    expect(s).toMatchObject({ truncated: true });
    expect(s.opt_out).toContain("dnc");
    expect(noteClauses("a.".repeat(2000)).clauses).toHaveLength(MAX_NOTE_CLAUSES);
    expect(noteClauses("a.".repeat(2000)).truncated).toBe(true);
    expect(noteClauses("a.".repeat(100)).truncated).toBe(false);
    expect(findConsentSignals("fine").truncated).toBe(false);
  });
  it("2 MB of adversarial notes (1,000 notes of 2,000 characters) is read in well under a second", () => {
    const notes = [
      "a.".repeat(1000), // 1,000 tiny clauses
      Array.from({ length: 250 }, (_v, i) => `dnc${i} x`).join(","), // many distinct keyword clauses
      "no email ".repeat(222), // one long clause full of terms
      "Zebedee asked not to be contacted; ".repeat(57),
    ];
    for (const n of notes) findConsentSignals(n); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) findConsentSignals(notes[i % notes.length]);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
