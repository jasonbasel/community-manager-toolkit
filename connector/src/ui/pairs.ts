/* Pairs approval table for pair_attendees. Edits stay in this view; Approve posts one message. */
import { connect, copyText, esc, resultText, sendToChat, type ToolResultParams } from "./shared.js";
import { approvalMessage, csvCell } from "./text.js";

type Basis = { ask_offer: { asker: string; offerer: string; keywords: string[] }[]; shared_tags: string[]; complementary: string | null };
type Group = { group: number; ids: string[]; score: number; strength: "strong" | "medium" | "weak"; basis: Basis; reason_hint: string };
type GuestInfo = { name: string; organisation: string; org_key: string; member: boolean; thin: boolean };
type Payload = {
  event?: { name?: string; starts_at?: string }; options?: { max_per_person?: number };
  groups: Group[]; backups: Record<string, string | null>; backup_notes?: Record<string, string>;
  unmatched: { id: string; reason: string }[]; excluded?: { avoid?: string[][] }; guests: Record<string, GuestInfo>;
};
type Row = { g: Group; ids: string[]; removed: boolean; edited: boolean };

const root = document.getElementById("root")!;
let data: Payload | null = null;
let rows: Row[] = [];
let unplaced: { id: string; reason: string }[] = [];
let swapOpen: { row: number; id: string } | null = null;
let swapError = "";
let sent = false;

const name = (id: string) => data?.guests[id]?.name ?? id;
const orgKey = (id: string) => data?.guests[id]?.org_key ?? "";
const avoid = () => new Set((data?.excluded?.avoid ?? []).map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
const cap = () => data?.options?.max_per_person ?? 3;

/** Introductions a person is named in: their kept groups plus each distinct backup link. */
function load(id: string): number {
  const groups = rows.filter((r) => !r.removed && r.ids.includes(id)).length;
  const links = new Set<string>();
  for (const [a, b] of Object.entries(data?.backups ?? {})) if (b && (a === id || b === id)) links.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  return groups + links.size;
}

function candidates(r: Row): string[] {
  const c = new Set<string>(unplaced.map((u) => u.id));
  for (const m of r.ids) { const b = data?.backups[m]; if (b) c.add(b); }
  for (const m of r.ids) c.delete(m);
  return [...c];
}

function check(r: Row, outId: string, inId: string): string {
  const others = r.ids.filter((x) => x !== outId);
  const av = avoid();
  for (const o of others) {
    if (orgKey(o) && orgKey(o) === orgKey(inId)) return `${name(inId)} and ${name(o)} are both at ${data!.guests[o].organisation}: never pair colleagues.`;
    if (av.has(inId < o ? `${inId}|${o}` : `${o}|${inId}`)) return `${name(inId)} and ${name(o)} are on the avoid list.`;
  }
  const after = load(inId) + 1;
  if (after > cap()) return `${name(inId)} would be in ${after} introductions; the limit is ${cap()}.`;
  return "";
}

function counts() {
  const kept = rows.filter((r) => !r.removed);
  const placed = new Set(kept.flatMap((r) => r.ids));
  const notPlaced = Object.keys(data?.guests ?? {}).filter((id) => !placed.has(id));
  return { groups: kept.length, people: placed.size, notPlaced, removed: rows.length - kept.length };
}

function basisHtml(r: Row): string {
  if (r.edited) return `<span class="muted">Edited by you: reason to be written from their profiles.</span>`;
  const b = r.g.basis;
  const parts = b.ask_offer.map((e) => `${esc(name(e.asker).split(" ")[0])} wants <span class="kw">${esc(e.keywords.join(", "))}</span> ← ${esc(name(e.offerer).split(" ")[0])}`);
  if (b.shared_tags.length) parts.push(`shared: <span class="kw">${esc(b.shared_tags.join(", "))}</span>`);
  if (b.complementary) parts.push(esc(b.complementary));
  return parts.length ? parts.join("<br>") : `<span class="muted">${esc(r.g.reason_hint)}</span>`;
}

function render(): void {
  if (!data) return;
  const c = counts();
  const ev = data.event?.name ? ` for ${esc(data.event.name)}` : "";
  const when = data.event?.starts_at ? ` <span class="muted small">${esc(data.event.starts_at.slice(0, 10))}</span>` : "";
  root.innerHTML = `
    <h1>Pairs${ev}${when}</h1>
    <div class="counts"><span><b>${c.groups}</b> groups</span><span><b>${c.people}</b> placed</span><span><b>${c.notPlaced.length}</b> not placed</span><span><b>${c.removed}</b> removed</span><span>limit <b>${cap()}</b> intros each</span></div>
    <table><thead><tr><th>#</th><th>Group</th><th>Strength</th><th class="hide-sm">Basis</th><th>Backup</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${r.removed ? "removed" : ""}">
      <td class="num">${r.g.group}</td>
      <td>${r.ids.map((id) => `<span class="who">${esc(name(id))}${data!.guests[id]?.thin ? ' <span class="muted small">(thin profile)</span>' : ""}
          ${data!.guests[id]?.organisation ? `<span class="org">${esc(data!.guests[id].organisation)}</span>` : ""}
          ${r.removed || sent ? "" : `<button class="link" data-swap="${i}" data-id="${esc(id)}">swap</button>`}</span>`).join("")}
        ${swapOpen && swapOpen.row === i ? swapHtml(r) : ""}</td>
      <td>${r.edited ? '<span class="chip">edited</span>' : `<span class="chip ${r.g.strength}">${r.g.strength}</span> <span class="num small">${r.g.score}</span>`}</td>
      <td class="basis hide-sm">${basisHtml(r)}</td>
      <td class="small">${r.ids.map((id) => { const b = data!.backups[id]; return `${esc(name(id).split(" ")[0])} → ${b ? esc(name(b)) : `<span class="muted">${esc(data!.backup_notes?.[id] ?? "host at door")}</span>`}`; }).join("<br>")}</td>
      <td class="actions">${sent ? "" : `<button data-toggle="${i}">${r.removed ? "Keep" : "Remove"}</button>`}</td></tr>`).join("")}
    </tbody></table>
    ${c.notPlaced.length ? `<p class="note">Not placed (host places at the door): ${c.notPlaced.map((id) => esc(name(id))).join(", ")}.</p>` : ""}
    <div class="row" style="margin-top:10px"><button class="primary" id="approve" ${sent || !c.groups ? "disabled" : ""}>Approve ${c.groups} group${c.groups === 1 ? "" : "s"}</button>
      <button id="csv">Copy as CSV</button><span class="spacer"></span><span class="muted small">Registration is not attendance: keep the backups.</span></div>
    <div id="status"></div>`;
  bind();
}

function swapHtml(r: Row): string {
  const opts = candidates(r);
  if (!opts.length) return `<div class="swap muted small">No unmatched guests or backups to swap in. <button class="link" data-cancel>close</button></div>`;
  return `<div class="swap"><select id="swapSel">${opts.map((id) => `<option value="${esc(id)}">${esc(name(id))}${unplaced.some((u) => u.id === id) ? " (unmatched)" : " (backup)"}</option>`).join("")}</select>
    <button data-apply>Swap in for ${esc(name(swapOpen!.id).split(" ")[0])}</button><button class="link" data-cancel>cancel</button>
    ${swapError ? `<span class="err">${esc(swapError)}</span>` : ""}</div>`;
}

function bind(): void {
  root.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((b) => (b.onclick = () => { const r = rows[Number(b.dataset.toggle)]; r.removed = !r.removed; render(); }));
  root.querySelectorAll<HTMLButtonElement>("[data-swap]").forEach((b) => (b.onclick = () => { swapOpen = { row: Number(b.dataset.swap), id: b.dataset.id! }; swapError = ""; render(); }));
  root.querySelectorAll<HTMLButtonElement>("[data-cancel]").forEach((b) => (b.onclick = () => { swapOpen = null; swapError = ""; render(); }));
  root.querySelector<HTMLButtonElement>("[data-apply]")?.addEventListener("click", () => {
    if (!swapOpen) return;
    const r = rows[swapOpen.row];
    const inId = (document.getElementById("swapSel") as HTMLSelectElement).value;
    const err = check(r, swapOpen.id, inId);
    if (err) { swapError = err; render(); return; }
    const outId = swapOpen.id;
    r.ids = [...r.ids.filter((x) => x !== outId), inId];
    r.edited = true;
    unplaced = unplaced.filter((u) => u.id !== inId);
    if (!rows.some((x) => !x.removed && x.ids.includes(outId))) unplaced.push({ id: outId, reason: "swapped out" });
    swapOpen = null; swapError = "";
    render();
  });
  const status = document.getElementById("status")!;
  (document.getElementById("approve") as HTMLButtonElement | null)?.addEventListener("click", async () => {
    const ok = await sendToChat(app, approvalText(), status);
    if (ok) { sent = true; render(); document.getElementById("status")!.innerHTML = `<span class="ok">Approved list sent to the conversation.</span>`; }
  });
  (document.getElementById("csv") as HTMLButtonElement | null)?.addEventListener("click", async () => {
    const how = await copyText(csv(), status);
    if (how === "copied") status.innerHTML = `<span class="ok">CSV copied.</span>`;
  });
}

function approvalText(): string {
  const kept = rows.filter((r) => !r.removed);
  const c = counts();
  return approvalMessage({
    event: data?.event, kept: kept.map((r) => ({ ids: r.ids, edited: r.edited })), removed: rows.filter((r) => r.removed).map((r) => ({ ids: r.ids })),
    people: c.people, notPlaced: c.notPlaced, name,
    backups: kept.flatMap((r) => r.ids).flatMap((id) => { const b = data!.backups[id]; return b ? [[id, b] as const] : []; }),
  });
}

function csv(): string {
  const out = [["group", "strength", "score", "member", "organisation", "backup", "basis", "status"].join(",")];
  for (const r of rows) for (const id of r.ids) {
    const basis = r.edited ? "edited" : r.g.basis.ask_offer.map((e) => `${name(e.asker)} wants ${e.keywords.join(" / ")}`).join("; ");
    out.push([r.g.group, r.edited ? "edited" : r.g.strength, r.g.score, name(id), data!.guests[id]?.organisation ?? "", data!.backups[id] ? name(data!.backups[id]!) : "", basis, r.removed ? "removed" : "kept"].map(csvCell).join(","));
  }
  return out.join("\n");
}

const app = connect("Community Manager Toolkit pairs", (res: ToolResultParams) => {
  const p = res.structuredContent as Payload | undefined;
  if (!p?.groups) { root.innerHTML = `<p class="err">${esc(res.isError ? resultText(res) : "No pairs in this result; the text summary has the details.")}</p>`; return; }
  data = p;
  rows = p.groups.map((g) => ({ g, ids: [...g.ids], removed: false, edited: false }));
  unplaced = [...p.unmatched];
  sent = false;
  render();
});
