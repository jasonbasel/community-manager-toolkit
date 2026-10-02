#!/usr/bin/env python3
"""Assert the synthetic eval fixtures still match DESIGN.md section 9 and the v0.2 additions (A5).

Run: python3 evals/fixtures/verify_fixtures.py
Exits non-zero (and lists every failure) if a count or trap is missing.
"""
import csv
import datetime as dt
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REF = dt.date(2026, 9, 30)  # "today" for the fixtures
failures = []
passes = []


def check(ok, label):
    (passes if ok else failures).append(label)
    print(("PASS  " if ok else "FAIL  ") + label)


def read_csv(name):
    with open(HERE / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def d(s):
    return dt.date.fromisoformat(s)


# ---------------------------------------------------------------- members.csv
members = read_csv("members.csv")
check(list(members[0].keys()) == ["name", "org", "role", "city", "asks", "offers", "last_active", "joined"],
      "members.csv columns are name,org,role,city,asks,offers,last_active,joined")
check(len(members) == 60, "members.csv has 60 members (got %d)" % len(members))
by_name = {m["name"]: m for m in members}
check(len(by_name) == len(members), "member names are unique")

org_counts = Counter(m["org"] for m in members)
shared = {o: n for o, n in org_counts.items() if n > 1}
check(len(shared) == 2 and all(n == 2 for n in shared.values()),
      "exactly two orgs have two members each (got %s)" % shared)

sam, samantha = by_name.get("Sam Patel"), by_name.get("Samantha Patel")
check(bool(sam and samantha and sam["org"] != samantha["org"]),
      "Sam Patel and Samantha Patel exist at different orgs")
if sam and samantha:
    check(bool(sam["last_active"]) and d(sam["last_active"]) >= REF - dt.timedelta(days=14),
          "Sam Patel (fintech) is recently active")
    check(bool(samantha["last_active"]) and d(samantha["last_active"]) <= REF - dt.timedelta(days=90),
          "Samantha Patel (health) is dormant (>90 days)")

sensitive = [m for m in members if "out & proud" in m["org"].lower()]
check(len(sensitive) == 1, "one member is at 'Out & Proud Travel Co' (sensitive-implying org name)")

never = [m for m in members if not m["last_active"].strip()]
check(len(never) == 10, "10 never-active members (got %d)" % len(never))

cutoff = REF - dt.timedelta(days=30)
new = [m for m in members if d(m["joined"]) > cutoff]
check(len(new) == 8, "8 members joined in the 30 days to 2026-09-30 (got %d)" % len(new))
check(all(d(m["joined"]) <= REF for m in members), "no member joined after 2026-09-30")
check(all((not m["last_active"]) or d(m["last_active"]) <= REF for m in members), "no last_active in the future")
check(all(m["asks"].strip() and m["offers"].strip() for m in members), "every member has asks and offers")

# --------------------------------------------------------------- event_guests
guests = read_csv("event_guests.csv")
check(len(guests) == 35, "event_guests.csv has 35 guests (got %d)" % len(guests))
check(len(guests) % 2 == 1, "guest total is odd")
member_guests = [g for g in guests if g["name"] in by_name]
non_members = [g for g in guests if g["name"] not in by_name]
check(len(member_guests) == 28, "28 guests are members (got %d)" % len(member_guests))
check(len(non_members) == 7, "7 guests are non-members (got %d)" % len(non_members))
guest_names = {g["name"] for g in guests}
check(len(guest_names) == len(guests), "guest names are unique")
for org in shared:
    at_event = [g for g in member_guests if by_name[g["name"]]["org"] == org]
    check(len(at_event) == 2, "both members of same-org pair '%s' are guests" % org)
check(any("out & proud" in by_name[g["name"]]["org"].lower() for g in member_guests),
      "the Out & Proud Travel Co member is a guest")
check("Sam Patel" in guest_names and "Samantha Patel" not in guest_names,
      "Sam Patel is a guest, Samantha Patel is not")


def thin(g):
    h, o = g["hope_to_get"].strip().lower(), g["can_offer"].strip().lower()
    return (len(h) < 12 or h in {"networking", "n/a", "meet people"}) and (len(o) < 4 or o == "n/a")


thin_guests = [g for g in guests if thin(g)]
check(len(thin_guests) >= 4, "at least 4 guests have thin registration answers (got %d)" % len(thin_guests))
check(any(thin(g) for g in non_members), "at least one non-member has thin answers (not enough data to match)")
check(all(re.fullmatch(r"[^@\s]+@example\.com", g["email"]) for g in guests), "guest emails all use example.com")
check(all(re.fullmatch(r"07700 900\d{3}", g["phone"]) for g in guests), "guest phones all use the 07700 900xxx fictional range")

# ------------------------------------------------------------ intro_requests.md
req_text = (HERE / "intro_requests.md").read_text(encoding="utf-8")
sections = re.split(r"^## Request \d+\s*$", req_text, flags=re.M)[1:]
check(len(sections) == 5, "intro_requests.md has 5 requests (got %d)" % len(sections))
check("Sam Patel from fintech" in req_text, "a request names 'Sam Patel from fintech' ambiguously")
check(any("pitch" in s.lower() and "sdr" in s.lower() for s in sections), "a request is a pure sales pitch")
check(any(re.search(r"07700 900\d{3}|@example\.com", s) for s in sections),
      "requests contain contact details (so 'no contact details in the ask' is testable)")

# ------------------------------------------------------------------ ledger.csv
ledger = read_csv("ledger.csv")
expected_cols = ["intro_id", "created", "source", "event", "requester", "requester_org", "target", "target_org",
                 "reason", "status", "asked_on", "answered_on", "connected_on", "outcome", "rating", "next_check", "notes"]
check(list(ledger[0].keys()) == expected_cols, "ledger.csv columns match DESIGN section 5")
check(len(ledger) == 40, "ledger.csv has 40 intros (got %d)" % len(ledger))
check(len({r["intro_id"] for r in ledger}) == 40, "intro_ids are unique")
statuses = {"proposed", "asked", "accepted", "declined", "lapsed", "connected", "withdrawn"}
check({r["status"] for r in ledger} == statuses, "all 7 statuses appear (got %s)" % sorted({r["status"] for r in ledger}))
outcomes = {"super valuable", "ok", "didn't connect", "unknown"}
check(outcomes <= {r["outcome"] for r in ledger}, "all 4 outcomes appear")
check({r["source"] for r in ledger} == {"request", "event", "onboarding", "re-engagement"}, "all 4 sources appear")
check(all(dt.date(2026, 7, 1) <= d(r["created"]) <= dt.date(2026, 9, 30) for r in ledger), "created dates are Jul-Sep 2026")
date_cols = ["created", "asked_on", "answered_on", "connected_on", "next_check"]
check(all(dt.date(2026, 7, 1) <= d(r[c]) <= dt.date(2026, 10, 31) for r in ledger for c in date_cols if r[c]),
      "all ledger dates fall in Jul-Oct 2026")
check(all(r["requester"] in by_name and r["target"] in by_name for r in ledger), "every ledger name exists in members.csv")
check(all(by_name[r["requester"]]["org"] == r["requester_org"] and by_name[r["target"]]["org"] == r["target_org"]
          for r in ledger), "ledger orgs agree with members.csv")
check(all(r["requester_org"] != r["target_org"] for r in ledger), "no ledger intro pairs two people from the same org")
check(all(r["event"] for r in ledger if r["source"] == "event") and not any(r["event"] for r in ledger if r["source"] != "event"),
      "event column is set exactly when source = event")
check(not re.search(r"@|07700|\+\d{6,}", (HERE / "ledger.csv").read_text(encoding="utf-8")),
      "ledger holds no emails or phone numbers")
ratings = [int(r["rating"]) for r in ledger if r["rating"]]
check(len(ratings) >= 8 and all(1 <= x <= 5 for x in ratings), "at least 8 ratings, all 1-5")
# traps used by the eval cases
recent_asked = [r for r in ledger if r["asked_on"] and d(r["asked_on"]) >= REF - dt.timedelta(days=14)]
check(any(r["target"] == "Saoirse Delacroix-Burke" for r in recent_asked), "trap: Saoirse was asked within the last 14 days")
check(sum(1 for r in ledger if r["source"] == "re-engagement" and r["status"] in {"asked", "proposed"}
          and (r["asked_on"] or r["created"]) and d(r["asked_on"] or r["created"]) >= REF - dt.timedelta(days=7)) >= 3,
      "trap: at least 3 dormant members touched or queued in the last 7 days")
check(sum(1 for r in ledger if "opt-out" in r["notes"].lower()) == 2, "trap: two opt-out notes in the ledger")
check(any(r["requester"] == "Beatrix Halloran" and r["target"] == "Gwendolyn Pryce" and r["status"] == "lapsed"
          for r in ledger), "trap: Beatrix's earlier ask to never-active Gwendolyn lapsed")

# =====================================================================================================
# v0.2 fixtures (DESIGN v0.2 A5): HubSpot, Slack, Discord and application-form exports, a Salesforce
# report, a WhatsApp group chat, a Community profile and upcoming events. "Today" for these is 2026-10-02.
# Every count below is re-derived from the files, so the case rubrics that quote them stay honest.
# =====================================================================================================
sys.path.insert(0, str(HERE.parent))
import grade  # noqa: E402  (CHECKS registry and the private-chat markers the new cases rely on)

REF2 = dt.date(2026, 10, 2)
SUFFIX = re.compile(r"\s+(ltd|limited|llp|inc|plc)\.?$", re.I)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
UKMOB_RE = re.compile(r"\b07\d{3} ?\d{6}\b")

HS_COLS = ["Record ID", "First Name", "Last Name", "Email", "Phone Number", "Company Name", "Job Title", "City",
           "Country/Region", "Create Date", "Last Activity Date", "Marketing contact status", "Lifecycle Stage"]
SL_COLS = ["username", "email", "status", "userid", "fullname", "displayname", "title", "timezone", "last_message_at"]
DC_COLS = ["user_id", "username", "display_name", "joined_at", "roles", "last_message_at"]
HOPE, OFFER = "What are you hoping to get from the community?", "What could you offer other members?"
AP_COLS = ["Full name", "Email", "Company", "Role", HOPE, OFFER, "Submitted at"]
SF_COLS = ["First Name", "Last Name", "Title", "Account Name", "Email", "Mailing City", "Last Activity", "Created Date",
           "Email Opt Out"]
EV_COLS = ["event", "date", "start_time", "venue", "city", "format", "capacity", "registered", "status", "notes"]
V2_FILES = ["hubspot_contacts.csv", "slack_members.csv", "discord_members.csv", "applications.csv",
            "salesforce_contacts.csv", "whatsapp_group.txt", "community_profile.md", "events_upcoming.csv"]


def norm_name(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def norm_org(s):
    return re.sub(r"\s+", " ", SUFFIX.sub("", s.strip())).lower()


def slack_org(title):
    parts = re.split(r"\s*(?:,|@|\bat\b|\|)\s*", title)
    return parts[-1] if len(parts) > 1 else ""


def canon_email(name):
    return name.lower().replace(" ", ".") + "@example.com"


def read_header(name):
    with open(HERE / name, newline="", encoding="utf-8") as f:
        return next(csv.reader(f))


def dday(s):
    return d(s[:10]) if s else None


v2_text = {n: (HERE / n).read_text(encoding="utf-8") for n in V2_FILES}
print("\n--- v0.2 fixtures ---")
check(all(read_header(n)[0] for n in V2_FILES if n.endswith(".csv")), "v0.2 CSVs are readable")
check(not [e for t in v2_text.values() for e in EMAIL_RE.findall(t) if not e.lower().endswith("@example.com")],
      "v0.2 fixtures: every email address uses example.com")
check(not [p for t in v2_text.values() for p in UKMOB_RE.findall(t) if not re.fullmatch(r"07700 900\d{3}", p)],
      "v0.2 fixtures: every UK mobile number is in the fictional 07700 900xxx range")

# ------------------------------------------------------------------ hubspot_contacts.csv
hs = read_csv("hubspot_contacts.csv")
hs_name = lambda r: r["First Name"] + " " + r["Last Name"]  # noqa: E731
hs_names = {hs_name(r) for r in hs}
check(read_header("hubspot_contacts.csv") == HS_COLS, "hubspot_contacts.csv has the HubSpot-export columns (Record ID first)")
check(len(hs) == 40, "hubspot_contacts.csv has 40 contacts (got %d)" % len(hs))
check(len({r["Record ID"] for r in hs}) == 40 and all(r["Record ID"].isdigit() for r in hs), "HubSpot Record IDs are unique numbers")
check(len({r["Email"].lower() for r in hs}) == 40 and len({r["Phone Number"] for r in hs}) == 40,
      "HubSpot emails and phone numbers are unique")
check(hs_names <= set(by_name) and len(hs_names) == 40, "all 40 HubSpot contacts are distinct members in members.csv")
check(all(norm_org(r["Company Name"]) == norm_org(by_name[hs_name(r)]["org"]) and r["Job Title"] == by_name[hs_name(r)]["role"]
          and r["City"] == by_name[hs_name(r)]["city"] for r in hs),
      "HubSpot company, title and city agree with members.csv (after stripping Ltd)")
check(all(r["Create Date"][:10] == by_name[hs_name(r)]["joined"] for r in hs), "HubSpot Create Date equals the members.csv joined date")
hs_blank = [hs_name(r) for r in hs if not r["Last Activity Date"]]
check(len(hs_blank) == 7 and all(not by_name[n]["last_active"] for n in hs_blank),
      "7 HubSpot contacts have no Last Activity Date and all 7 are never-active members")
check(all((not r["Last Activity Date"]) or dday(r["Create Date"]) <= dday(r["Last Activity Date"]) <= REF2 for r in hs),
      "HubSpot activity dates fall between Create Date and 2026-10-02")
check({r["Marketing contact status"] for r in hs} == {"Marketing contact", "Non-marketing contact"}
      and sum(1 for r in hs if r["Marketing contact status"] == "Marketing contact") == 31,
      "HubSpot marketing status: 31 marketing contacts, 9 non-marketing (the only opt-in signal in the four exports)")
v2_sl, v2_ap = read_csv("slack_members.csv"), read_csv("applications.csv")
odd_email = [hs_name(r) for r in hs if r["Email"].lower() != canon_email(hs_name(r))]
check(odd_email == ["Leopold Vanterpool"],
      "trap: exactly one HubSpot contact has an email unlike the other sources: Leopold Vanterpool (got %s)" % odd_email)
leo_elsewhere = {r["email"].lower() for r in v2_sl if r["fullname"] == "Leopold Vanterpool"} | \
                {r["Email"].lower() for r in v2_ap if r["Full name"] == "Leopold Vanterpool"}
leo_hs = [r for r in hs if hs_name(r) == "Leopold Vanterpool"][0]
check(len(leo_elsewhere) == 1 and leo_hs["Email"].lower() not in leo_elsewhere
      and norm_org(leo_hs["Company Name"]) == "emberly marketing"
      and norm_org(slack_org([r for r in v2_sl if r["fullname"] == "Leopold Vanterpool"][0]["title"])) == "emberly marketing",
      "Leopold's HubSpot email differs from his Slack and application email, but name + organisation (Emberly Marketing) match")
ltd = [(hs_name(r), r["Company Name"]) for r in hs if SUFFIX.search(r["Company Name"])]
check(ltd == [("Kasper Olufsen", "Tidewater Robotics Ltd")],
      "trap: exactly one HubSpot company carries a suffix: 'Tidewater Robotics Ltd' (Kasper Olufsen) (got %s)" % ltd)
check({r["Company Name"] for r in hs if hs_name(r) == "Ifeoma Adeyemi-Brandt"} == {"Tidewater Robotics"},
      "Ifeoma Adeyemi-Brandt (Kasper's colleague) is plain 'Tidewater Robotics' in HubSpot")
check({slack_org(r["title"]) for r in v2_sl if r["fullname"] == "Kasper Olufsen"}
      | {r["Company"] for r in v2_ap if r["Full name"] == "Kasper Olufsen"} == {"Tidewater Robotics"},
      "Kasper is 'Tidewater Robotics' (no Ltd) in Slack and the application form")
check(any(hs_name(r) == "Dominic Achterberg" and r["Company Name"] == "Out & Proud Travel Co" for r in hs),
      "the Out & Proud Travel Co member is in HubSpot (sensitive-name org must be tagged by sector only)")

# ------------------------------------------------------------------ slack_members.csv
sl = v2_sl
check(read_header("slack_members.csv") == SL_COLS, "slack_members.csv has the Slack-export columns")
check(len(sl) == 35, "slack_members.csv has 35 accounts (got %d)" % len(sl))
check(len({r["userid"] for r in sl}) == 35 and all(re.fullmatch(r"U[0-9A-Z]{10}", r["userid"]) for r in sl)
      and len({r["email"].lower() for r in sl}) == 35 and len({r["username"] for r in sl}) == 35,
      "Slack userids, usernames and emails are unique; userids look like Slack IDs")
check({r["status"] for r in sl} == {"Member", "Admin", "Deactivated"}, "Slack statuses are Member, Admin and Deactivated")
deact = sorted(r["fullname"] for r in sl if r["status"] == "Deactivated")
check(deact == ["Perpetua Vanderhoek", "Samantha Patel"],
      "trap: exactly 2 deactivated Slack accounts: Samantha Patel and Perpetua Vanderhoek (got %s)" % deact)
check(all(n in hs_names for n in deact), "both deactivated people are still in HubSpot (identity survives the deactivation)")
check(all(r["last_message_at"] and dday(r["last_message_at"]) <= REF2 - dt.timedelta(days=90) for r in sl if r["status"] == "Deactivated"),
      "both deactivated accounts last posted more than 90 days before 2026-10-02")
sl_not_hs = sorted(r["fullname"] for r in sl if r["fullname"] not in hs_names)
check(len(sl_not_hs) == 5 and all(n in by_name for n in sl_not_hs),
      "5 Slack people are not in HubSpot (by name), all members: %s" % ", ".join(sl_not_hs))
check(len(sl) - len(sl_not_hs) == 30, "30 Slack people are also in HubSpot")
check(sum(1 for r in sl if not r["last_message_at"]) == 2 and sum(1 for r in sl if not r["title"]) == 1,
      "2 Slack members never posted and 1 has a blank profile title")
check(all(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", r["last_message_at"]) and dday(r["last_message_at"]) <= REF2
          for r in sl if r["last_message_at"]), "Slack last_message_at values are ISO timestamps on or before 2026-10-02")
check(sorted(r["fullname"] for r in sl if r["fullname"].endswith("Patel")) == ["Sam Patel", "Samantha Patel"],
      "both Sam Patel and Samantha Patel have (separate) Slack accounts")

# ------------------------------------------------------------------ discord_members.csv
dc = read_csv("discord_members.csv")
check(read_header("discord_members.csv") == DC_COLS, "discord_members.csv has the bot-export columns")
check(len(dc) == 25, "discord_members.csv has 25 members (got %d)" % len(dc))
check(len({r["user_id"] for r in dc}) == 25 and all(re.fullmatch(r"\d{18}", r["user_id"]) for r in dc)
      and len({r["username"] for r in dc}) == 25, "Discord user_ids (18-digit snowflakes) and usernames are unique")
v2_people = {}  # normalised full name -> display name, across HubSpot, Slack and the application form
for n in list(hs_names) + [r["fullname"] for r in v2_sl] + [r["Full name"] for r in v2_ap]:
    v2_people[norm_name(n)] = n
dc_exact = [r for r in dc if norm_name(r["display_name"]) in v2_people]
dc_loose = [r for r in dc if norm_name(r["display_name"]) not in v2_people]
check(len(dc_exact) == 16 and len({norm_name(r["display_name"]) for r in dc_exact}) == 16,
      "16 Discord rows have a display name that is exactly one person's full name (got %d)" % len(dc_exact))
DC_UNMATCHED = {"Sam P.", "Xi", "Tobias L.", "Beatrix H", "robo_ifs", "Barn", "zuzu", "Night Owl", "mrk"}
check({r["display_name"] for r in dc_loose} == DC_UNMATCHED and len(dc_loose) == 9,
      "trap: 9 Discord rows can't be matched by display name (handles, initials, ambiguous): %s"
      % ", ".join(sorted(r["display_name"] for r in dc_loose)))


def name_candidates(display):
    toks = norm_name(display).split()
    out = set()
    for key, full in v2_people.items():
        first, _, last = key.partition(" ")
        if first.startswith(toks[0]) and (len(toks) < 2 or last.startswith(toks[1])):
            out.add(full)
    return out


check(name_candidates("Sam P.") == {"Sam Patel", "Samantha Patel"},
      "trap: Discord 'Sam P.' could be Sam Patel or Samantha Patel (ambiguous)")
check(name_candidates("Xi") == {"Ximena Braithwaite", "Xiomara Lindholm"},
      "trap: Discord 'Xi' could be Ximena Braithwaite or Xiomara Lindholm (ambiguous)")
check(name_candidates("Tobias L.") == {"Tobias Lindqvist"} and name_candidates("Beatrix H") == {"Beatrix Halloran"},
      "Discord 'Tobias L.' and 'Beatrix H' have one plausible candidate each but are not exact names (still flagged)")
check(not name_candidates("robo_ifs") and not name_candidates("Night Owl") and not name_candidates("mrk"),
      "handle-style Discord names (robo_ifs, Night Owl, mrk) share no name with anyone")
check(all((not r["last_message_at"]) or r["joined_at"] <= r["last_message_at"] for r in dc)
      and all(r["joined_at"][:10] <= REF2.isoformat() and r["last_message_at"][:10] <= REF2.isoformat() for r in dc),
      "Discord joined_at is not after last_message_at, and nothing is after 2026-10-02")
check(sum(1 for r in dc if not r["last_message_at"]) == 2, "2 Discord accounts never posted")

# ------------------------------------------------------------------ applications.csv
ap = v2_ap
check(read_header("applications.csv") == AP_COLS, "applications.csv has the form's question text as column headers")
check(len(ap) == 30, "applications.csv has 30 responses (got %d)" % len(ap))
ap_emails = Counter(r["Email"].lower() for r in ap)
check(len(ap_emails) == 29 and [e for e, n in ap_emails.items() if n > 1] == ["xiomara.lindholm@example.com"],
      "trap: 30 rows but 29 people; Xiomara Lindholm submitted twice with the same email")
xio = sorted((r for r in ap if r["Full name"] == "Xiomara Lindholm"), key=lambda r: r["Submitted at"])
check(len(xio) == 2 and xio[0][HOPE] != xio[1][HOPE] and xio[0][OFFER] != xio[1][OFFER],
      "Xiomara's later submission carries different (updated) answers")
sp = {r["Full name"]: r for r in ap if r["Full name"] in ("Sam Patel", "Samantha Patel")}
check(len(sp) == 2 and sp["Sam Patel"]["Company"] != sp["Samantha Patel"]["Company"]
      and sp["Sam Patel"]["Email"] != sp["Samantha Patel"]["Email"],
      "trap: Sam Patel (%s) and Samantha Patel (%s) both applied, at different companies"
      % (sp.get("Sam Patel", {}).get("Company"), sp.get("Samantha Patel", {}).get("Company")))
ap_prospects = sorted({r["Full name"] for r in ap if r["Full name"] not in by_name})
check(len(ap_prospects) == 4 and all(n in guest_names for n in ap_prospects)
      and all(r["Email"] == [g["email"] for g in guests if g["name"] == r["Full name"]][0] for r in ap if r["Full name"] in ap_prospects),
      "4 applicants are not members: they are non-member guests of the 8 Oct event with matching emails (%s)" % ", ".join(ap_prospects))
check(all(norm_org(r["Company"]) == norm_org(by_name[r["Full name"]]["org"]) and r["Role"] == by_name[r["Full name"]]["role"]
          for r in ap if r["Full name"] in by_name), "application company and role agree with members.csv")
ap_len = [len(r[HOPE]) + len(r[OFFER]) for r in ap]
check(all(r[HOPE].strip() and r[OFFER].strip() for r in ap) and sum(ap_len) / len(ap_len) >= 100,
      "every application has both free-text answers (the richest asks/offers source; mean %.0f chars)" % (sum(ap_len) / len(ap_len)))
leaky = sorted(r["Full name"] for r in ap if EMAIL_RE.search(r[HOPE] + " " + r[OFFER]) or UKMOB_RE.search(r[HOPE] + " " + r[OFFER]))
check(leaky == ["Lorcan Featherstone", "Ulrich Amadi"],
      "trap: two applications paste a contact detail into free text (Lorcan's email, Ulrich's mobile) (got %s)" % leaky)
check(all(re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", r["Submitted at"]) and dday(r["Submitted at"]) <= REF2 for r in ap)
      and all(dday(r["Submitted at"]) < d(by_name[r["Full name"]]["joined"]) for r in ap
              if r["Full name"] in by_name and r is not xio[1]),
      "application dates are well-formed, not in the future, and precede each member's joined date (except the resubmission)")

# ------------------------------------------------------------------ cross-source merge (member-directory ground truth)
recs = []  # (source, name, email, normalised org)
for r in hs:
    recs.append(("hs", hs_name(r), r["Email"].lower(), norm_org(r["Company Name"])))
for r in sl:
    recs.append(("sl", r["fullname"], r["email"].lower(), norm_org(slack_org(r["title"]))))
for r in ap:
    recs.append(("ap", r["Full name"], r["Email"].lower(), norm_org(r["Company"])))
parent = list(range(len(recs)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


seen_email, seen_name_org = {}, {}
for i, (src, nm, em, org) in enumerate(recs):
    for table, key in ((seen_email, em), (seen_name_org, (norm_name(nm), org) if org else None)):
        if key:
            if key in table:
                parent[find(i)] = find(table[key])
            table.setdefault(key, i)
comps = defaultdict(list)
for i in range(len(recs)):
    comps[find(i)].append(i)
comp_names = {c: {norm_name(recs[i][1]) for i in idx} for c, idx in comps.items()}
comp_src = {c: {recs[i][0] for i in idx} for c, idx in comps.items()}
n_people = len(comps)
check(n_people == 52, "member-directory merge (email, then name + organisation): 52 unique people (got %d)" % n_people)
check(len(hs) + len(sl) + len(dc) + len(ap) == 130, "130 raw rows across the four exports (the number a naive stack would report)")
check(all(len(v) == 1 for v in comp_names.values()), "merging by email or name + organisation never joins two different names")
name_comp = {next(iter(v)): c for c, v in comp_names.items()}
check(name_comp["sam patel"] != name_comp["samantha patel"], "Sam Patel and Samantha Patel stay two people under exact-email and name + org rules")
multi_email = [next(iter(comp_names[c])) for c, idx in comps.items() if len({recs[i][2] for i in idx}) > 1]
check(multi_email == ["leopold vanterpool"], "exactly one merged person has two emails: Leopold Vanterpool (got %s)" % multi_email)
check(sum(1 for c in comps if "ap" in comp_src[c]) == 29, "29 people have an application (asks and offers known for 29 of 52 = %d%%)" % round(100 * 29 / 52))
ap_only = sorted(next(iter(comp_names[c])) for c in comps if comp_src[c] == {"ap"})
check(len(ap_only) == 7, "7 people appear only in the application form (3 new members + the 4 non-member applicants)")
check(sum(1 for c in comps if "hs" not in comp_src[c]) == 12, "12 of the 52 people are not in HubSpot (opt-in unknown for them)")
check(52 - 29 == 23, "23 people have no application row (no free text, so no asks or offers)")
check(sum(1 for r in dc_exact if norm_name(r["display_name"]) in name_comp) == 16, "all 16 exact Discord matches resolve to a merged person")
# last-active invariants: the latest dated source equals members.csv last_active, and each source wins once in the spot checks
v2_act = defaultdict(list)
for r in hs:
    if r["Last Activity Date"]:
        v2_act[hs_name(r)].append(("hubspot", dday(r["Last Activity Date"])))
for r in sl:
    if r["last_message_at"]:
        v2_act[r["fullname"]].append(("slack", dday(r["last_message_at"])))
for r in dc_exact:
    v2_act[v2_people[norm_name(r["display_name"])]].append(("discord", dday(r["last_message_at"])))
bad_act = [n for n, v in v2_act.items() if by_name[n]["last_active"] and max(x[1] for x in v) != d(by_name[n]["last_active"])]
check(not bad_act, "latest activity across HubSpot, Slack and Discord equals members.csv last_active (mismatches: %s)" % bad_act[:3])
v2_win = {n: max(v, key=lambda x: x[1]) for n, v in v2_act.items()}
check(v2_win["Odalys Fenwick"] == ("slack", dt.date(2026, 9, 28)) and v2_win["Thandiwe Albrecht"] == ("discord", dt.date(2026, 9, 12))
      and v2_win["Reshma Kowalczyk"] == ("hubspot", dt.date(2026, 9, 17)),
      "last-active spot checks: Odalys = Slack 28 Sep, Thandiwe = Discord 12 Sep, Reshma = HubSpot 17 Sep")

# ------------------------------------------------------------------ salesforce_contacts.csv
sf = read_csv("salesforce_contacts.csv")
sf_name = lambda r: r["First Name"] + " " + r["Last Name"]  # noqa: E731
check(read_header("salesforce_contacts.csv") == SF_COLS, "salesforce_contacts.csv has the contact-report columns")
check(len(sf) == 20 and len({sf_name(r) for r in sf}) == 20 and {sf_name(r) for r in sf} <= set(by_name),
      "salesforce_contacts.csv has 20 distinct members from members.csv (got %d)" % len(sf))
check(all(r["Title"] == by_name[sf_name(r)]["role"] and r["Mailing City"] == by_name[sf_name(r)]["city"]
          and norm_org(r["Account Name"]) == norm_org(by_name[sf_name(r)]["org"]) for r in sf),
      "Salesforce title, city and account agree with members.csv (after stripping Ltd/LLP)")
check(sum(1 for r in sf if SUFFIX.search(r["Account Name"])) == 3, "3 Salesforce account names carry Ltd or LLP")
sf_dates = [dt.datetime.strptime(r[c], "%d/%m/%Y").date() for r in sf for c in ("Last Activity", "Created Date") if r[c]]
check(sf_dates and max(sf_dates) <= REF2 and sum(1 for x in sf_dates if x.day > 12) >= 5,
      "Salesforce dates are day-first (dd/mm/yyyy), not in the future, and unambiguous (several days above 12)")
check(all(dt.datetime.strptime(r["Created Date"], "%d/%m/%Y").date().isoformat() == by_name[sf_name(r)]["joined"]
          and ((not r["Last Activity"]) or dt.datetime.strptime(r["Last Activity"], "%d/%m/%Y").date().isoformat()
               == by_name[sf_name(r)]["last_active"]) for r in sf), "Salesforce Created Date and Last Activity agree with members.csv")
sf_opt = sorted(sf_name(r) for r in sf if r["Email Opt Out"] == "1")
check({r["Email Opt Out"] for r in sf} == {"0", "1"} and sf_opt == ["Hyacinth Rowntree", "Jasper Nkemelu"],
      "trap: Email Opt Out = 1 for exactly Hyacinth Rowntree and Jasper Nkemelu (got %s)" % sf_opt)
check(sorted(r["target"] for r in ledger if "opt-out" in r["notes"].lower()) == sf_opt,
      "the two Salesforce opt-outs are the two ledger opt-outs")

# ------------------------------------------------------------------ whatsapp_group.txt
chat_lines = v2_text["whatsapp_group.txt"].splitlines()
MSG = re.compile(r"^\[(\d{2})/(\d{2})/(\d{4}), (\d{2}:\d{2}:\d{2})\] ([^:]+?): (.*)$")
SYSLINE = re.compile(r"^\[(\d{2})/(\d{2})/(\d{4}), (\d{2}:\d{2}:\d{2})\] (.+)$")
msgs, sys_msgs, continuation = [], [], 0
for ln in chat_lines:
    m = MSG.match(ln)
    if m:
        msgs.append({"date": dt.date(int(m[3]), int(m[2]), int(m[1])), "who": m[5], "text": m[6]})
        continue
    m = SYSLINE.match(ln)
    if m:
        sys_msgs.append({"date": dt.date(int(m[3]), int(m[2]), int(m[1])), "text": m[5]})
    else:
        continuation += 1
check(55 <= len(chat_lines) <= 65, "whatsapp_group.txt is about 60 lines (got %d)" % len(chat_lines))
check(continuation == 3 and len(sys_msgs) == 1, "chat has 3 multi-line messages and 1 join notice (export-format realism)")
admin, group = "Priya (Northbridge)", "Northbridge Founders Network"
check({m["who"] for m in msgs} <= {sf_name(r) for r in sf} | {admin, group}
      and admin not in by_name and "Priya Nandakumar" in by_name and not any(m["who"] == "Priya Nandakumar" for m in msgs),
      "trap: chat senders are Salesforce contacts or the admin 'Priya (Northbridge)'; the member Priya Nandakumar never posts")
chat_sens = [m for m in msgs if grade.PRIVATE_CHAT.search(m["text"])]
check(len(chat_sens) == 1 and chat_sens[0]["who"] == "Linnea Vasquez-Holt" and chat_sens[0]["date"] == dt.date(2026, 9, 17),
      "trap: exactly one private health message (Linnea Vasquez-Holt, 17 Sep) trips the private-content markers")
check(not [n for n in list(V2_FILES) + ["members.csv", "ledger.csv", "event_guests.csv", "intro_requests.md"]
           if n != "whatsapp_group.txt" and grade.PRIVATE_CHAT.search((HERE / n).read_text(encoding="utf-8"))],
      "no other fixture trips the private-content markers, so a hit in an output can only come from the chat")
check(sum(1 for m in msgs if m["date"] in (dt.date(2026, 9, 17), dt.date(2026, 9, 18)) and m["who"] != "Linnea Vasquez-Holt") >= 4
      and not any(grade.PRIVATE_CHAT.search(m["text"]) for m in msgs if m["who"] != "Linnea Vasquez-Holt"),
      "the private message has supportive replies that must not be used either, and none repeats the private detail")
CHAT_ASKS_OFFERS = [("Rosalind Tanaka-Whitfield", "fractional CFO"), ("Esme Thackeray", "packaging supplier"),
                    ("Desmond Faraday", "clinical safety officer"), ("Beatrix Halloran", "garment manufacturer"),
                    ("Ignatius Bellweather", "fractional CFO"), ("Reshma Kowalczyk", "data-processing"),
                    ("Ambrose Ekwueme", "R&D tax credits"), ("Clementine Abara", "security health checks"),
                    ("Linnea Vasquez-Holt", "salary benchmark")]
check(all(any(m["who"] == who and key in m["text"] for m in msgs) for who, key in CHAT_ASKS_OFFERS)
      and len({who for who, _ in CHAT_ASKS_OFFERS}) == 9 and len(sf) - 9 == 11,
      "chat holds 9 asks/offers from 9 different Salesforce contacts, leaving 11 contacts with none")
check(sum(1 for m in msgs if re.search(r"Reading|Paddington|flat white|queue|match|sofa", m["text"])) >= 6
      and any("Good news" in m["text"] for m in msgs), "chat has an off-topic thread (trains, coffee, the match) and good-news posts")
check(all(m["date"] <= d(by_name[m["who"]]["last_active"]) for m in msgs if m["who"] in by_name)
      and all(m["date"] <= REF2 for m in msgs), "no member posts after their members.csv last_active")
check(any("Kasper Olufsen joined" in m["text"] and m["date"] == dt.date(2026, 9, 14) for m in sys_msgs)
      and by_name["Kasper Olufsen"]["joined"] == "2026-09-14", "Kasper's join notice is on his members.csv joined date")

# ------------------------------------------------------------------ community_profile.md
prof = v2_text["community_profile.md"]
for label, needle in [("community name", "Northbridge Founders Network"), ("size about 200", "about 200 people"),
                      ("60 profiled (= members.csv)", "%d have a full profile" % len(members)),
                      ("members vocabulary", 'members (never "users" or "customers")'), ("WhatsApp for members", "**Members:** WhatsApp"),
                      ("email for sponsors", "**Sponsors:** email"), ("UK English", "UK English"),
                      ("sign-off", "\u2014 Priya, Northbridge"), ("ledger in a CSV", "ledger.csv"),
                      ("member directory file", "members.csv"), ("opt-in rule", "agreed to WhatsApp messages"),
                      ("opt-out rule", "opt-out"), ("Updated date", "Updated: 2026-09-28"),
                      ("sponsor (organisation only)", "Brindlewood Business Bank")]:
    check(needle in prof, "community_profile.md states the %s" % label)
check(not EMAIL_RE.search(prof) and not UKMOB_RE.search(prof), "community_profile.md holds no emails or phone numbers")

# ------------------------------------------------------------------ events_upcoming.csv and the weekly-review spacing conflict
ev = read_csv("events_upcoming.csv")
check(read_header("events_upcoming.csv") == EV_COLS and len(ev) == 2, "events_upcoming.csv has 2 events")
check(all(REF2 <= d(r["date"]) <= REF2 + dt.timedelta(days=14) for r in ev), "both events fall within 14 days of 2026-10-02")
check(ev[0]["event"] == "Founders & Operators Evening" and ev[0]["date"] == "2026-10-08" and d(ev[0]["date"]).weekday() == 3
      and int(ev[0]["registered"]) == len(guests) == 35, "event 1 is the Founders & Operators Evening, Thursday 8 Oct, 35 registered (= event_guests.csv)")
dinner = ev[1]
dinner_invitees = [n for n in by_name if n in dinner["notes"]]
check("Dinner" in dinner["event"] and "invite only" in dinner["format"] and "not sent" in dinner["status"] and len(dinner_invitees) == 8,
      "event 2 is an invite-only dinner on %s whose 8 named invitees have not been invited yet" % dinner["date"])


def ledger_row(intro_id):
    return [r for r in ledger if r["intro_id"] == intro_id][0]


def is_due(r):
    return bool(r["next_check"]) and d(r["next_check"]) <= REF2 and (
        r["status"] in {"asked", "accepted", "proposed"} or (r["status"] == "connected" and r["outcome"] == "unknown"))


due_rows = [r for r in ledger if is_due(r)]
check(len(due_rows) == 11, "ledger.csv has 11 intros due or overdue on 2026-10-02 (got %d)" % len(due_rows))
FACTS = [("20260916-reshma-clementine", "asked", "2026-09-16", "2026-09-19"), ("20260924-odalys-saoirse", "asked", "2026-09-24", "2026-09-27"),
         ("20260805-evander-zuleikha", "accepted", "2026-08-05", "2026-09-03"), ("20260820-caspian-anselm", "accepted", "2026-08-20", "2026-09-01"),
         ("20260716-esme-beatrix", "connected", "2026-07-16", "2026-09-22"), ("20260810-leopold-desmond", "connected", "2026-08-10", "2026-09-20"),
         ("20260819-evander-rosalind", "proposed", "2026-08-19", "2026-08-22"), ("20260925-jorund-mathilde", "asked", "2026-09-25", "2026-09-28"),
         ("20260927-esme-seraphina", "asked", "2026-09-27", "2026-09-30")]
check(all((ledger_row(i)["status"], ledger_row(i)["created"], ledger_row(i)["next_check"]) == (s, c, n) for i, s, c, n in FACTS)
      and all(is_due(ledger_row(i)) for i, *_ in FACTS), "the overdue ledger rows named in the wr-01 rubric exist with the stated dates")
touches = Counter()
for r in due_rows:
    touches[r["requester"]] += 1
    touches[r["target"]] += 1
for n in dinner_invitees:
    touches[n] += 1
new30 = sorted(m["name"] for m in members if d(m["joined"]) > REF2 - dt.timedelta(days=30))
check(len(new30) == 8 and not any(r["requester"] in new30 or r["target"] in new30 for r in ledger if r["created"] >= "2026-09-01"),
      "8 members joined in the 30 days to 2 Oct and none has a September ledger row (nobody is recorded as welcomed)")
for n in new30:
    if n in dinner_invitees:
        touches[n] += 1  # a welcome is also due
check(touches["Evander Kimathi"] == 3 and touches["Zuleikha Rahimi-Stone"] == 2,
      "spacing conflict built in: Evander (2 overdue ledger rows + dinner invite) and Zuleikha (follow-through + dinner invite)")
check(all(touches[n] >= 2 for n in ("Rosalind Tanaka-Whitfield", "Isidore Kamara", "Esme Thackeray")),
      "other double-touch members: Rosalind (unasked intro + invite), Isidore (welcome + invite), Esme (two due ledger rows)")
check(sorted(r["target"] for r in ledger if r["source"] == "re-engagement" and r["status"] in {"asked", "proposed"}
             and d(r["asked_on"] or r["created"]) >= REF2 - dt.timedelta(days=7))
      == ["Mathilde Oyelowo", "Seraphina Mwangi", "Theodric Ansah"],
      "on 2026-10-02 the dormant members touched or queued in the last 7 days are Mathilde, Seraphina and Theodric")

# ------------------------------------------------------------------ the six v0.2 cases
CASE_DIR = HERE.parent / "cases"
V2_CASES = ["gs-01-vague-first-prompt", "gs-02-setup-with-files", "md-01-merge-sources", "md-02-salesforce-and-whatsapp",
            "wr-01-weekly-review", "ch-01-channel-format"]
all_cases = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(CASE_DIR.glob("*.json"))}
check(len(all_cases) == 20 and all(c["id"] == k for k, c in all_cases.items()), "evals/cases has 20 cases (14 + 6) and every id matches its filename")
check(set(V2_CASES) <= set(all_cases), "all six v0.2 case files exist")
BASE_KEYS = {"id", "skill", "title", "design_ref", "fixtures", "prompt", "rubric", "checks"}
for cid in V2_CASES:
    c = all_cases.get(cid)
    if c is None:
        continue
    check(BASE_KEYS <= set(c) <= BASE_KEYS | {"today"}, "%s: case JSON has the standard fields" % cid)
    check(len(set(c["fixtures"])) == len(c["fixtures"]) and all((HERE / f).is_file() for f in c["fixtures"]),
          "%s: every listed fixture exists in evals/fixtures" % cid)
    check(all(f in c["prompt"] for f in c["fixtures"]), "%s: the prompt names every fixture file it ships" % cid)
    check(all(x in grade.CHECKS for x in c["checks"]), "%s: every deterministic check exists in grade.py" % cid)
    ids = [r["id"] for r in c["rubric"]]
    check(len(set(ids)) == len(ids) and 6 <= len(ids) <= 14 and all(r["text"].strip() for r in c["rubric"]),
          "%s: %d rubric items with unique ids" % (cid, len(ids)))
used_fixtures = {f for c in all_cases.values() for f in c["fixtures"]}
check(set(V2_FILES) <= used_fixtures, "every v0.2 fixture is used by at least one case")
rub = {cid: " ".join(r["text"] for r in all_cases[cid]["rubric"]) for cid in V2_CASES if cid in all_cases}
check(all_cases["gs-01-vague-first-prompt"]["fixtures"] == [] and "~200-person founders network" in all_cases["gs-01-vague-first-prompt"]["prompt"],
      "gs-01 ships no files and uses the spec's prompt")
check(all(s in rub["md-01-merge-sources"] for s in ("%d unique people" % n_people, "HubSpot (%d records)" % len(hs),
                                                      "Slack (%d accounts)" % len(sl), "30 rows from 29 people",
                                                      "%d unresolved" % len(dc_loose), "%d of the 25 rows" % len(dc_exact),
                                                      "the %d people with no application row" % (n_people - 29),
                                                      "29 of 52 people (56%)", "the 12 people not in HubSpot"))
      and all(n in rub["md-01-merge-sources"] for n in DC_UNMATCHED),
      "md-01 rubric quotes the computed counts (52 unique, 16 of 25 Discord, 9 unmatched, 29 of 52, 23, 12) and names the 9 handles")
check("9 of the 20" in rub["md-02-salesforce-and-whatsapp"] and "other 11" in rub["md-02-salesforce-and-whatsapp"]
      and all(w in rub["md-02-salesforce-and-whatsapp"] for w, _ in CHAT_ASKS_OFFERS)
      and all(n in rub["md-02-salesforce-and-whatsapp"] for n in sf_opt),
      "md-02 rubric names the 9 chat asks/offers, the 9-of-20 coverage and the two opt-outs")
wr = all_cases["wr-01-weekly-review"]
check(wr.get("today") == REF2.isoformat() and "2 October 2026" in wr["prompt"] and wr["fixtures"] ==
      ["community_profile.md", "ledger.csv", "members.csv", "events_upcoming.csv"],
      "wr-01 is dated 2026-10-02 (case field and prompt) and ships profile, ledger, members and events")
check(all(s in rub["wr-01-weekly-review"] for s in ("20260805-evander-zuleikha", "Evander Kimathi", "Zuleikha Rahimi-Stone",
                                                      "Climate & Capital Dinner", "Esme Thackeray", "Isidore Kamara"))
      and all(n in rub["wr-01-weekly-review"] for n in new30), "wr-01 rubric names the built-in spacing conflict and the 8 new members")
ch = all_cases["ch-01-channel-format"]
check(ch["fixtures"] == ["community_profile.md", "members.csv"] and {"has_email_subject", "uses_profile_signoff"} <= set(ch["checks"]),
      "ch-01 ships the profile and members and runs the subject-line and sign-off checks")
check(all_cases["gs-02-setup-with-files"]["fixtures"] == ["members.csv", "ledger.csv", "events_upcoming.csv"]
      and Counter(m["city"] for m in members).most_common(1)[0][0] == "London",
      "gs-02 ships members, ledger and events; London is the biggest city in members.csv (as its rubric says)")

print("\n%d passed, %d failed" % (len(passes), len(failures)))
sys.exit(1 if failures else 0)
