#!/usr/bin/env python3
"""Assert the synthetic eval fixtures still match DESIGN.md section 9.

Run: python3 evals/fixtures/verify_fixtures.py
Exits non-zero (and lists every failure) if a count or trap is missing.
"""
import csv
import datetime as dt
import re
import sys
from collections import Counter
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

print("\n%d passed, %d failed" % (len(passes), len(failures)))
sys.exit(1 if failures else 0)
