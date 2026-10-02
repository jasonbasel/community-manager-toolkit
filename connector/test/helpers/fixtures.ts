/** Read the synthetic eval fixtures (../evals/fixtures) and shape them into tool inputs. Read-only. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES = process.env.CMT_FIXTURES ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "evals", "fixtures");
export const hasFixture = (name: string) => existsSync(join(FIXTURES, name));

/** RFC 4180 CSV → array of rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0]);
}

export function readCsv(name: string): Record<string, string>[] {
  const [head, ...rows] = parseCsv(readFileSync(join(FIXTURES, name), "utf8"));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
export const readHeaders = (name: string): string[] => parseCsv(readFileSync(join(FIXTURES, name), "utf8"))[0];
export const readRows = (name: string): string[][] => parseCsv(readFileSync(join(FIXTURES, name), "utf8")).slice(1);

const split = (s: string) => s.split(";").map((x) => x.trim()).filter(Boolean);
const thin = (hope: string, offer: string) => {
  const h = hope.trim().toLowerCase(), o = offer.trim().toLowerCase();
  return (h.length < 12 || ["networking", "n/a", "meet people"].includes(h)) && (o.length < 4 || o === "n/a");
};

/** The 35 guests of the 8 Oct event, enriched from members.csv the way the skill would. */
export function eventGuests() {
  const members = new Map(readCsv("members.csv").map((m) => [m.name, m]));
  return readCsv("event_guests.csv").filter((g) => g.approval_status === "approved").map((g) => {
    const m = members.get(g.name);
    // Thin registration answers are filled from members.csv for members (as the skill does); non-members stay thin.
    const regThin = thin(g.hope_to_get, g.can_offer);
    const asks = regThin ? (m ? split(m.asks) : []) : split(g.hope_to_get);
    const offers = regThin ? (m ? split(m.offers) : []) : split(g.can_offer);
    return {
      id: g.name, name: g.name, organisation: g.company || m?.org || "", role: g.job_title, asks, offers, member: !!m,
      thin: regThin && !m,
    };
  });
}

/** Records for the md-01 merge case, mapped as detect_member_fields maps them. */
export function md01Records() {
  const recs: Record<string, unknown>[] = [];
  for (const r of readCsv("hubspot_contacts.csv")) recs.push({
    source: "hubspot", source_id: r["Record ID"], first_name: r["First Name"], last_name: r["Last Name"], email: r.Email,
    organisation: r["Company Name"], role: r["Job Title"], location: r.City, joined: r["Create Date"], last_active: r["Last Activity Date"],
    opted_in: r["Marketing contact status"],
  });
  for (const r of readCsv("slack_members.csv")) recs.push({
    source: "slack", source_id: r.userid, name: r.fullname, email: r.email, role: r.title, location: r.timezone, status: r.status,
    last_active: r.last_message_at,
  });
  for (const r of readCsv("discord_members.csv")) recs.push({
    source: "discord", source_id: r.user_id, name: r.display_name, joined: r.joined_at, tags: r.roles, last_active: r.last_message_at,
  });
  for (const r of readCsv("applications.csv")) recs.push({
    source: "application-form", name: r["Full name"], email: r.Email, organisation: r.Company, role: r.Role,
    asks: r["What are you hoping to get from the community?"], offers: r["What could you offer other members?"],
    last_active: r["Submitted at"], inferred_fields: ["asks", "offers"],
  });
  return recs;
}

export function ledgerRows() {
  return readCsv("ledger.csv");
}
