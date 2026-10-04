import { describe, expect, it } from "vitest";
import {
  displayOrg, emailParts, findEmails, findPhones, findSensitive, firstNameRelation, idContactKind, isEmailLike, isPhoneLabel, isPhoneLike, isPlaceholderName, jaroWinkler,
  nameKey, orgKey, parseDate, parseInstant, plain, scrubContacts, tidyName, toList,
} from "../src/text/normalise.js";
import { rng } from "./helpers/synthetic.js";
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

describe("emails in linear time (review finding 10)", () => {
  const OLD = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  it("finds exactly what the old regex found, on 20,000 random strings", () => {
    const r = rng(7);
    const alphabet = ["a", "b", "Z", "1", ".", "-", "_", "+", "%", "@", "@", " ", ",", "c", "o", "m", "é"];
    for (let n = 0; n < 20000; n++) {
      const s = Array.from({ length: 1 + Math.floor(r() * 24) }, () => alphabet[Math.floor(r() * alphabet.length)]).join("");
      const old = [...s.matchAll(OLD)].map((m) => [m.index, m.index + m[0].length]);
      expect(findEmails(s).map((e) => [e.start, e.end]), JSON.stringify(s)).toEqual(old);
    }
  });
  it("handles glued and repeated addresses like the old regex", () => {
    expect(scrubContacts("a@b.com-x@y.com").text).toBe("[email removed][email removed]");
    expect(isEmailLike("Contact: jane.doe+cmt@example.co.uk")).toBe(true);
    expect(isEmailLike("@ the office, see you")).toBe(false);
  });
  it("worst-case inputs finish in under 100 ms (500 fields of 4,000 characters)", () => {
    const fields = ["a", "a@", "a.", "@a.", "a@a.", "+1", "1 ", "1-", "0", "(0", "00", "wa.me/1 "].map((u) => u.repeat(Math.ceil(4000 / u.length)).slice(0, 4000));
    for (const f of fields) scrubContacts(f); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) { const f = fields[i % fields.length]; scrubContacts(f); isEmailLike(f); }
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

describe("phone numbers (review finding 9)", () => {
  it("finds WhatsApp links, international numbers without + and US numbers without separators", () => {
    for (const t of ["chat on wa.me/447700900123 today", "https://wa.me/447700900123?text=hi", "api.whatsapp.com/send?phone=447700900123", "wa.me/message/ABCDEF",
      "call 0044 7700 900123", "call 44 7700 900123", "call 447700900123", "call 4155550100", "call 14155550100", "call 1-415-555-0100", "call 353 87 123 4567"]) {
      expect(findPhones(t), t).not.toEqual([]);
      expect(scrubContacts(t).text, t).not.toMatch(/\d{3}|wa\.me|whatsapp/);
    }
  });
  it("leaves dates, years, short IDs, platform IDs and grouped numbers alone", () => {
    for (const t of ["on 2026-09-27", "on 20260927", "since 2026", "ref 123456", "HubSpot 51203400243", "Discord 113693792436467651", "raised 1 000 000 000",
      "tables 12 14 16 18 20 22", "at 2026-09-27T17:29:00Z", "27.09.2026 17.30", "IP 192.168.100.200", "epoch 1790000000", "epoch ms 1790000000000",
      "rooms 101 102 103 104", "ottawa.me/events", "order gst-4155550100"]) expect(findPhones(t), t).toEqual([]);
  });
  it("treats contact details as unsafe IDs, but bare platform numbers as IDs", () => {
    for (const id of ["415-555-0100", "(415) 555-0100", "+44 7700 900123", "07700900123", "44 7700 900123", "wa.me/447700900123", "jane@example.com", "https://linkedin.com/in/jane", "linkedin.com/in/jane"])
      expect(idContactKind(id), id).not.toBeNull();
    for (const id of ["4155550100", "51203400243", "113693792436467651", "U0ABC123", "2026-09-30", "gst-4155550100", "Sam Patel", "m_abcdefghij"]) expect(idContactKind(id), id).toBeNull();
    expect(idContactKind("447700900123", { labels: ["whatsapp"] })).toBe("phone");
    expect(idContactKind("447700900123", { labels: ["mobile-app"] })).toBeNull();
    expect(idContactKind("@jane", { handles: true })).toBe("handle");
    expect(idContactKind("@jane")).toBeNull();
  });
});

describe("Unicode name keys (round-3 4)", () => {
  it("keeps the letters of every script, folds case and accents, and drops apostrophes the same way everywhere", () => {
    expect(nameKey("李明")).toBe("李明");
    expect(nameKey("김민준")).toBe("김민준");
    expect(nameKey("Αλέξανδρος Παπαδόπουλος")).toBe("αλέξανδρος παπαδόπουλος"); // marks on non-Latin letters stay: they can be the letter
    expect(nameKey("Дмитрий Иванов")).toBe("дмитрий иванов");
    expect(nameKey("Nguyễn Văn An")).toBe("nguyen van an");
    expect(nameKey("محمد العلي")).toBe("محمد العلي");
    expect(nameKey("Zoë O'Brien")).toBe("zoe obrien");
    expect(nameKey("Niamh O’Brien")).toBe(nameKey("niamh obrien"));
    expect(nameKey("D'Angelo")).toBe("dangelo");
    expect(nameKey("Saoirse Delacroix-Burke")).toBe("saoirse delacroix burke");
    expect(nameKey("Minh Do")).toBe("minh do");
    expect(plain("What's your name?")).toBe("whats your name");
    expect(plain("Halden & Moss")).toBe("halden and moss");
    expect(nameKey("☺")).toBe("");
    expect(isPlaceholderName(nameKey("李明"))).toBe(false);
  });
});

describe("phone labels are read as whole words or segments (round-3 5)", () => {
  it("recognises phone channels in prefixes and source names", () => {
    for (const l of ["whatsapp", "WhatsApp", "WhatsApp export", "WA group", "wa", "wa_id", "waid", "mobile_phone", "phone_number", "Phone numbers", "tel", "Tel", "msisdn", "msisdn_list",
      "sms", "SMS list", "mobile", "mobile number", "cell no", "contact number", "telephone", "WhatsAppExport", "iMessage thread", "viber", "signal", "texts"]) expect(isPhoneLabel(l), l).toBe(true);
  });
  it("never matches generic words inside other labels, nor non-phone platforms", () => {
    for (const l of ["mobile-app", "tel-aviv-chapter", "slack-threads", "hubspot", "discord", "slack", "telegram", "linkedin", "member number", "contact", "contacts", "id", "ref",
      "seattle", "textile-group", "signals-newsletter", "", "application-form"]) expect(isPhoneLabel(l), l).toBe(false);
  });
});

describe("placeholder names (review finding 1)", () => {
  it("recognises names that identify nobody", () => {
    for (const n of ["", "unknown", "n a", "na", "test", "test user", "x", "a b", "j s", "guest 12", "no name", "john doe", "123"]) expect(isPlaceholderName(n), n).toBe(true);
    for (const n of ["sam patel", "xi", "jo bloggs", "barn", "night owl", "sam p", "julia guest"]) expect(isPlaceholderName(n), n).toBe(false);
  });
});
