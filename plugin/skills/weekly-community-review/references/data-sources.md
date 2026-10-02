# Data sources

Where to get member and attendee data, in what order, what to read, and what to do when
it's thin. Every source is optional: use whatever the manager has connected, and fall back
to uploaded files or pasted text. Say plainly which sources you used and which you didn't.

## Where to look first

1. **The Community profile** (`community-profile.md`). It says where member records,
   events, the intro ledger and the member directory live. Go straight there.
2. **The member directory** (columns below). If one exists, use it before any other member
   source: identity, asks, offers, activity and opt-in are already merged in one place.
   If its `updated` date is more than about 30 days old, or the task needs fresher data
   (tonight's guest list), read the source system for the fields that matter, say so,
   and offer a refresh ("say: update my member directory").
3. **Connected tools.** Check which ones answer with one cheap read. For what to read in
   each tool, its activity and opt-in signals, export paths and gotchas, see
   `platform-guide.md`.
4. **Uploaded files and pasted text** (below).
5. **The manager**, for what's still missing: at most three questions at once, only
   what blocks the next step.

## Minimum fields

| Field | Used for | If missing |
|---|---|---|
| Full name | identity, messages | can't use the person |
| Organisation | same-org exclusion, reasons, identity | ask, or infer from email domain and label it inferred |
| Role | reasons, messages | match on asks and offers only |
| Location (city) | in-person events, local intros | skip location |
| What they want (asks) | matching | mark the profile thin |
| What they offer | matching | mark the profile thin |
| Last active | responsiveness, segments | treat as unknown, not as inactive |
| Joined date | onboarding, activation, segments | ask the manager |
| Opted in to messages | no cold messages | apply the profile's rule, else ask (`guardrails.md` §10) |
| Event status, registration answers | event matching | ask for the export |

Read nothing else unless the task needs it. Phone numbers and emails may be in the data;
use emails only internally (to de-duplicate or spot colleagues by domain) and never
output either. See `guardrails.md`.

## The member directory

One table per community, built and refreshed by the member-directory skill, kept where the
profile says (Notion, Google Sheets, Airtable or a CSV). It holds no phone numbers or
email addresses: contact details stay in the source systems, reached through `source_ids`.
A member list the manager keeps themselves counts as their directory even if its columns
differ: map them by meaning to the columns below.

| Column | Meaning |
|---|---|
| member_id | stable id, never reused, e.g. `m0042` |
| name | full name |
| organisation | normalised, without Ltd, Inc and similar |
| role | job title, or role in the community |
| location | city, country |
| email_domain | work domain only, for colleague checks; blank for public domains |
| source_ids | where the record lives, e.g. `hubspot:123; slack:U0ABC` |
| status | `member` / `lapsed` / `prospect` / `guest` |
| joined | membership start date |
| last_active, last_active_source | date of the member's own last action, and where it came from |
| asks, offers | one line each, in plain words |
| tags | sector, stage and side, e.g. `sector:fintech; stage:seed; side:founder` |
| opted_in, opt_in_source | `yes` / `no` / `unknown` for proactive messages, and why |
| profile_quality | `full` (organisation, role, an ask and an offer) / `partial` / `thin` (no ask and no offer) |
| inferred_fields | fields not stated by the member or their source system, each with where it came from |
| notes | removal and opt-out requests only: date and category |
| updated | date the row last changed |

Reading it:

- `opted_in` = `no` means no proactive drafts. `unknown` means apply the profile's opt-in
  rule, or ask.
- A field listed in `inferred_fields` is a guess. Confirm it before it goes into any
  message.
- `prospect` and `guest` rows are not members: event messages only, and only for events
  they registered for.
- `last_active` is the member's own action. Unknown is unknown, not inactive.

## Files and pasted text

**Uploaded CSV or spreadsheet.** Read what was uploaded before asking for anything. Use
the file's own column headers, map them to the minimum fields, show the mapping in one
line, and ask only about columns you genuinely can't place. Filter status columns
(approved, attending, member) before counting anyone. For specific exports (Eventbrite,
WhatsApp, LinkedIn, Discord, form tools), see `platform-guide.md`.

**Pasted text** (an email, a Slack message, a list of names): treat it like an upload.

## Handling gaps

- List what's missing in one short batch (for example "8 guests have no organisation; 12
  have no asks or offers") and ask the manager once for what would change the result.
- Mark thin profiles as thin. Never invent a role, an ask, an offer or an organisation.
- Label inferred facts as inferred and confirm them before they go into any message.
- Unknown last-active is unknown, not inactive.
- Two records that may be the same person, or two people with similar names: show both
  with organisation and role, and ask (`guardrails.md`, identity).
- Dates: use the event's time zone for event timing and say which one you used.

## When most profiles are thin

Real guest lists are usually thin: a Luma export often has only a name, an email domain,
a member flag and a LinkedIn link. When most guests have no ask and no offer, say so
plainly, pair whoever you can, then offer the manager these options in one message:

1. **Quick tags.** The manager (or a colleague who knows the room) gives each guest one
   tag, e.g. "founder, fintech, raising" or "investor, seed". A tag per line is enough
   to pair everyone on complementary roles.
2. **Member records.** For guests who are members, pull roles and asks from the member
   directory, or from the CRM or member sheet (`platform-guide.md`).
3. **Host-buddy mode.** Needs only the member flag: pair each first-time or non-member
   guest with a member who greets them and makes one introduction on the night. It
   helps newcomers most and needs no profile data.
4. **Next time: two registration questions.** Suggest adding "What are you hoping to get
   out of tonight?" and "What could you help someone else with?" to the registration
   form. Draft the wording; change the form only if the manager explicitly asks.

Don't look people up on the web or open LinkedIn profiles to fill gaps unless the manager
explicitly asks, and never scrape LinkedIn. A LinkedIn link is a pointer for the manager,
not data for you to collect.
