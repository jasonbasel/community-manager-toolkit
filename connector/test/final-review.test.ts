/** Regression tests for the last T2 review of e67cede: strong refusals beat the reporting exemption, removal_request does not settle the other party, identity joins, separator-split phones in labels. */
import { describe, expect, it } from "vitest";
import { findConsentSignals } from "../src/text/consent.js";
import { planWeek, type PlanInput } from "../src/tools/plan.js";
import { labelHasContact } from "../src/tools/merge.js";
import { detectMemberFields } from "../src/tools/detect.js";

const signal = (n: string) => { const s = findConsentSignals(n); return s.opt_out.length + s.removal.length > 0; };
const base: PlanInput = { today: "2026-10-02" };

describe("strong refusals are never exempted by reporting words", () => {
  it("explicit instructions signal even when the clause also reports something", () => {
    for (const n of [
      "She has requested no further contact",
      "Do not contact as she has moved abroad",
      "Should not be contacted as she has left the company",
      "She replied don't contact me again",
      "has declined any further intros",
      "asked us never to contact her",
      "told us never to email her",
      "stopped replying and asked us to stop contacting her",
      "Since the event she has said no more messages",
    ]) expect(signal(n), n).toBe(true);
  });
  it("pure reports stay silent", () => {
    for (const n of [
      "No reply to my email",
      "never contacted",
      "Stopped replying to messages",
      "stopped responding after the first call",
      "Met at dinner, keen to follow up on hiring",
      "Prefers email to WhatsApp",
      "Sent the deck",
    ]) expect(signal(n), n).toBe(false);
  });
});

describe("removal_request for one party does not settle the other party's opt-out", () => {
  it("note says the requester is DNC while only removal_request: target is set → both held and flagged", () => {
    const out = planWeek({ ...base, ledger: [{ intro_id: "x", requester: "Ana Reyes", target: "Bo Chan", status: "accepted", next_check: "2026-09-30", removal_request: "target", notes: "Requester DNC" }], new_members: [{ name: "Ana Reyes", joined: "2026-09-25" }, { name: "Bo Chan", joined: "2026-09-25" }] });
    expect(out.items.find((i) => i.kind === "welcomes")?.people ?? []).toEqual([]);
    expect(out.needs_review.length).toBe(1);
  });
  it("opted_out: none contradicted by the note is flagged even with removal_request set", () => {
    const out = planWeek({ ...base, ledger: [{ intro_id: "y", requester: "Ana Reyes", target: "Bo Chan", status: "accepted", next_check: "2026-09-30", opted_out: "none", removal_request: "target", notes: "Requester asked us to stop contacting her" }] });
    expect(out.needs_review.length).toBe(1);
  });
});

describe("identity joins", () => {
  it("a bare ledger 'J S' opt-out holds the identical {name: 'J S'} welcome", () => {
    const out = planWeek({ ...base, ledger: [{ intro_id: "j", requester: "J S", target: "Priya Nandakumar", status: "withdrawn", opted_out: "requester" }], new_members: [{ name: "J S", joined: "2026-09-25" }] });
    expect(out.items.find((i) => i.kind === "welcomes")?.people ?? []).toEqual([]);
  });
  it("'王芳' and '王 芳' are one person", () => {
    const out = planWeek({ ...base, ledger: [{ intro_id: "w", requester: "王 芳", target: "Priya Nandakumar", status: "withdrawn", opted_out: "requester" }], new_members: [{ name: "王芳", joined: "2026-09-25" }] });
    expect(out.items.find((i) => i.kind === "welcomes")?.people ?? []).toEqual([]);
  });
});

describe("phones split by separators in labels and source names", () => {
  it("source labels", () => {
    expect(labelHasContact("whatsapp-chat-44-7700-900311")).toBe(true);
    expect(labelHasContact("WhatsApp_Chat_with_+44_7700_900311")).toBe(true);
    expect(labelHasContact("members-2026-09-30")).toBe(false);
    expect(labelHasContact("hubspot")).toBe(false);
  });
  it("detect_member_fields hides a source name that contains a phone", () => {
    const out = detectMemberFields({ source_name: "WhatsApp Chat - +44 7700 900311 - 2026-09-30.txt", headers: ["Name", "Company"] });
    expect(JSON.stringify(out)).not.toContain("900311");
  });
});
