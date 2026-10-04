/**
 * Human-readable text results. Each is complete without the in-chat view: it carries every
 * decision the assistant needs (ids, basis, reasons), compactly. Long lists are capped with a
 * count; the full data is always in structuredContent. British spelling, no emoji.
 */
import type { DetectOutput } from "./detect.js";
import type { DraftOutput } from "./draft.js";
import type { ImpactOutput, Rate } from "./impact.js";
import type { MergeOutput } from "./merge.js";
import type { PairOutput } from "./pair.js";
import { UNCLEAR_OPT_OUT, type PlanOutput } from "./plan.js";
import type { SegmentOutput } from "./segment.js";

const p = (r: Rate) => `${r.pct}% (${r.num}/${r.den})`;
const more = (n: number, shown: number) => (n > shown ? `\n… ${n - shown} more in the structured result.` : "");
const plural = (n: number, w: string, pl = `${w}s`) => `${n} ${n === 1 ? w : pl}`;

export function summariseDetect(o: DetectOutput): string {
  const lines = [
    `${o.source_name}: looks like ${o.platform_guess.name} (confidence ${o.platform_guess.confidence}; ${o.platform_guess.evidence.slice(0, 4).join(", ")}).`,
    "Mapping:",
    ...o.mapping.map((m) => `- ${m.column} → ${m.field} (${m.confidence})${m.inverted ? " [inverted]" : ""}${m.date_format ? ` [${m.date_format}]` : ""}${m.values ? ` values: ${Object.entries(m.values).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}: ${m.reason}`),
  ];
  if (o.unmapped.length) lines.push(`Not used: ${o.unmapped.map((u) => `${u.column} (${u.reason})`).join("; ")}.`);
  if (o.contact_columns.length) lines.push(`Contact columns, ignored downstream: ${o.contact_columns.map((c) => c.column).join(", ")}.`);
  if (o.sensitive_columns.length) lines.push(`Sensitive columns, never used: ${o.sensitive_columns.map((c) => c.column).join(", ")}.`);
  if (o.warnings.length) lines.push("Notes:", ...o.warnings.map((w) => `- ${w}`));
  return lines.join("\n");
}

export function summariseMerge(o: MergeOutput): string {
  const s = o.stats;
  const cov = Object.entries(s.coverage).map(([k, v]) => `${k.replace("_", " ")} ${v}%`).join(", ");
  const lines = [
    `Merged ${s.input_records} records (${Object.entries(s.by_source).map(([k, v]) => `${k} ${v}`).join(", ")}) into ${plural(s.unique_members, "member")}; ${s.merged} duplicate records folded in${s.merged_by_exact_name ? `, ${s.merged_by_exact_name} of them chat accounts matched on an exact full name` : ""}.`,
    s.unresolved_accounts ? `${plural(s.unresolved_accounts, "chat account")} could not be tied to a person for certain and are not counted as members (listed below).` : "",
    `Coverage: ${cov}.`,
    "No email addresses or phone numbers are included; source_ids and email_domain identify records instead.",
  ].filter(Boolean);
  if (o.uncertain_matches.length) {
    const total = o.stats.uncertain_total;
    lines.push(`Uncertain matches for the manager (${total}${total > o.uncertain_matches.length ? `; the ${o.uncertain_matches.length} strongest are in the structured result` : ""}, never merged):`);
    const shown = o.uncertain_matches.slice(0, 40);
    for (const u of shown) lines.push(`- ${u.a.name} [${u.a.id}] ↔ ${u.b ? `${u.b.name} [${u.b.id}]` : "no candidate"} (${u.kind}, ${u.score}): ${u.reason}`);
    lines.push(more(o.uncertain_matches.length, shown.length).trim());
  }
  if (o.same_organisation.length) lines.push(`Colleagues at the same organisation (never pair them): ${o.same_organisation.map((g) => `${g.organisation} (${g.member_ids.length})`).join(", ")}.`);
  if (o.gaps.length) lines.push(`Top profile gaps: ${o.gaps.slice(0, 10).map((g) => `${g.name} (missing ${g.missing.join(", ")}; ${g.why})`).join("; ")}${o.gaps.length > 10 ? `; ${o.gaps.length - 10} more` : ""}.`);
  if (o.warnings.length) lines.push("Notes:", ...o.warnings.map((w) => `- ${w}`));
  lines.push("Directory (name | organisation | role | location | last active | opt-in | quality | member_id):");
  const shown = o.members.slice(0, 150);
  for (const m of shown) lines.push(`- ${m.name || "(no name)"} | ${m.organisation} | ${m.role} | ${m.location} | ${m.last_active || "never"}${m.last_active_source ? ` (${m.last_active_source})` : ""} | ${m.opted_in} | ${m.profile_quality} | ${m.member_id}`);
  lines.push(more(o.members.length, shown.length).trim());
  return lines.filter(Boolean).join("\n");
}

export function summarisePairs(o: PairOutput): string {
  const s = o.stats;
  const name = (id: string) => o.guests[id]?.name ?? id;
  const ev = o.event.name ? ` for ${o.event.name}` : "";
  const lines = [
    `Paired ${s.placed} of ${s.considered} guests${ev}: ${plural(s.pairs, "pair")}${s.trios ? ` and ${plural(s.trios, "trio")}` : ""} (strong ${s.strong}, medium ${s.medium}, weak ${s.weak}). ${s.with_backup} have a backup; ${s.without_backup} without.`,
    o.excluded.same_org.length ? `Same-organisation pairs blocked: ${o.excluded.same_org.map((g) => `${g.organisation} (${g.ids.map(name).join(", ")})`).join("; ")}.` : "No same-organisation conflicts in the list.",
  ];
  if (o.excluded.avoid.length) lines.push(`Avoid pairs respected: ${o.excluded.avoid.length}.`);
  if (o.excluded.removed.length) lines.push(`Removed on request: ${o.excluded.removed.map(name).join(", ")}.`);
  lines.push("Groups (strength, score, basis; the reason line must come only from this basis):");
  for (const g of o.groups) {
    const basis = g.basis.ask_offer.map((e) => `${name(e.asker)} wants ${e.keywords.join(", ")} ← ${name(e.offerer)}`).join("; ");
    const extra = [g.basis.shared_tags.length ? `shared: ${g.basis.shared_tags.join(", ")}` : "", g.basis.complementary ? g.basis.complementary : ""].filter(Boolean).join("; ");
    lines.push(`${g.group}. ${g.ids.map(name).join(" + ")} [${g.strength}, ${g.score}] ${basis || extra ? `${basis}${basis && extra ? "; " : ""}${extra}` : "little stated overlap"} | backups: ${g.ids.map((id) => `${name(id)} → ${o.backups[id] ? name(o.backups[id]!) : o.backup_notes[id] ?? "none"}`).join("; ")}`);
  }
  if (o.unmatched.length) lines.push(`Not placed: ${o.unmatched.map((u) => `${name(u.id)} (${u.reason})`).join("; ")}.`);
  const thin = Object.entries(o.guests).filter(([, g]) => g.thin).map(([id]) => name(id));
  if (thin.length) lines.push(`Thin profiles (tentative matches; confirm at the door, don't invent details): ${thin.join(", ")}.`);
  if (o.describe_org_neutrally.length) lines.push(`Describe these guests' organisations by sector only, or leave them out: ${o.describe_org_neutrally.map(name).join(", ")}.`);
  if (o.connectors_top5.length) lines.push(`Top connectors in the room: ${o.connectors_top5.map((c) => `${name(c.id)} (${c.good_matches} good matches)`).join(", ")}.`);
  lines.push("Registration is not attendance: keep the backups and re-pair at the door where possible.");
  if (o.warnings.length) lines.push(...o.warnings.map((w) => `Note: ${w}`));
  return lines.join("\n");
}

export function summariseSegments(o: SegmentOutput): string {
  const c = o.counts;
  const lines = [
    `Segments on ${o.today} (${o.data_used.members} members): regular ${c.regular}, occasional ${c.occasional}, nudge-only ${c.nudge_only}, dark ${c.dark}, never contacted ${c.never_contacted}, unknown ${c.unknown}. Eligible for a proactive touch now: ${o.eligible_now}.`,
    `Spacing rule: ${o.spacing.rule}.`,
    `Data used: initiated_90d for ${o.data_used.initiated_90d}, last_inbound for ${o.data_used.last_inbound}, proactive touches for ${o.data_used.proactive_touches}, last_active for ${o.data_used.last_active}, explicit opt-in for ${o.data_used.opted_in}.`,
    "Recommended touch per segment:",
    ...Object.entries(o.recommended_touch).filter(([k]) => (c as Record<string, number>)[k] > 0).map(([k, v]) => `- ${k.replace("_", "-")}: ${v}`),
    "Members (segment, eligible now, next eligible, reason):",
  ];
  const shown = o.members.slice(0, 200);
  for (const m of shown) lines.push(`- ${m.id}: ${m.segment}, ${m.eligible_now ? "eligible now" : `not now${m.next_eligible ? ` (from ${m.next_eligible})` : ""}`}, ${m.reason}`);
  lines.push(more(o.members.length, shown.length).trim());
  if (o.warnings.length) lines.push(...o.warnings.map((w) => `Note: ${w}`));
  return lines.filter(Boolean).join("\n");
}

export function summarisePlan(o: PlanOutput): string {
  const lines = [`Plan for the week from ${o.today} (${plural(o.items.length, "item")}, ${plural(o.stats.people_touched, "person", "people")} touched at most once):`];
  o.items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.title} (due ${it.due})`);
    lines.push(`   Why now: ${it.why_now}`);
    if (it.people.length) lines.push(`   People: ${it.people.join(", ")}`);
    lines.push(`   Say: "${it.suggested_prompt}"`);
  });
  if (o.spacing_conflicts.length) {
    lines.push("Spacing check (one proactive touch per person in the week):");
    for (const c of o.spacing_conflicts) lines.push(`- ${c.person}: kept ${c.kept}; ${c.moved} ${c.resolution}`);
  } else lines.push("Spacing check: no conflicts.");
  const heldItems = o.held.filter((h) => h.type === "item");
  if (heldItems.length) lines.push(`Held back: ${heldItems.map((h) => `${h.item} (${h.reason})`).join("; ")}.`);
  const opted = o.held.filter((h) => h.type === "touch" && h.reason.startsWith("opted out"));
  if (opted.length) lines.push(`Not contacted (opted out): ${[...new Set(opted.map((h) => h.person))].join(", ")}.`);
  const unclear = o.held.filter((h) => h.type === "touch" && h.reason.startsWith(UNCLEAR_OPT_OUT));
  if (unclear.length) lines.push(`Held, ${UNCLEAR_OPT_OUT}: ${[...new Set(unclear.map((h) => h.person))].join(", ")}.`);
  if (o.needs_review.length) {
    const shown = o.needs_review.slice(0, 20);
    lines.push(`Ledger rows to confirm (the note records an opt-out or removal request but not who it refers to; both people are held): ${shown.map((r) => `${r.intro_id ?? `row ${r.row + 1}`} (${r.requester} → ${r.target})`).join("; ")}${more(o.needs_review.length, shown.length)}`);
  }
  return lines.join("\n");
}

export function summariseImpact(o: ImpactOutput): string {
  const t = o.totals;
  const lines = [
    `Intro metrics for ${o.period.start} to ${o.period.end} (${o.rows_in_period} ledger rows; ${o.rows_outside_period} outside the period).`,
    `Requests ${t.requests}; asked ${t.asked}; accepted ${t.accepted}; declined ${t.declined}; lapsed ${t.lapsed}; withdrawn ${t.withdrawn}; awaiting answer ${t.pending}; proposed, not asked ${t.proposed}; connected ${t.connected}.`,
    `Conversation rate (connected / requests): ${p(t.conversation_rate)}. Acceptance (accepted / asked): ${p(t.acceptance_rate)}. Lapse (lapsed / asked): ${p(t.lapse_rate)}. Decline: ${p(t.decline_rate)}.`,
    `Outcome mix: super valuable ${o.outcomes.mix["super valuable"]}, ok ${o.outcomes.mix.ok}, didn't connect ${o.outcomes.mix["didn't connect"]}, unknown ${o.outcomes.mix.unknown}, blank ${o.outcomes.mix.blank}.`,
    `Outcome known for ${o.outcomes.known} of ${o.rows_in_period} intros (${o.outcomes.coverage.pct}%); ${o.outcomes.coverage_of_accepted.pct}% of the ${t.accepted} accepted.`,
    o.rating.n ? `Average rating ${o.rating.average} out of 5 (n=${o.rating.n}).` : "No ratings in the period.",
    `By source: ${Object.entries(o.by_source).map(([k, v]) => `${k} ${v.requests} requests, ${v.connected} connected (${v.conversation_rate.pct}%)`).join("; ")}.`,
    `By month: ${Object.entries(o.by_month).map(([k, v]) => `${k} ${v.requests} requests, ${v.connected} connected`).join("; ")}.`,
  ];
  if (o.events) lines.push(`Events: ${o.events.events} events, ${o.events.registered} registered, ${o.events.attended} attended (${(o.events.attendance_rate as Rate).pct}%), ${o.events.pairs_made} pairs made, ${o.events.pairs_met} met (${(o.events.pairs_met_rate as Rate).pct}%).`);
  if (o.activation) lines.push(`Activation: ${o.activation.active_within_30d} of ${o.activation.joined} new members active within 30 days (${(o.activation.rate as Rate).pct}%); ${o.activation.window_still_open} still inside their first 30 days.`);
  lines.push("Numbers only: comparisons with other communities, if used, must be labelled as one network's figures.");
  if (o.warnings.length) lines.push(...o.warnings.map((w) => `Note: ${w}`));
  return lines.join("\n");
}

export function summariseDraft(o: DraftOutput): string {
  const head = `${o.channel} draft (${o.purpose}), ${o.stats.characters} characters${o.stats.sms_segments ? `, ${o.stats.sms_segments} SMS segment(s) ${o.stats.sms_encoding}` : ""}: ${o.ok ? "OK" : `${plural(o.issues.filter((i) => i.severity !== "info").length, "issue")} to fix`}.`;
  return [head, ...o.issues.map((i) => `- ${i.severity}: ${i.rule}: ${i.detail}`)].join("\n");
}
