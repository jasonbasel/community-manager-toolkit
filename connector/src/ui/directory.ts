/* Directory review for merge_member_records: stats, coverage, uncertain matches sent back as one message. */
import { connect, copyText, esc, resultText, sendToChat, type ToolResultParams } from "./shared.js";
import { csvCell, decisionsMessage, type Decision } from "./text.js";

type Ref = { id: string; name: string; organisation: string; sources: string[] };
type Uncertain = { a: Ref; b: Ref | null; kind: string; reason: string; score: number };
type Member = Record<string, unknown> & { member_id: string; name: string; organisation: string; role: string; location: string; last_active: string; opted_in: string; profile_quality: string };
type Payload = {
  members: Member[]; uncertain_matches: Uncertain[];
  stats: { input_records: number; unique_members: number; merged: number; unresolved_accounts: number; uncertain_total?: number; by_source: Record<string, number>; coverage: Record<string, number> };
  gaps: { member_id: string; name: string; missing: string[]; why: string }[];
};

const root = document.getElementById("root")!;
let data: Payload | null = null;
const choice = new Map<number, "same" | "different" | "">();
let sent = false;
const who = (r: Ref) => `${esc(r.name)}${r.organisation ? ` <span class="org">${esc(r.organisation)}</span>` : ""} <span class="muted small">${esc(r.sources.join(", "))}</span>`;
const COV_LABEL: Record<string, string> = { organisation: "Organisation", role: "Role", location: "Location", asks: "Asks", offers: "Offers", last_active: "Last active", opted_in: "Opt-in known" };

function render(): void {
  if (!data) return;
  const s = data.stats;
  const decided = [...choice.values()].filter(Boolean).length;
  root.innerHTML = `
    <h1>Member directory</h1><p class="muted small">${Object.entries(s.by_source).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}</p>
    <div class="grid2" style="margin-top:8px">
      <div class="stat"><div class="v">${s.input_records}</div><div class="l">Records in</div></div>
      <div class="stat"><div class="v">${s.unique_members}</div><div class="l">Members</div></div>
      <div class="stat"><div class="v">${s.merged}</div><div class="l">Duplicates merged</div></div>
      <div class="stat"><div class="v">${s.unresolved_accounts}</div><div class="l">Unresolved chat accounts</div></div>
    </div>
    <h2>Coverage</h2><div class="panel">${Object.entries(s.coverage).map(([k, v]) => `<div class="bar"><span>${esc(COV_LABEL[k] ?? k)}</span><span class="track"><span class="fill" style="width:${v}%"></span></span><span class="val">${v}%</span></div>`).join("")}</div>
    ${data.uncertain_matches.length ? `<h2>Uncertain matches (${(s.uncertain_total ?? 0) > data.uncertain_matches.length ? `strongest ${data.uncertain_matches.length} of ${s.uncertain_total}` : data.uncertain_matches.length})</h2>
      <table><thead><tr><th>Record</th><th>Possible match</th><th class="hide-sm">Why</th><th>Your call</th></tr></thead><tbody>
      ${data.uncertain_matches.map((u, i) => `<tr><td>${who(u.a)}</td><td>${u.b ? who(u.b) : '<span class="muted">no candidate</span>'}</td><td class="small hide-sm">${esc(u.reason)}</td>
        <td>${u.b ? `<span class="choice"><label><input type="radio" name="c${i}" value="same" ${choice.get(i) === "same" ? "checked" : ""} ${sent ? "disabled" : ""}> same person</label>
          <label><input type="radio" name="c${i}" value="different" ${choice.get(i) === "different" ? "checked" : ""} ${sent ? "disabled" : ""}> different people</label></span>` : '<span class="muted small">ask who this is</span>'}</td></tr>`).join("")}
      </tbody></table>
      <div class="row" style="margin-top:8px"><button class="primary" id="send" ${sent || !decided ? "disabled" : ""}>Send ${decided} choice${decided === 1 ? "" : "s"}</button><span class="muted small">Nothing is merged until you choose.</span></div>` : '<p class="note">No uncertain matches.</p>'}
    <div id="status"></div>
    ${data.gaps.length ? `<h2>Top profile gaps</h2><ul class="small">${data.gaps.slice(0, 25).map((g) => `<li>${esc(g.name)}: missing ${esc(g.missing.join(", "))} <span class="muted">(${esc(g.why)})</span></li>`).join("")}</ul>` : ""}
    <h2>Directory (${data.members.length})</h2>
    <table><thead><tr><th>Name</th><th>Organisation</th><th class="hide-sm">Role</th><th>Last active</th><th>Opt-in</th><th class="hide-sm">Profile</th></tr></thead><tbody>
    ${data.members.slice(0, 60).map((m) => `<tr><td>${esc(m.name || "(no name)")}</td><td>${esc(m.organisation)}</td><td class="hide-sm">${esc(m.role)}</td><td class="num small">${esc(m.last_active || "never")}</td><td class="small">${esc(m.opted_in)}</td><td class="small hide-sm">${esc(m.profile_quality)}</td></tr>`).join("")}
    </tbody></table>${data.members.length > 60 ? `<p class="note">${data.members.length - 60} more in the full result.</p>` : ""}
    <div class="row" style="margin-top:8px"><button id="csv">Copy directory as CSV</button><span class="muted small">No email addresses or phone numbers are included.</span></div>
    <div id="status2"></div>`;
  root.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((el) => (el.onchange = () => { choice.set(Number(el.name.slice(1)), el.value as "same" | "different"); render(); }));
  (document.getElementById("send") as HTMLButtonElement | null)?.addEventListener("click", async () => {
    if (await sendToChat(app, decisionsText(), document.getElementById("status")!)) { sent = true; render(); document.getElementById("status")!.innerHTML = `<span class="ok">Choices sent to the conversation.</span>`; }
  });
  (document.getElementById("csv") as HTMLButtonElement).onclick = async () => {
    const st = document.getElementById("status2")!;
    if ((await copyText(directoryCsv(), st)) === "copied") st.innerHTML = `<span class="ok">Directory CSV copied.</span>`;
  };
}

function decisionsText(): string {
  const choices: Decision[] = [];
  data!.uncertain_matches.forEach((u, i) => { const c = choice.get(i); if (c && u.b) choices.push({ a: u.a, b: u.b, same: c === "same" }); });
  return decisionsMessage(choices);
}

function directoryCsv(): string {
  const cols = ["member_id", "name", "organisation", "role", "location", "email_domain", "source_ids", "status", "joined", "last_active", "last_active_source", "asks", "offers", "tags", "opted_in", "opt_in_source", "profile_quality", "inferred_fields", "notes", "updated"];
  return [cols.join(","), ...data!.members.map((m) => cols.map((c) => csvCell(Array.isArray(m[c]) ? (m[c] as unknown[]).join("; ") : m[c])).join(","))].join("\n");
}

const app = connect("Community Manager Toolkit directory", (res: ToolResultParams) => {
  const p = res.structuredContent as Payload | undefined;
  if (!p?.members) { root.innerHTML = `<p class="err">${esc(res.isError ? resultText(res) : "No directory in this result; the text summary has the details.")}</p>`; return; }
  data = p; choice.clear(); sent = false;
  render();
});
