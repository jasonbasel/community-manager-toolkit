/** detect_member_fields: one header set per platform in DESIGN §4.1, plus forms, contact and sensitive columns. */
import { describe, expect, it } from "vitest";
import { detectMemberFields } from "../src/tools/detect.js";
import { hasFixture, readHeaders, readRows } from "./helpers/fixtures.js";

const d = (source_name: string, headers: string[], sample_rows?: string[][]) => detectMemberFields({ source_name, headers, sample_rows });
const fieldOf = (o: ReturnType<typeof d>, col: string) => o.mapping.find((m) => m.column === col)?.field;

const PLATFORM_CASES: [string, string, string[], Record<string, string>][] = [
  ["hubspot", "contacts-export.csv", ["Record ID", "First Name", "Last Name", "Email", "Phone Number", "Company Name", "Job Title", "City", "Country/Region", "Create Date", "Last Activity Date", "Marketing contact status", "Lifecycle Stage"],
    { "Record ID": "source_id", "Company Name": "organisation", "Job Title": "role", "Create Date": "joined", "Last Activity Date": "last_active", "Marketing contact status": "opted_in" }],
  ["salesforce", "report.csv", ["First Name", "Last Name", "Title", "Account Name", "Email", "Mailing City", "Last Activity", "Created Date", "Email Opt Out", "Contact ID"],
    { "Account Name": "organisation", "Mailing City": "location", "Email Opt Out": "opted_in", "Contact ID": "source_id" }],
  ["attio", "people.csv", ["Record ID", "Name", "Email addresses", "Phone numbers", "Company", "Job title", "Primary location", "Connection strength", "Last interaction", "Created at"],
    { "Email addresses": "email", "Primary location": "location", "Last interaction": "last_active", "Record ID": "source_id" }],
  ["pipedrive", "people.csv", ["Person - ID", "Person - Name", "Person - Email - Work", "Person - Phone - Work", "Person - Organization", "Person - Label", "Person - Add time", "Person - Last activity date", "Person - Marketing status", "Person - Owner"],
    { "Person - Name": "name", "Person - Organization": "organisation", "Person - Label": "tags", "Person - Marketing status": "opted_in" }],
  ["affinity", "export.csv", ["Name", "Primary Email", "Organizations", "Job Titles", "Location", "Source of Introduction", "First Email", "Last Email", "Last Meeting", "Next Meeting"],
    { "Organizations": "organisation", "Job Titles": "role", "Last Email": "last_active" }],
  ["zoho", "contacts.csv", ["Record Id", "Contact Owner", "First Name", "Last Name", "Email", "Account Name", "Title", "Mailing City", "Created Time", "Modified Time", "Last Activity Time", "Email Opt Out"],
    { "Created Time": "joined", "Last Activity Time": "last_active", "Email Opt Out": "opted_in" }],
  ["slack", "members.csv", ["username", "email", "status", "billing-active", "has-2fa", "has-sso", "userid", "fullname", "displayname", "expiration-timestamp"],
    { userid: "source_id", fullname: "name", status: "status" }],
  ["slack", "member-analytics.csv", ["Name", "What I Do", "Account type", "Account created (UTC)", "Days active", "Messages posted", "Last active (UTC)", "User ID"],
    { "What I Do": "role", "Last active (UTC)": "last_active", "User ID": "source_id" }],
  ["discord", "server-members.csv", ["User ID", "Username", "Global Name", "Nickname", "Joined At", "Roles", "Bot", "Account Created"],
    { "User ID": "source_id", "Joined At": "joined", Roles: "tags" }],
  ["notion", "Members 2026.csv", ["Name", "Company", "Role", "Tags", "Created time", "Last edited time", "Created by"], { Company: "organisation", Tags: "tags" }],
  ["typeform", "responses.csv", ["#", "What's your name?", "Where do you work?", "What are you looking for from the community?", "What could you offer other members?", "Start Date (UTC)", "Submit Date (UTC)", "Network ID"],
    { "What are you looking for from the community?": "asks", "What could you offer other members?": "offers", "Submit Date (UTC)": "last_active" }],
  ["tally", "tally.csv", ["Submission ID", "Respondent ID", "Submitted at", "Full name", "Email", "What do you need help with?", "What can you help other members with?"],
    { "What do you need help with?": "asks", "What can you help other members with?": "offers" }],
  ["google_forms", "Form Responses 1.csv", ["Timestamp", "Email Address", "Your name", "Company", "What are you hoping to get from joining?", "What could you offer?"],
    { Timestamp: "last_active", "What are you hoping to get from joining?": "asks", "What could you offer?": "offers" }],
  ["jotform", "submissions.csv", ["Submission Date", "Name", "Email", "Company", "Looking for", "Can offer", "Submission ID", "Submission IP", "Last Update Date"],
    { "Looking for": "asks", "Can offer": "offers" }],
  ["mailchimp", "subscribed_members_export.csv", ["Email Address", "First Name", "Last Name", "MEMBER_RATING", "OPTIN_TIME", "OPTIN_IP", "CONFIRM_TIME", "CONFIRM_IP", "LATITUDE", "LONGITUDE", "GMTOFF", "DSTOFF", "TIMEZONE", "CC", "REGION", "LAST_CHANGED", "LEID", "EUID", "NOTES", "TAGS"],
    { "Email Address": "email", NOTES: "notes", TAGS: "tags" }],
  ["kit", "subscribers.csv", ["first_name", "email_address", "state", "created_at", "tags"], { state: "opted_in", email_address: "email" }],
  ["beehiiv", "beehiiv-subscribers.csv", ["email", "status", "created_at", "subscription_tier", "utm_source", "utm_medium", "utm_channel", "utm_campaign", "referring_site", "referral_code"],
    { status: "opted_in", email: "email" }],
  ["mailerlite", "mailerlite.csv", ["Subscriber", "Name", "Last name", "Status", "Date subscribed", "Subscribed from IP", "Sent", "Opens", "Clicks"],
    { Subscriber: "email", Name: "first_name", Status: "opted_in" }],
  ["luma", "guests.csv", ["api_id", "name", "first_name", "last_name", "email", "phone_number", "created_at", "approval_status", "checked_in_at", "custom_source", "ticket_name", "What are you hoping to get?"],
    { api_id: "source_id", checked_in_at: "last_active", "What are you hoping to get?": "asks" }],
  ["eventbrite", "attendee-report.csv", ["Order #", "Order Date", "First Name", "Last Name", "Email", "Quantity", "Ticket Type", "Attendee #", "Attendee Status", "Company", "Job Title", "Eventbrite Fees", "Total Paid"],
    { "Attendee Status": "status", Company: "organisation", "Job Title": "role" }],
  ["linkedin", "Connections.csv", ["First Name", "Last Name", "URL", "Email Address", "Company", "Position", "Connected On"], { Position: "role", Company: "organisation" }],
];

describe("platform signatures", () => {
  for (const [platform, file, headers, expected] of PLATFORM_CASES) {
    it(`recognises ${platform} (${file})`, () => {
      const o = d(file, headers);
      expect(o.platform_guess.id).toBe(platform);
      expect(o.platform_guess.confidence).toBeGreaterThanOrEqual(0.5);
      for (const [col, field] of Object.entries(expected)) expect(fieldOf(o, col), `${platform}: ${col}`).toBe(field);
    });
  }
  it("falls back to a generic table or form", () => {
    expect(d("members.csv", ["name", "org", "role", "city", "asks", "offers", "last_active", "joined"]).platform_guess.id).toBe("sheet");
    expect(d("applications.csv", ["Full name", "Email", "What are you hoping to get from the community?", "What could you offer other members?"]).platform_guess.id).toBe("form");
  });
  it("uses the source name as a hint", () => {
    const o = d("hubspot export", ["First Name", "Last Name", "Email", "Record ID", "Create Date"]);
    expect(o.platform_guess.id).toBe("hubspot");
    expect(o.platform_guess.evidence[0]).toMatch(/source name/);
  });
});

describe("columns to leave out", () => {
  it("lists contact columns separately and never maps them", () => {
    const o = d("x.csv", ["Name", "Email", "Mobile", "Phone Number", "Home Address", "Postcode", "LinkedIn URL", "IP Address"]);
    expect(o.contact_columns.map((c) => c.column)).toEqual(["Mobile", "Phone Number", "Home Address", "Postcode", "LinkedIn URL", "IP Address"]);
    expect(fieldOf(o, "Email")).toBe("email");
  });
  it("lists sensitive columns and never maps them", () => {
    const o = d("x.csv", ["Name", "Gender", "Ethnicity", "Dietary requirements", "Accessibility needs", "Date of birth", "Religion"]);
    expect(o.sensitive_columns).toHaveLength(6);
    expect(o.mapping.map((m) => m.field)).toEqual(["name"]);
  });
  it("treats email opens as not activity", () => {
    const o = d("x.csv", ["Email", "Last open date", "Opens"]);
    expect(o.unmapped.map((u) => u.column)).toEqual(["Last open date", "Opens"]);
    expect(o.warnings.join(" ")).toMatch(/not activity/);
  });
});

describe("value hints from sample rows", () => {
  it("marks Email Opt Out as inverted: 1 = no, 0 = unknown", () => {
    const o = d("salesforce.csv", ["First Name", "Account Name", "Mailing City", "Email Opt Out"], [["A", "B", "C", "0"], ["D", "E", "F", "1"]]);
    const m = o.mapping.find((x) => x.column === "Email Opt Out")!;
    expect(m.inverted).toBe(true);
    expect(m.values).toMatchObject({ "0": "unknown", "1": "no" });
  });
  it("detects day-first and ambiguous dates", () => {
    expect(d("x.csv", ["Name", "Joined"], [["A", "26/09/2026"]]).mapping[1].date_format).toBe("DD/MM/YYYY");
    const amb = d("x.csv", ["Name", "Joined"], [["A", "03/04/2026"]]);
    expect(amb.mapping[1].date_format).toBe("ambiguous: read day-first");
    expect(amb.warnings.join(" ")).toMatch(/ambiguous/);
  });
  it("spots 'Role at Organisation' titles when there is no organisation column", () => {
    const o = d("slack.csv", ["fullname", "title", "userid", "displayname"], [["A", "CEO at Hollowbrook Cyber", "U1", "a"], ["B", "Founder | Fernhill", "U2", "b"]]);
    expect(o.mapping.find((m) => m.column === "title")?.splits).toBe("role_at_organisation");
  });
  it("finds an email column from its values (an unknown header is named by position)", () => {
    const o = d("x.csv", ["Name", "Contact"], [["A", "a@example.com"], ["B", "b@example.com"]]);
    expect(o.mapping.find((m) => m.index === 2)).toMatchObject({ column: "column 2", field: "email" });
    expect(JSON.stringify(o)).not.toContain("Contact");
  });
  it("never echoes contact details from sample rows", () => {
    const o = d("x.csv", ["Name", "Email", "Phone", "Consent"], [["A", "a@example.com", "07700 900100", "a@example.com"]]);
    expect(JSON.stringify(o)).not.toMatch(/@example\.com|07700/);
  });
});

describe("keeps one column per single-value field", () => {
  it("demotes a second email column", () => {
    const o = d("x.csv", ["Email", "Secondary Email"]);
    expect(fieldOf(o, "Email")).toBe("email");
    expect(o.unmapped.find((u) => u.column === "Secondary Email")?.reason).toMatch(/also looks like email/);
  });
  it("reports an empty header specifically", () => {
    expect(() => d("x.csv", ["Name", " "])).toThrow(/headers\[1\] is empty/);
  });
});

describe("fixture exports", () => {
  it.runIf(hasFixture("hubspot_contacts.csv"))("HubSpot fixture", () => {
    const o = d("hubspot_contacts.csv", readHeaders("hubspot_contacts.csv"), readRows("hubspot_contacts.csv").slice(0, 5));
    expect(o.platform_guess.id).toBe("hubspot");
    expect(o.contact_columns.map((c) => c.column)).toEqual(["Phone Number"]);
    expect(o.mapping.find((m) => m.column === "Marketing contact status")?.values).toMatchObject({ "Marketing contact": "yes" });
  });
  it.runIf(hasFixture("slack_members.csv"))("Slack fixture", () => {
    const o = d("slack_members.csv", readHeaders("slack_members.csv"), readRows("slack_members.csv").slice(0, 5));
    expect(o.platform_guess.id).toBe("slack");
    expect(fieldOf(o, "fullname")).toBe("name");
    expect(fieldOf(o, "last_message_at")).toBe("last_active");
    expect(o.unmapped.map((u) => u.column)).toEqual(expect.arrayContaining(["username", "displayname"]));
  });
  it.runIf(hasFixture("discord_members.csv"))("Discord fixture", () => {
    const o = d("discord_members.csv", readHeaders("discord_members.csv"));
    expect(o.platform_guess.id).toBe("discord");
    expect(fieldOf(o, "display_name")).toBe("name");
    expect(fieldOf(o, "roles")).toBe("tags");
  });
});

describe("values and header rows that must never be echoed (review finding 12)", () => {
  it("filters contact details out of status values as well as opt-in values", () => {
    const o = d("x.csv", ["Name", "Status", "Consent"], [["A", "07700 900123", "+44 7700 900124"], ["B", "Active", "wa.me/447700900125"], ["C", "b@example.com", "yes"]]);
    const s = JSON.stringify(o);
    expect(s).not.toMatch(/7700|example\.com|wa\.me/);
    expect(o.mapping.find((m) => m.field === "status")?.values).toEqual({ Active: "member" });
    expect(o.mapping.find((m) => m.field === "opted_in")?.values).toEqual({ yes: "yes" });
  });
  it("treats a header row holding contact details as data: masks it, warns, and still reads its columns", () => {
    const o = d("export.csv", ["Jane Doe", "jane.doe@example.com", "+44 7700 900123", "Acme"], [["Bo Chan", "bo@example.org", "+44 7700 900456", "Globex"], ["Cleo Dunn", "cleo@example.net", "07700 900789", "Initech"]]);
    const s = JSON.stringify(o);
    for (const leak of ["Jane", "jane.doe", "example", "7700", "Acme", "Bo Chan", "Globex"]) expect(s, leak).not.toContain(leak);
    expect(o.mapping.find((m) => m.field === "email")?.column).toBe("column 2");
    expect(o.contact_columns.map((c) => c.column)).toEqual(["column 3"]);
    expect([...o.mapping.map((m) => m.column), ...o.unmapped.map((u) => u.column)].sort()).toEqual(["column 1", "column 2", "column 4"]);
    expect(o.platform_guess.evidence).toEqual(["the first row looks like data, not column names"]);
    expect(o.warnings.join(" ")).toMatch(/no header row/);
  });
  it("treats a mostly numeric or date header row as data too, but leaves real headers alone", () => {
    expect(d("x.csv", ["Ann Lee", "2026-09-30", "42", "Acme"]).warnings.join(" ")).toMatch(/no header row/);
    expect(d("x.csv", ["Name", "Joined", "Score", "Company"]).warnings.join(" ")).not.toMatch(/no header row/);
  });
  it("hides a source name that is itself a contact detail", () => {
    expect(d("jane.doe@example.com", ["Name"]).source_name).not.toMatch(/example/);
  });
});

describe("values, sensitive headers and name rows (round-2 5)", () => {
  it("returns only consent and status words, counting the rest", () => {
    const o = d("x.csv", ["Name", "Status", "Consent"], [["A", "Active", "Subscribed"], ["B", "On sabbatical in Lisbon", "Told me on the phone in March"], ["C", "Pregnant", "yes"]]);
    const s = JSON.stringify(o);
    for (const leak of ["Lisbon", "Pregnant", "March", "phone"]) expect(s, leak).not.toContain(leak);
    expect(o.mapping.find((m) => m.field === "status")).toMatchObject({ values: { Active: "member" }, unlisted_values: 2 });
    expect(o.mapping.find((m) => m.field === "opted_in")).toMatchObject({ values: { Subscribed: "yes", yes: "yes" }, unlisted_values: 1 });
    expect(o.warnings.join(" ")).toMatch(/'Status' has 2 sample value\(s\) that are not consent or status words/);
  });
  it("treats any header naming health, relationships, religion, ethnicity, sexuality, disability or pregnancy as sensitive", () => {
    const headers = ["Name", "Health status", "Relationship status", "Religious community", "Ethnic background", "Sexual orientation", "Disability support", "Pregnancy", "Medical notes", "Marital"];
    const o = d("x.csv", headers, [["A", "Diabetic", "Divorced", "Parish", "Irish", "Gay", "Wheelchair", "Pregnant", "Asthma", "Married"]]);
    expect(o.sensitive_columns.map((c) => c.column)).toEqual(headers.slice(1));
    expect(o.sensitive_columns.map((c) => c.index)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(JSON.stringify(o)).not.toMatch(/Diabetic|Divorced|Parish|Irish|Gay|Wheelchair|Pregnant|Asthma|Married/);
  });
  it("flags sensitive headers by whole words and phrases, not by stems inside sector or CRM words (round-3 7)", () => {
    const sensitive = ["Health status", "Health condition", "Mental health", "Medical notes", "Diagnosis", "Diagnosed with", "Disability", "Disabilities", "Pregnancy", "Pregnant?", "Religion",
      "Religious affiliation", "Ethnicity", "Ethnic origin", "Race", "Racial background", "Sexual orientation", "Gender identity", "Gender", "Marital status", "Married", "Relationship status",
      "Maternity leave", "Hearing impairment", "Political party", "Date of birth", "Dietary requirements", "Race day volunteer?" /* "race" as a word is flagged: accepted false positive */];
    const flagged = d("x.csv", ["Name", ...sensitive]);
    expect(flagged.sensitive_columns.map((c) => c.column)).toEqual(sensitive);
    const fine = ["Industry (e.g. Healthcare)", "Healthtech focus", "Diagnostics", "Relationship owner", "Relationship strength", "Medtech sector", "Agency", "Stage", "Sector", "Racing team"];
    const o = d("x.csv", ["Name", ...fine]);
    expect(o.sensitive_columns).toEqual([]);
    expect(fieldOf(o, "Industry (e.g. Healthcare)")).toBe("tags");
    expect(o.unmapped.find((u) => u.column === "Relationship owner")?.reason).toMatch(/internal owner/);
  });
  it("masks a first row of names and organisations that has nothing reading as a column name", () => {
    const o = d("export.csv", ["Jane Doe", "Acme Ltd", "CEO", "London"], [["Bo Chan", "Globex Inc", "CTO", "Leeds"]]);
    expect(JSON.stringify(o)).not.toMatch(/Jane|Doe|Acme|London|Bo Chan|Globex|Leeds/);
    expect(o.warnings.join(" ")).toMatch(/no header row/);
    for (const headers of [["Project Lead", "Budget Owner", "Kick Off"], ["Cohort", "Mentor", "Pod"], ["Full Name", "Acme Ltd"]]) expect(d("x.csv", headers).warnings.join(" "), headers.join()).not.toMatch(/no header row/);
  });
});

describe("only known header vocabulary is ever echoed (round-3 6)", () => {
  it("names every column outside the vocabulary by position, with its index, even when the row passes as a header row", () => {
    // Two known headers keep this row from being judged headerless; the three cells that are really data are still never echoed.
    const o = d("export.csv", ["Full Name", "Acme Ltd", "Jane Doe", "Favourite tool", "Email"], [["Bo Chan", "Globex", "Cleo Dunn", "Linear", "bo@example.org"]]);
    const s = JSON.stringify(o);
    for (const leak of ["Acme", "Jane", "Doe", "Favourite", "example", "Bo Chan", "Globex", "Cleo", "Linear"]) expect(s, leak).not.toContain(leak);
    expect(o.warnings.join(" ")).not.toMatch(/no header row/);
    const all = [...o.mapping, ...o.unmapped, ...o.contact_columns, ...o.sensitive_columns].sort((a, b) => a.index - b.index);
    expect(all.map((c) => [c.index, c.column])).toEqual([[1, "Full Name"], [2, "column 2"], [3, "column 3"], [4, "column 4"], [5, "Email"]]);
    // With a contact detail in the row, the whole row is data and every column is positional.
    const data = d("export.csv", ["Full Name", "Acme Ltd", "jane@example.com"], [["Bo Chan", "Globex", "bo@example.org"]]);
    expect([...data.mapping, ...data.unmapped].map((c) => c.column).sort()).toEqual(["column 1", "column 2", "column 3"]);
    expect(JSON.stringify(data)).not.toMatch(/Full Name|Acme|example/);
  });
  it("names unknown columns by position when the rest of the row is real headers", () => {
    const o = d("members.csv", ["Full Name", "Company", "Chapter", "Favourite tool", "Zebedee Quarrington"], [["A", "Acme", "London", "Notion", "x"]]);
    expect(JSON.stringify(o)).not.toMatch(/Chapter|Favourite|Zebedee|Quarrington/);
    expect(o.mapping.map((m) => [m.index, m.column, m.field])).toEqual([[1, "Full Name", "name"], [2, "Company", "organisation"]]);
    expect(o.unmapped.map((u) => [u.index, u.column, u.reason])).toEqual([[3, "column 3", "no matching field"], [4, "column 4", "no matching field"], [5, "column 5", "no matching field"]]);
    expect(o.warnings.join(" ")).not.toMatch(/no header row/);
  });
  it("echoes headers that are in the vocabulary: aliases, platform columns, contact, sensitive and question phrases", () => {
    const headers = ["Record ID", "Company Name", "Job Title", "Phone Number", "Gender", "Marketing contact status", "What are you hoping to get from the community?", "Opens", "Lead Source", "Name", "Name"];
    const o = d("hubspot.csv", headers);
    const all = [...o.mapping, ...o.unmapped, ...o.contact_columns, ...o.sensitive_columns].sort((a, b) => a.index - b.index);
    expect(all.map((c) => c.column)).toEqual([...headers.slice(0, 10), "Name (2)"]);
    expect(all.map((c) => c.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
  it("platform evidence never repeats a header that only matched a pattern", () => {
    const o = d("pipedrive.csv", ["Person - ID", "Person - Name", "Person - Organization", "Person - Marketing status", "Person - Zebedee's hobby", "Person - Email - Work"]);
    expect(o.platform_guess.id).toBe("pipedrive");
    expect(JSON.stringify(o)).not.toMatch(/Zebedee|hobby/);
    expect(o.unmapped.find((u) => u.index === 5)?.column).toBe("column 5");
  });
  it("a date, number or yes/no header cell is never echoed even if it reads like a word", () => {
    const o = d("x.csv", ["Name", "Yes", "2026-09-30", "42"]);
    expect(JSON.stringify(o)).not.toMatch(/Yes|2026|42/);
  });
});
