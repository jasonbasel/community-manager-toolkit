/** segment_members: segment rules, spacing eligibility, opt-outs and data notes. */
import { describe, expect, it } from "vitest";
import { nextAllowed, segmentMembers } from "../src/tools/segment.js";

const run = (members: Parameters<typeof segmentMembers>[0]["members"], options?: { spacing_days?: number; min_gap_hours?: number }) =>
  segmentMembers({ today: "2026-10-02", members, options });
const seg = (o: ReturnType<typeof run>, id: string) => o.members.find((m) => m.id === id)!;

describe("segments", () => {
  const o = run([
    { id: "reg", initiated_90d: 3 },
    { id: "occ", initiated_90d: 1 },
    { id: "nudge", initiated_90d: 0, last_inbound: "2026-09-20", proactive_touches: ["2026-09-18"] },
    { id: "nudge2", last_inbound: "2026-09-10", proactive_touches: ["2026-09-08"] },
    { id: "occ2", last_inbound: "2026-09-10", proactive_touches: ["2026-08-01"] },
    { id: "dark", contacted_ever: true, last_inbound: "2026-05-01", proactive_touches: ["2026-06-01"] },
    { id: "never", contacted_ever: false },
    { id: "unknown" },
    { id: "act", last_active: "2026-09-01" },
    { id: "quiet", last_active: "2026-03-01" },
  ]);
  it("applies the documented rules in order", () => {
    expect(Object.fromEntries(o.members.map((m) => [m.id, m.segment]))).toEqual({
      reg: "regular", occ: "occasional", occ2: "occasional", act: "occasional", nudge: "nudge_only", nudge2: "nudge_only",
      dark: "dark", quiet: "dark", never: "never_contacted", unknown: "unknown",
    });
    expect(o.counts).toEqual({ regular: 1, occasional: 3, nudge_only: 2, dark: 2, never_contacted: 1, unknown: 1 });
  });
  it("says what data each segment rests on", () => {
    expect(seg(o, "act").reason).toMatch(/activity-based/);
    expect(o.data_used).toMatchObject({ members: 10, initiated_90d: 3, last_active: 2, activity_only: 2 });
    expect(o.warnings.join(" ")).toMatch(/last_active only/);
    expect(o.recommended_touch.dark).toMatch(/named person/);
  });
});

describe("spacing eligibility", () => {
  it("blocks the 7 days after a touch (inclusive) and reports the next date", () => {
    const o = run([{ id: "a", proactive_touches: ["2026-09-25"] }, { id: "b", proactive_touches: ["2026-09-24"] }, { id: "c", proactive_touches: ["2026-09-27"] }]);
    expect(seg(o, "a")).toMatchObject({ eligible_now: false, next_eligible: "2026-10-03" });
    expect(seg(o, "b")).toMatchObject({ eligible_now: true, next_eligible: "2026-10-02" });
    expect(seg(o, "c")).toMatchObject({ eligible_now: false, next_eligible: "2026-10-05" });
  });
  it("respects a queued touch and the 72-hour minimum gap", () => {
    expect(seg(run([{ id: "q", proactive_touches: ["2026-10-06"] }]), "q")).toMatchObject({ eligible_now: false, next_eligible: "2026-10-14" });
    const t = Date.parse("2026-10-01T18:00:00Z");
    expect(new Date(nextAllowed([t], 1, 72)!).toISOString().slice(0, 10)).toBe("2026-10-05");
  });
  it("never makes opted-out members eligible and flags unknown opt-in", () => {
    const o = run([{ id: "out", opted_in: "no" }, { id: "unk" }, { id: "yes", opted_in: true }]);
    expect(seg(o, "out")).toMatchObject({ eligible_now: false, next_eligible: null });
    expect(seg(o, "unk").reason).toMatch(/opt-in unknown/);
    expect(seg(o, "yes").reason).not.toMatch(/opt-in unknown/);
  });
});

describe("validation", () => {
  it("rejects bad input specifically", () => {
    expect(() => segmentMembers({ today: "soon", members: [{ id: "a" }] })).toThrow(/today 'soon'/);
    expect(() => run([{ id: "a" }, { id: "a" }])).toThrow(/members\[1\]\.id 'a' is duplicated/);
    expect(() => run([{ id: "a@b.com" }])).toThrow(/email/);
  });
});
