# Community Manager Toolkit: design spec (v0)

Owner: Jason Basel (private individual). Contact: jason@communitylab.ai. Licence: MIT.
Status: v0, skills-only, no hosted service. Written 30 Sep 2026.

This file is the source of truth for what the plugin does and why. The skills are built
from it. It stays in the repo root, outside the plugin folder, so it is not shipped.

---

## 1. What it is

A plugin for Claude and ChatGPT that helps a community manager (a person running a
professional network, association, alumni group, members' club, accelerator cohort or
event series) do the relationship work that actually shows value:

1. **Event matchmaking**: pair attendees before an event, with a reason for each pair.
2. **Member introductions**: consent-first (double opt-in) introductions.
3. **Community impact report**: a board- or sponsor-ready report built on outcomes, not activity.
4. **New member onboarding**: a first week built around one named introduction.
5. **Member re-engagement**: bring quiet members back with a reason to reply.

The plugin holds no data and runs no server. It works with whatever the user has
connected (Luma, HubSpot, Notion, Airtable, Google Drive/Sheets, Slack, Gmail, Circle,
Ticket Tailor, RSVPify) or with files the user uploads (CSV exports including Eventbrite's
attendee report, a WhatsApp chat export). Eventbrite has no official connector on either
platform (Sep 2026), so its export is the supported path.

**Positioning line (listing):** "The community manager's toolkit for introductions,
event matchmaking and proving your community's value, built from what worked in a
real ~850-member professional network."

## 2. Principles every skill follows

1. **Draft, never send on your own.** Every message is a draft. Sending happens only when
   the user explicitly asks, through a connector that asks for confirmation, or by the
   user copying the text. Never bulk-send.
2. **Consent first.** Nobody's contact details or profile go to another person until
   that person has said yes.
3. **Outcomes over activity.** Log every introduction and ask later whether it happened.
   Without that, the impact report has nothing to stand on.
4. **Data minimisation.** Read only the fields needed (name, organisation, role,
   location, what they want, what they offer, last active). Don't copy full records
   into outputs. Never output phone numbers or emails in shareable reports.
5. **The human stays in charge.** The toolkit proposes; the manager approves each pair
   and each message. This matters most at small events (under ~150 people), where fully
   automatic matchmaking is reported to work worst.
6. **Match the user's language and spelling** in outputs (UK vs US English, tone).

## 3. What worked (evidence, anonymised and rounded)

Source: one ~850-member professional network running a WhatsApp-based member agent,
June–September 2026. Rounded figures. Skills may cite these as "in one ~850-member
professional network" and must not name the community.

**Message shape (reply within 7 days, by message type):**
- "Your intro request lapsed; want me to try someone else?" ~65%
- "[Named person] asked to meet you, yes or no?" ~63%
- New member: "meet [named person]" in the first days ~59%
- "How did your intro with [name] go?" (3 buttons) ~56%
- Plain welcome message ~47%
- "Here are people you could meet" (suggestions) ~37%
- Follow-up on those suggestions ~29%
- Generic event reminder ~28%
- One-off broadcast to members never contacted before ~18%

**The pattern:** a named person plus a yes/no decision wins; a feature tour loses.
Being *wanted* ("someone asked for you", ~63%) beats being *offered* ("people you could
meet", ~37%). Messages that report a state change the member didn't cause ("your
request lapsed") get the most replies. Named-person asks got over 3x the replies of
broadcasts.

**Broadcasts cannibalise.** A one-off broadcast uses up attention that better,
personal touches needed. Cap proactive touches at roughly one per member per week and
space them at least ~72 hours apart.

**Intro funnel (~200 requests over ~10 weeks):**
- ~64% of requests got a yes from the person asked, ~30% lapsed with no answer, ~6% were declined.
- People who had never engaged lapsed about two-thirds of the time, against about a
  quarter for members who had engaged before. Never-engaged people caused over a third
  of all lapses.
- Of those who answered a follow-up, about half said they hadn't actually connected.
  Net: roughly **1 request in 3 became a real conversation**.
- When people did meet, they rated it about **4.7 out of 5**.

**Lessons encoded in the skills:**
- Prefer responsive introductees; give never-engaged people a short window (~3 days)
  and keep a runner-up ready.
- After both say yes, tell the requester to send the first message within a day.
- Check in ~3 days after the intro ("have you two found a time?"), then ask about the
  outcome ~10 days after, with three options (Super valuable / It was OK / We didn't
  connect). If "not yet" or "didn't connect", ask once more a week later.
- Tell the requester when a request lapses and offer someone else. It's the
  best-performing message of all.
- Don't ask the same person for an intro more than about once every two weeks.

**Engagement segments (whole base, one quarter):** ~6% start conversations regularly,
~18% occasionally, ~19% reply only when nudged, ~42% effectively dark, ~15% never
contacted. About half of new members became active in their first month; the
long-tenured, never-engaged base is the hard part.

**Events:** at one party-style event, attendees got a named person to find, ~90 minutes
before start. ~37% replied (against ~28% for a generic reminder), but only about 30%
of pre-matched pairs had both people actually turn up. **Registration is not
attendance.** Give everyone a backup match, and re-pair at the door when you can.

**Incidents that became rules:**
- *Wrong person introduced*: two members with similar names; the request went to the
  wrong one. Rule: confirm identity (full name + organisation) before any ask goes out.
- *Same-company intro*: two colleagues were introduced to each other. Rule: never pair
  people from the same organisation.
- *Sensitive attribute*: a pairing message named the other person's organisation, whose
  name implied a sexual orientation; the recipient took offence. Rule: match reasons
  come only from professional overlap and stated asks/offers; never mention or infer
  sexuality, religion, ethnicity, health, disability, politics or similar; when an
  organisation's name itself signals one of these, describe the organisation neutrally
  ("a travel company") or leave it out.
- *Removal request*: a member asked for something they'd shared to be forgotten.
  Rule: honour removal and opt-out requests immediately and note them in the ledger.

**External context (for the README, not the skills):** CMX's 2026 community report
(via Bettermode, Aug 2026): proving value is the top frustration (36%) and only 17% can
put a number on it; 34% of community teams are one person; WhatsApp is the
second-most-used community platform (~17%).

## 4. Shared references (copied into each skill that needs them)

Single source in `/shared/`; `scripts/sync-shared.sh` copies files into each
`skills/<name>/references/` so every skill is self-contained (skills must work on their
own on claude.ai and ChatGPT).

- `message-craft.md`: section 3's message evidence as writing rules, plus templates
  for: consent ask, requester update, double-opt-in connection message, lapse notice,
  follow-through check, outcome check, recheck, welcome with named intro, re-engagement
  ask. Each template is under ~500 characters (WhatsApp templates cap at 1,024), with
  variables in [square brackets], one clear yes/no or 3-option question, no feature tour.
- `guardrails.md`: the rules from sections 2 and 3 (consent, identity confirmation,
  same-org exclusion, sensitive attributes, cooldowns, spacing, data minimisation,
  removal requests, sales-intent screen, never auto-send, no cold messages to people
  who haven't opted into the community's communications).
- `ledger.md`: the intro ledger schema (section 5) and how to create it in Notion,
  Google Sheets, Airtable or as a CSV.
- `data-sources.md`: how to get member and attendee data from each connector or file,
  the minimum fields, and how to handle gaps (ask the manager; never invent profile
  facts).

## 5. The intro ledger

One table, kept wherever the user keeps things. Preference order: Notion database (if
the Notion connector is available), Google Sheet (Drive connector), Airtable, else a
CSV the user downloads and re-uploads next time.

Columns:

| Column | Type | Notes |
|---|---|---|
| intro_id | text | `YYYYMMDD-seeker-target` slug |
| created | date | |
| source | select | request / event / onboarding / re-engagement |
| event | text | event name, if source = event |
| requester | text | name |
| requester_org | text | |
| target | text | name |
| target_org | text | |
| reason | text | one line, professional overlap only |
| status | select | proposed / asked / accepted / declined / lapsed / connected / withdrawn |
| asked_on | date | |
| answered_on | date | |
| connected_on | date | |
| outcome | select | super valuable / ok / didn't connect / unknown |
| rating | number | 1–5, optional |
| next_check | date | drives follow-ups |
| notes | text | removal/opt-out requests noted here |

No phone numbers or emails in the ledger. Contact details stay in the source system.

## 6. Skills

Each skill: `skills/<name>/SKILL.md` + `references/`. Descriptions are written for
triggering and search. Lead with the job, include the words people type
("community manager", "networking", "introductions", "matchmaking", "Luma",
"member engagement", "onboarding", "churn", "ROI", "report").

### 6.1 `event-matchmaking`

**Triggers:** pair/match attendees, networking at an event, who should meet whom,
icebreakers, seating, "match hunt", Luma/Eventbrite guest list, pre-event emails,
post-event follow-up.

**Inputs:** a Luma event (via the Luma connector: guest list + registration answers), an
Eventbrite attendee report export (CSV/XLSX; carries check-in status), or any uploaded
guest list CSV, plus member profiles if available (section 4 data sources).

**Workflow:**
1. Identify the event; pull approved/going guests only (Luma guest pages hold 50;
   page through all of them).
2. Build a mini-profile per guest: org, role, what they want, what they offer, from
   registration answers + member records. Mark guests with too little data; don't
   invent.
3. Score pairs: complementary asks↔offers both ways first, then shared professional
   context. Exclude same-organisation pairs and any pair the manager says have met.
   Each guest gets 1 primary match + 1 backup; aim for nobody left out; allow a trio
   when numbers are odd. Cap at 3 introductions per person.
4. Write one reason line per pair (professional overlap only, section 3 sensitive
   rule), then show the manager a table to approve/edit/remove before anything else.
5. Produce, on request:
   - host sheet (who to introduce at the door, top 5 "connectors" in the room);
   - per-attendee message drafts ("find [name], [reason]"), to go out ~60–90 min
     before start, each with the backup named;
   - a Luma blast draft or email drafts (never sent without the manager's explicit go);
   - a morning-after follow-up draft ("did you find [name]?") and ledger rows with
     source = event.
6. Remind the manager: registration ≠ attendance; re-pair at check-in if possible.

**Evidence to cite:** section 3 "Events".

### 6.2 `member-introductions`

**Triggers:** introduce two members, warm intro, double opt-in intro, "who in my
community could help X", intro request from WhatsApp/Slack/email, matchmaking,
connection requests, follow up on intros.

**Inputs:** the request (pasted text, a Slack/Gmail message, a WhatsApp export) +
member data.

**Workflow:**
1. Understand the ask: what the requester wants, why, and how specific. If it is a pure
   sales pitch, say so and suggest the manager handle it differently (sales-intent
   screen).
2. Find 3 candidates from member data: fit to the ask, responsiveness (last active),
   not the same org, not asked in the last ~2 weeks. Show why for each. Flag similar
   names and confirm identity before continuing.
3. Manager picks one (plus a runner-up).
4. Draft the consent ask to the target: named requester, one-line context, clear yes/no,
   no contact details shared yet.
5. On yes: draft the connection message to both (or an email intro), telling the
   requester to send the first message within a day. On no or silence after ~3 days
   (shorter for never-engaged people): draft the lapse notice to the requester and move
   to the runner-up.
6. Log every step in the ledger; set next_check (+3 days follow-through, +10 days
   outcome check, +7 days recheck if needed).
7. "Follow up on my intros" mode: read the ledger, list what's due, draft the check-ins.

**Evidence to cite:** section 3 "Message shape", "Intro funnel", "Lessons".

### 6.3 `community-impact-report`

**Triggers:** community ROI, prove community value, board report, sponsor report,
community health, monthly/quarterly community metrics, member engagement report.

**Inputs:** the ledger, event data (Luma: registrations, check-ins), member list with
join dates and last active, optional quotes.

**Workflow:**
1. Ask the period and the audience (board, sponsors, members, leadership).
2. Compute: intros requested → accepted → connected, outcome mix and average rating,
   lapse rate; events: registered → attended, pairs made, pairs met; new-member
   activation (share of new members active within 30 days); engagement segments if
   data allows.
3. Compare with the reference figures (section 3), labelled as one network's figures,
   not a norm.
4. Write a one-page report: lead with outcomes (conversations that happened, rating),
   then 2–3 short stories (only with the member's permission, or anonymised), then
   activity, then what's next. State data coverage honestly (e.g. "outcome known for
   40% of intros").
5. Offer the format the audience needs: doc, slide outline, email, or a table.

**Never** include phone numbers or emails; name members only if the manager confirms
they're happy to be named.

### 6.4 `new-member-onboarding`

**Triggers:** welcome new members, onboarding sequence, first 30 days, member
activation, introduce new members.

**Workflow:**
1. Get the new member's profile (or draft 3 questions to collect: what they want from
   the community, what they can help with, what they're working on).
2. Find one named person to introduce in the first days (member-introductions logic,
   same guardrails), and one relevant upcoming event.
3. Draft: welcome message built around the named intro (not a feature tour); day-3
   check; day-14 "anything you're looking for?"; day-30 check-in. Each message stands
   alone, one question each.
4. Add ledger rows (source = onboarding).

**Evidence to cite:** named intro ~59% vs plain welcome ~47%; about half of new members
active in month one.

### 6.5 `member-re-engagement`

**Triggers:** quiet members, dormant members, lapsed members, churn risk, re-engage,
win back, reactivation campaign, inactive members.

**Workflow:**
1. Segment the base with whatever activity data exists: regular, occasional, nudge-only,
   dark, never contacted (section 3 segments). Say what data was used and what's missing.
2. For each segment, recommend the touch: dark members respond to being wanted (a
   named person asking for them) rather than to broadcasts; never-contacted members
   first need a profile ask; nudge-only members get a specific person or event.
3. Pick a small batch (the manager sets the size), check spacing (no proactive touch
   in the last ~7 days, none queued), draft personal messages.
4. Warn when the plan is really a broadcast, and explain the cost (section 3 "Broadcasts
   cannibalise").
5. Log re-engagement intros in the ledger (source = re-engagement).

## 7. Packaging (one repo, both directories)

No `commands/`: Anthropic migrated its role plugins to skills (Mar 2026), skills appear
in the `/` menu on claude.ai, and OpenAI requires commands converted to skills anyway.

```
repo/
├── DESIGN.md, README.md (GitHub/SEO), LICENSE
├── shared/                       single source for references/ files
├── scripts/  sync-shared.sh · build-openai-zip.sh · check.sh
├── evals/    fixtures/ · cases/ · run + grade scripts · results/ (gitignored)
├── docs/     GitHub Pages: index, privacy, terms, support
└── plugin/                       Claude "plugin path"; source of the OpenAI ZIP
    ├── .claude-plugin/plugin.json   name, displayName, version, description, author{name,email,url}, homepage, repository, license, keywords
    ├── .codex-plugin/plugin.json    same identity + "skills": "./skills/" + interface{displayName ≤30, shortDescription ≤30, longDescription, category "Business & Operations", defaultPrompt ×3 ≤128, logo, composerIcon}, keywords
    ├── .mcp.json                    Claude only (excluded from the OpenAI ZIP): Luma https://mcp.luma.com/ · Notion https://mcp.notion.com/mcp · HubSpot https://mcp.hubspot.com/anthropic · Slack https://mcp.slack.com/mcp · Google Drive ""
    ├── CONNECTORS.md, README.md (listing text, ≥40 words, says what data goes where), LICENSE
    ├── assets/  logo.png · icon.png (square, ≥512px)
    └── skills/<name>/SKILL.md + references/
```

Portability rules for skill files:
- Front matter: `name` and `description` only. Description ≤1,024 characters, trigger
  words first.
- Never write "Claude" or "ChatGPT" in skill text; say "you" or "the assistant".
- Name connectors in plain words ("if a Luma connection is available…"), never `~~placeholders`.
- SKILL.md body under ~1,500 words; detail goes in `references/`.
- No file over 256 KiB; no binaries except the PNG assets; no `.DS_Store`.
- `community-manager-toolkit:<skill>` must be ≤64 characters.

Naming risk: Claude holds names made only of generic words for a reviewer, and OpenAI
discourages generic names. The slug is permanent once submitted, so Jason confirms it
before submission.

## 8. Listing copy (both directories)

- Display name: **Community Manager Toolkit** (25 chars; fits OpenAI's 30)
- Slug: `community-manager-toolkit`
- Description (Claude plugin.json): "Introductions, event matchmaking and impact reports for community managers."
- OpenAI shortDescription (≤30 chars): "Intros, event matching, ROI"
- OpenAI defaultPrompt ×3 (≤128 chars each): "Match the attendees of my next Luma event",
  "Help me introduce two members, double opt-in", "Build this quarter's community impact report"
- Keywords: community manager, community management, member engagement, networking,
  introductions, warm intros, event matchmaking, Luma, onboarding, re-engagement,
  churn, community ROI, member experience, professional network, association, alumni,
  WhatsApp community.
- Category: productivity / business (whatever each directory offers closest to "operations").

## 9. Evals (definition of done)

Synthetic fixtures only (`evals/fixtures/`): never real member data.

- `members.csv`: 60 fictional members with org, role, city, asks, offers, last_active,
  joined. Includes: two pairs at the same org; two members with near-identical names
  (e.g. "Sam Patel" and "Samantha Patel") at different orgs; one member at an
  organisation whose name implies a sensitive attribute; 10 never-active members; 8
  joined in the last 30 days.
- `event_guests.csv`: 35 guests for a fictional event (28 members, 7 non-members, some
  with thin registration answers, odd total).
- `intro_requests.md`: 5 requests, including one pure sales pitch and one naming a
  member ambiguously ("Sam Patel from fintech").
- `ledger.csv`: 40 historic intros across statuses and outcomes for the report.

Checks (scripted where possible; LLM-judged against a rubric otherwise):
1. Event matchmaking: no same-org pairs; everyone with enough data gets a primary +
   backup; no reason mentions a sensitive attribute; the sensitive-named org is
   described neutrally or omitted; manager approval is requested before drafts; no
   message is "sent".
2. Introductions: sales pitch flagged; ambiguous name triggers identity confirmation;
   consent ask contains no contact details; ledger rows produced with next_check dates.
3. Impact report: numbers match the fixture ledger exactly; coverage stated; no emails
   or phones; reference figures labelled as one network's.
4. Onboarding: welcome built around a named person; same-org excluded.
5. Re-engagement: segments computed; spacing rule applied; broadcast warning appears
   when asked to "message all inactive members".
6. With-vs-without comparison: the same prompts run with and without the plugin; the
   plugin must win on the rubric for each skill.

---

# v0.2 additions (2 Oct 2026)

Goal from Jason: more intuitive, easier to use, more flexible, and able to use many more
data sources. Sources to go deepest on: **CRMs** (HubSpot, Salesforce, Attio, Pipedrive,
Affinity, Zoho), **Slack and Discord** (the only community platforms in scope), and
**sheets, forms and email tools** (Airtable, Google Sheets, Excel, Notion databases;
Typeform, Tally, Google Forms, Jotform; Mailchimp, Kit, beehiiv, MailerLite). Association
systems are out of scope. A hosted connector follows in Phase B; v0.2 stays skills-only
but must work well with or without it.

## A1. Three new skills

### `getting-started` (entry point)
Triggers: what can you do, help, get started, set up, how do I use this, I run a
community, any vague community-management ask that no other skill clearly owns.
1. Show the eight jobs as a short menu, each with one example prompt to copy.
2. Check which tools are connected and recommend the two or three that matter for their
   stack (from `references/platform-guide.md`).
3. Run a setup of at most two short batches of questions, defaults stated:
   community name, type and size; what members are called (members, fellows, alumni,
   founders, guests); where member records live; where events live; the channel(s) used
   to message members (WhatsApp, email, Slack, Discord, LinkedIn, SMS); who can be
   messaged (opt-in rule); voice and sign-off; where to keep the intro ledger and member
   directory; the community's language.
4. Write the **Community profile** (`references/community-profile.md` has the template)
   and offer to save it where the other skills can find it: a Notion page or Google Doc
   titled "Community profile", a file in the project, or the project's instructions.
5. End with one recommended first action based on what it found (e.g. an event in the
   next 14 days → event matchmaking; no member directory → member directory).

### `member-directory` (unify member data)
Triggers: member directory, member database, combine or clean member data, merge the CRM
with Slack or Discord, dedupe members, import members, profile gaps, who's in my
community.
1. Inventory sources (connected tools and uploaded files) and say what each is good for.
2. Show a field-mapping table per source (source column → canonical field) and get one
   confirmation for all of them. Map by meaning; column names vary.
3. Normalise names, organisations (strip Ltd/Inc, map email domain → org where clear),
   dates and locations.
4. De-duplicate: exact email or source-ID match first, then name + organisation; list
   uncertain matches for the manager instead of merging them.
5. Merge with precedence: CRM for identity, organisation and role; application forms,
   notes and meeting summaries for asks and offers; Slack, Discord, events and the ledger
   for activity; the most recent value wins; keep provenance per field.
6. Fill asks and offers from free text (bios, form answers, messages), labelled
   `inferred`, never invented.
7. Report coverage (share with organisation, role, asks, offers, last active, opt-in) and
   the top gaps, with a gap plan: profile-ask drafts for the members who matter most
   right now, plus two form questions to add.
8. Write the directory to the manager's Notion, Google Sheet or Airtable, or return a CSV.
   **No phone numbers or email addresses in the directory**: keep `email_domain` and
   `source_ids` (e.g. `hubspot:123`, `slack:U0ABC`) so contact details stay in the
   source system.
9. Refresh mode ("update my directory"): re-read sources, show what changed, apply on
   approval.

Canonical directory columns: member_id, name, organisation, role, location,
email_domain, source_ids, status (member / lapsed / prospect / guest), joined,
last_active, last_active_source, asks, offers, tags (sector, stage, side), opted_in
(yes / no / unknown), opt_in_source, profile_quality (full / partial / thin),
inferred_fields, notes (removal and opt-out requests), updated.

### `weekly-community-review` (what to do this week)
Triggers: what should I do this week, weekly review, community to-do list, Monday plan,
what's due, catch me up on my community.
1. Read the Community profile, the ledger, the member directory, events in the next 14
   days, new members in the last 30 days, and recent activity.
2. Build at most seven prioritised items, each with why now, what it involves, and the
   exact prompt to run it ("say: match the attendees for Thursday's dinner"):
   intro answers overdue and lapse notices; follow-through and outcome checks due;
   events in the next 14 days to match; new members not yet welcomed; a small
   re-engagement batch; removal or opt-out requests to action; an impact report if a
   month or quarter has just ended.
3. Run a spacing check across everything proposed: no member gets more than one
   proactive touch in the week, at least ~72 hours apart; say what it moved.
4. Offer to draft any item.
5. Explain how to run it on a schedule (the platform's scheduled tasks, e.g. every
   Monday 08:30) and keep the output readable without the conversation.

## A2. Changes to every skill
- **Step 0:** look for the Community profile and the member directory first and use
  them; never re-ask what they already say.
- **Fewer questions:** at most three at once, only what blocks the next step; otherwise
  use a default and say which.
- **Summary first:** lead with the answer and the approval table; offer "show all"
  for long detail.
- **Channel-aware drafts:** format for the channel in the profile (WhatsApp/SMS: short,
  plain text, no markdown; email: subject line + short body; Slack/Discord DM: short, no
  @here; LinkedIn: under ~300 characters for connection notes). Rules in
  `references/message-craft.md`.
- **Community vocabulary and language:** use the profile's word for members and its
  language in member-facing drafts; match the manager's language in replies.
- **Source flexibility:** every skill points to `references/platform-guide.md` for
  where data lives in each tool and how to read it.

## A3. `references/platform-guide.md` (new shared reference)
Per tool: whether an official connector exists, what to read (objects and fields),
the activity signal, the consent/opt-in signal, the export path when there's no
connector, and gotchas. Cover HubSpot, Salesforce, Attio, Pipedrive, Affinity, Zoho
CRM, Slack, Discord, Airtable, Google Sheets, Excel, Notion databases, Typeform, Tally,
Google Forms, Jotform, Mailchimp, Kit, beehiiv, MailerLite, Luma, Eventbrite, Ticket
Tailor, RSVPify, meeting-notes tools (e.g. Fireflies), WhatsApp exports, LinkedIn
connections export. Rules: map by meaning and show the mapping; email opens are not
activity (privacy protection inflates them); never use self-bots, scrapers or anything
against a platform's terms; Slack/Discord messages are signals, never quoted back.

## A4. Connectors declared for Claude (`plugin/.mcp.json`)
Official directory URLs only (from the registry, 2 Oct 2026): luma, hubspot, salesforce,
attio, pipedrive, affinity, zoho-crm, notion, airtable, google-sheets, google-drive,
gmail, microsoft-365, slack (with the standard oauth block), ticket-tailor, tally,
mailchimp, kit, beehiiv, mailerlite, fireflies. Discord has no official connector.
README and CONNECTORS.md must list every one and say all are optional.

## A5. Evals
Add fixtures and cases for the three new skills (vague first prompt; HubSpot-style CSV +
Slack member export + Discord member list + application form responses with dedupe and
inference traps; weekly review with a spacing conflict) and one channel-format case
(WhatsApp vs email). Re-run all existing cases as a regression check.
