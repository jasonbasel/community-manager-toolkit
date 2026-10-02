import { describe, expect, it } from "vitest";
import {
  displayOrg, emailParts, findPhones, findSensitive, firstNameRelation, isEmailLike, isPhoneLike, jaroWinkler, nameKey, orgKey, parseDate,
  parseInstant, scrubContacts, tidyName, toList,
} from "../src/text/normalise.js";
import { keywords, singular } from "../src/text/keywords.js";

describe("organisations", () => {
  it("strips legal suffixes, punctuation and case for matching", () => {
    expect(orgKey("Tidewater Robotics Ltd")).toBe(orgKey("Tidewater Robotics"));
    expect(orgKey("Brightharbour Legal LLP")).toBe("brightharbour legal");
    for (const s of ["Acme Limited", "Acme, Inc.", "ACME LLC", "Acme plc", "Acme GmbH", "The Acme Co"]) expect(orgKey(s), s).toBe("acme");
    expect(orgKey("Halden & Moss")).toBe(orgKey("Halden and Moss"));
    expect(orgKey("Ltd")).toBe("ltd");
    expect(orgKey("")).toBe("");
  });
  it("display form drops only formal suffixes", () => {
    expect(displayOrg("Tidewater Robotics Ltd")).toBe("Tidewater Robotics");
    expect(displayOrg("Castlegate Accounting Ltd")).toBe("Castlegate Accounting");
    expect(displayOrg("Acme Pty Ltd.")).toBe("Acme");
    expect(displayOrg("Out & Proud Travel Co")).toBe("Out & Proud Travel Co");
  });
});

describe("names and emails", () => {
  it("name keys ignore case, accents, hyphens and honorifics", () => {
    expect(nameKey("Marisol Quentin-Vale")).toBe(nameKey("marisol quentin vale"));
    expect(nameKey("Dr. Zoë Ãrden")).toBe("zoe arden");
    expect(tidyName("SAM PATEL")).toBe("Sam Patel");
    expect(tidyName("caspian mbeki-ross")).toBe("Caspian Mbeki-Ross");
    expect(tidyName("Leopold McVanterpool")).toBe("Leopold McVanterpool");
  });
  it("normalises Gmail dots and +tags, flags personal and role mailboxes", () => {
    expect(emailParts("Sam.Patel+events@GoogleMail.com")?.key).toBe("sampatel@gmail.com");
    expect(emailParts("sam.patel+x@ledgerline.com")?.key).toBe("sam.patel@ledgerline.com");
    expect(emailParts("a@icloud.com")?.personal).toBe(true);
    expect(emailParts("info@acme.co.uk")?.role).toBe(true);
    expect(emailParts("not an email")).toBeNull();
    expect(isEmailLike("x@y.com")).toBe(true);
  });
});

describe("contact scrubbing", () => {
  it("removes emails and phone numbers but keeps dates, money and ids", () => {
    const t = "Ring 07700 900311 or +44 7700 900311 or (020) 7946 0123 or 415-555-0100, email desmond.faraday@example.com. Raised £2.5m; cheques of 25-50k; on 2026-09-27 and 26/09/2026 at 17:29; HubSpot 51203400243; 12 to 140 staff.";
    const r = scrubContacts(t);
    expect(r.removed).toBe(5);
    expect(r.text).not.toMatch(/07700|7946|555-0100|@/);
    for (const keep of ["£2.5m", "25-50k", "2026-09-27", "26/09/2026", "17:29", "51203400243", "12 to 140"]) expect(r.text).toContain(keep);
  });
  it("finds phones by shape and length", () => {
    expect(findPhones("Discord 113693792436467651 and 2024-06-10 17:29")).toEqual([]);
    expect(isPhoneLike("07700 900104")).toBe(true);
    expect(isPhoneLike("Sam Patel")).toBe(false);
  });
});

describe("dates", () => {
  it("reads ISO, day-first, month names and timestamps", () => {
    expect(parseDate("2026-09-26T20:51:51Z")).toBe("2026-09-26");
    expect(parseDate("2024-06-10 17:29")).toBe("2024-06-10");
    expect(parseDate("26/09/2026")).toBe("2026-09-26");
    expect(parseDate("09/26/2026")).toBe("2026-09-26");
    expect(parseDate("03/04/2026")).toBe("2026-04-03");
    expect(parseDate("03/04/2026", "MDY")).toBe("2026-03-04");
    expect(parseDate("22 Sep 2026")).toBe("2026-09-22");
    expect(parseDate("September 22, 2026")).toBe("2026-09-22");
    expect(parseDate("1790000000")).toBe("2026-09-21");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("soon")).toBeNull();
    expect(parseInstant("2026-10-01T18:00:00Z")! - parseInstant("2026-10-01")!).toBe(18 * 3600_000);
  });
});

describe("similarity", () => {
  it("Jaro-Winkler and first-name relations", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("sam patel", "samantha patel")).toBeLessThan(0.9);
    expect(firstNameRelation("sam", "samantha")).toBe("variant");
    expect(firstNameRelation("tobi", "tobias")).toBe("variant");
    expect(firstNameRelation("chris", "christabel")).toBe("prefix");
    expect(firstNameRelation("s", "sam")).toBe("initial");
    expect(firstNameRelation("sam", "priya")).toBeNull();
  });
});

describe("sensitive terms and keywords", () => {
  it("flags orgs and text that signal a sensitive attribute, not sector words", () => {
    expect(findSensitive("Out & Proud Travel Co").map((s) => s.category)).toContain("sexuality");
    expect(findSensitive("Mendwell Health")).toEqual([]);
    expect(findSensitive("Blackstone Group")).toEqual([]);
    expect(findSensitive("Chemo starts on Monday")[0].category).toBe("health");
  });
  it("extracts concept tokens with synonyms and without stopwords or sensitive words", () => {
    expect(keywords("Help hiring embedded engineers")).toEqual(["hiring", "embedded", "engineer"]);
    expect(keywords("Seed investors who back agritech")).toEqual(["funding", "agritech"]);
    expect(keywords("R&D tax credit eligibility checks")).toEqual(["rnd", "accounting"]);
    expect(keywords("LGBTQ+ founders network")).toEqual(["founder"]);
    expect(keywords(["Recruiters", "recruitment"])).toEqual(["hiring"]);
    expect(singular("companies")).toBe("company");
    expect(singular("analytics")).toBe("analytics");
  });
  it("splits list values on semicolons and newlines only", () => {
    expect(toList("a; b, c\nd")).toEqual(["a", "b, c", "d"]);
    expect(toList(["x", " y "])).toEqual(["x", "y"]);
    expect(toList(null)).toEqual([]);
  });
});
