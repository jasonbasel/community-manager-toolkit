/* Impact report view for compute_impact_metrics: funnel, outcome mix, coverage, Copy summary. */
import { connect, copyText, esc, resultText, type ToolResultParams } from "./shared.js";

type Rate = { pct: number; num: number; den: number };
type Tally = { requests: number; asked: number; accepted: number; declined: number; lapsed: number; connected: number; conversation_rate: Rate; acceptance_rate: Rate; lapse_rate: Rate; decline_rate: Rate };
type Payload = {
  period: { start: string; end: string }; rows_in_period: number; totals: Tally & { withdrawn: number; pending: number; proposed: number };
  outcomes: { mix: Record<string, number>; known: number; coverage: Rate; coverage_of_accepted: Rate };
  rating: { average: number | null; n: number }; by_source: Record<string, Tally>; by_month: Record<string, Tally>;
  events: null | { events: number; registered: number; attended: number; pairs_made: number; pairs_met: number; attendance_rate: Rate; pairs_met_rate: Rate };
  activation: null | { joined: number; active_within_30d: number; rate: Rate; window_still_open: number };
};

const root = document.getElementById("root")!;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const bar = (label: string, n: number, of: number, accent = false, suffix = "") =>
  `<div class="bar"><span>${esc(label)}</span><span class="track"><span class="fill${accent ? " accent" : ""}" style="width:${of ? Math.min(100, (100 * n) / of) : 0}%"></span></span><span class="val">${n}${suffix}</span></div>`;
const rateCell = (r: Rate) => `<span class="num">${r.pct}%</span> <span class="muted small num">${r.num}/${r.den}</span>`;

function table(title: string, rows: Record<string, Tally>): string {
  const keys = Object.keys(rows);
  if (!keys.length) return "";
  return `<h2>${esc(title)}</h2><table><thead><tr><th></th><th>Requests</th><th>Asked</th><th>Accepted</th><th>Connected</th><th>Conversation rate</th></tr></thead><tbody>
    ${keys.map((k) => { const t = rows[k]; return `<tr><td>${esc(k)}</td><td class="num">${t.requests}</td><td class="num">${t.asked}</td><td class="num">${t.accepted}</td><td class="num">${t.connected}</td><td>${rateCell(t.conversation_rate)}</td></tr>`; }).join("")}
    </tbody></table>`;
}

let summary = "";
function render(p: Payload): void {
  const t = p.totals, o = p.outcomes;
  root.innerHTML = `
    <h1>Community impact</h1><p class="muted small">${esc(day(p.period.start))} to ${esc(day(p.period.end))} · ${p.rows_in_period} intros in the ledger</p>
    <div class="grid2" style="margin-top:8px">
      <div class="stat"><div class="v">${t.connected}</div><div class="l">Conversations that happened</div></div>
      <div class="stat"><div class="v">${t.conversation_rate.pct}%</div><div class="l">Of requests (${t.conversation_rate.num}/${t.conversation_rate.den})</div></div>
      <div class="stat"><div class="v">${p.rating.average ?? "–"}</div><div class="l">Average rating${p.rating.n ? ` (n=${p.rating.n})` : ""}</div></div>
      <div class="stat"><div class="v">${o.coverage.pct}%</div><div class="l">Outcome known (${o.known}/${p.rows_in_period})</div></div>
    </div>
    <h2>Intro funnel</h2>
    <div class="panel">${bar("Requests", t.requests, t.requests)}${bar("Asked", t.asked, t.requests)}${bar("Accepted", t.accepted, t.requests)}${bar("Connected", t.connected, t.requests, true)}
      <p class="small muted">Acceptance ${rateCell(t.acceptance_rate)} of asked · lapsed ${rateCell(t.lapse_rate)} · declined ${rateCell(t.decline_rate)} · withdrawn <span class="num">${t.withdrawn}</span> · awaiting <span class="num">${t.pending}</span> · not yet asked <span class="num">${t.proposed}</span></p></div>
    <h2>Outcome mix</h2>
    <div class="panel">${bar("Super valuable", o.mix["super valuable"] ?? 0, p.rows_in_period, true)}${bar("It was OK", o.mix.ok ?? 0, p.rows_in_period)}${bar("Didn't connect", o.mix["didn't connect"] ?? 0, p.rows_in_period)}${bar("Unknown", o.mix.unknown ?? 0, p.rows_in_period)}${bar("Not recorded", o.mix.blank ?? 0, p.rows_in_period)}
      <p class="note">Coverage: an outcome is known for ${o.known} of ${p.rows_in_period} intros (${o.coverage.pct}%), ${o.coverage_of_accepted.pct}% of the ${t.accepted} accepted. ${p.rating.n ? `${p.rating.n} have a rating.` : "None has a rating."}</p></div>
    ${p.events ? `<h2>Events</h2><div class="panel">${bar("Registered", p.events.registered, p.events.registered)}${bar("Attended", p.events.attended, p.events.registered, true)}
      <p class="small muted">Attendance ${rateCell(p.events.attendance_rate)} · pairs met ${rateCell(p.events.pairs_met_rate)} of ${p.events.pairs_made} made · ${p.events.events} event(s)</p></div>` : ""}
    ${p.activation ? `<h2>New-member activation</h2><div class="panel">${bar("Active within 30 days", p.activation.active_within_30d, p.activation.joined, true, ` of ${p.activation.joined}`)}
      <p class="small muted">${p.activation.window_still_open} still inside their first 30 days.</p></div>` : ""}
    ${table("By source", p.by_source)}${table("By month", p.by_month)}
    <div class="row" style="margin-top:10px"><button class="primary" id="copy">Copy summary</button><span class="muted small">Numbers only. Label any comparison as one network's figures.</span></div>
    <div id="status"></div>`;
  (document.getElementById("copy") as HTMLButtonElement).onclick = async () => {
    const st = document.getElementById("status")!;
    if ((await copyText(summary, st)) === "copied") st.innerHTML = `<span class="ok">Summary copied.</span>`;
  };
}

connect("Community Manager Toolkit report", (res: ToolResultParams) => {
  const p = res.structuredContent as Payload | undefined;
  if (!p?.totals) { root.innerHTML = `<p class="err">${esc(res.isError ? resultText(res) : "No metrics in this result; the text summary has the details.")}</p>`; return; }
  summary = resultText(res);
  render(p);
});
