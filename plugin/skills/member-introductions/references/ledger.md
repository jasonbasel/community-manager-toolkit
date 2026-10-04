# The intro ledger

One table that records every introduction the toolkit touches, from the first ask to the
outcome. It is what turns activity into outcomes: without it, follow-ups get missed and
the impact report has nothing to stand on. The ledger belongs to the manager and lives
wherever they keep things.

## Columns

| Column | Type | Notes |
|---|---|---|
| intro_id | text | `YYYYMMDD-requester-target` slug (see below) |
| created | date | when the row was first written |
| source | select | `request` / `event` / `onboarding` / `re-engagement` |
| event | text | event name, only when source = `event` |
| requester | text | full name of the person who wants the intro (new member for onboarding) |
| requester_org | text | |
| target | text | full name of the person being asked |
| target_org | text | |
| reason | text | one line, professional overlap only |
| status | select | `proposed` / `asked` / `accepted` / `declined` / `lapsed` / `connected` / `withdrawn` |
| asked_on | date | consent ask sent |
| answered_on | date | target said yes or no |
| connected_on | date | at least one of them confirmed they talked |
| outcome | select | `super valuable` / `ok` / `didn't connect` / `unknown` |
| rating | number | 1 to 5, optional |
| next_check | date | drives follow-ups; blank when nothing is due |
| notes | text | removal and opt-out requests go here (date and category only) |

**No phone numbers, emails or handles in the ledger.** Contact details stay in the source
system.

## Rules for writing rows

- Dates are `YYYY-MM-DD`.
- **intro_id:** the created date plus both names, lowercase, hyphenated, for example
  `20260930-maya-chen-tom-okafor`. If that id exists, add `-2`, `-3`. For event pairs,
  put the guest with the clearer ask first.
- **One row per attempt.** When a request moves to the runner-up, close the first row
  (`lapsed` or `declined`) and add a new row. Never overwrite history.
- **Update by intro_id.** Never create a duplicate row for the same attempt.
- **Don't delete rows.** Use `withdrawn` instead. The exception is a member asking to be
  removed entirely: deleting their rows is the manager's decision, so ask.
- `outcome` starts as `unknown`.
- Write rows once the manager has approved the pairs or messages they relate to, then
  show which rows were added or changed.

## Status and next_check

| Moment | Set status | Set next_check | What's due then |
|---|---|---|---|
| Pair approved, ask not yet sent | `proposed` | +1 day, to confirm the ask went out (events: the morning after) | |
| Runner-up held in reserve | `proposed` | the day the first ask's answer window ends | ask the runner-up if the first says no or lapses |
| Manager confirms the consent ask went out | `asked`, `asked_on` | asked_on + 3 days, or + 2 days if the target never engaged | answer, or lapse notice and runner-up |
| Target says yes | `accepted`, `answered_on` | answered_on + 3 days | follow-through check |
| Target says no | `declined`, `answered_on` | blank | lapse notice to requester, runner-up row |
| No answer in the window | `lapsed` | blank | lapse notice to requester, runner-up row |
| Follow-through check sent | unchanged | answered_on + 10 days | outcome check |
| Either says they talked | `connected`, `connected_on` | keep the outcome check date | outcome check |
| Outcome: super valuable or ok | `connected` | blank | nothing |
| Outcome: didn't connect, or "not yet" | unchanged | outcome date + 7 days | recheck (the last one) |
| Recheck answered or unanswered | final | blank | nothing |
| Requester withdraws, opt-out or removal | `withdrawn` | blank | nothing |

**Event rows:** `proposed` when the manager approves the pairs, next_check = the morning
after the event. From the morning-after replies: "met" sets `connected` and the outcome;
"didn't meet" sets outcome `didn't connect`. If either person wants a proper follow-up
intro, add a new row with source = `request`.

**"What's due" query:** rows where next_check is today or earlier and status is not
`declined`, `lapsed` or `withdrawn`. Group them by what's due (lapse check,
follow-through, outcome, recheck, event follow-up).

## Counting rules (use these in every report)

- **Requests:** rows created in the period. Split by source.
- **Asked:** rows with `asked_on` set, whatever their status now.
- **Still open:** status `asked`. Show separately and leave them out of rates.
- **Resolved asks:** `accepted` + `connected` + `declined` + `lapsed`.
- **Acceptance rate:** (`accepted` + `connected`) / resolved asks. Lapse rate and decline
  rate use the same denominator.
- **Connected:** status `connected`, or outcome `super valuable` or `ok`. List any rows
  where status and outcome disagree as data-quality notes rather than fixing them silently.
- **Outcome coverage:** rows that were accepted (status `accepted` or `connected`) with an
  outcome other than `unknown`, divided by all accepted rows.
- **Outcome mix:** counts of each outcome among rows with a known outcome.
- **Average rating:** mean of `rating` where present; always show n.
- **Requests that became a real conversation:** connected / requests.

Show every rate with its count and denominator ("12 of 30, 40%"), round to whole
percentages, and flag any rate built on fewer than about 10 rows.

## Where to keep it

Preference order: a Notion database if Notion is connected, else a Google Sheet if Google
Sheets or Google Drive is connected, else Airtable if connected, else a CSV file the
manager downloads and uploads next time. Before creating anything, check the Community
profile's "Intro ledger" line, then look for an existing ledger, and ask the manager
where it lives if you still can't tell; never create a second one.

**Notion.** Ask which page to create it under. Create a database named "Intro ledger"
with: `intro_id` (title), `created`, `asked_on`, `answered_on`, `connected_on`,
`next_check` (date), `source`, `status`, `outcome` (select, with the options above),
`rating` (number), and the rest as text.

**Google Sheets.** A sheet named "Intro ledger" with the column names in row 1 exactly as
above, row 1 frozen, dates as `YYYY-MM-DD`, and dropdowns on `source`, `status` and
`outcome` if the tool allows.

**Airtable.** A table named "Intro ledger": single line text for names, organisations and
`intro_id`; date fields for dates; single select for `source`, `status`, `outcome`;
number (integer) for `rating`; long text for `reason` and `notes`.

**CSV.** Produce a file named `intro-ledger.csv` with this header line, quoting any value
that contains a comma, and tell the manager to upload it next time:

```text
intro_id,created,source,event,requester,requester_org,target,target_org,reason,status,asked_on,answered_on,connected_on,outcome,rating,next_check,notes
```

## Reading an existing ledger

- Column names may differ slightly from the schema. Map them, show the mapping in one
  line, and carry on unless something essential is missing.
- Use today's date to work out what's due. If every date in the file is months away
  from today (an old export or test data), ask the manager which date to treat as today,
  and say which date you used.
- A row with no status is treated as `proposed`; say how many there were.
