# Community Manager Toolkit by CommonOS

Introductions, event matchmaking, a clean member directory, a weekly plan and impact
reports for community managers, built from what worked in a real ~850-member
professional network.

For anyone running a professional network, association, alumni group, members' club,
accelerator cohort, event series, or a WhatsApp, Slack or Discord community, who needs
useful connections between members and proof of the community's value.

## Try these first

- "What can you do?"
- "Set up my community profile"
- "Build my member directory from HubSpot and Slack"
- "What should I do for my community this week?"
- "Match the attendees of my next Luma event"

## Skills

- **Getting started:** the menu, which of your tools to connect, and a Community profile
  so no skill asks the same thing twice.
- **Member directory:** one clean member table from your CRM, Slack or Discord, sheets,
  forms and email tools, de-duplicated, with the gaps and a plan to fill them.
- **Weekly community review:** up to seven things to do this week, each with the prompt
  to run it, spaced so no member gets two messages.
- **Event matchmaking:** a match, a reason and a backup for every guest, a host sheet,
  "find [name]" messages and a morning-after follow-up.
- **Member introductions:** consent-first, double opt-in intros with a sales-pitch
  screen, identity checks and follow-ups until you know the conversation happened.
- **New member onboarding:** a first month built around one named introduction, with
  day-3, day-14 and day-30 check-ins.
- **Member re-engagement:** segment quiet members, pick the right touch for each, and
  draft a small batch of personal messages instead of a broadcast.
- **Community impact report:** a board or sponsor report built on outcomes, with data
  coverage stated honestly.

## How it works

Ask in plain words. Each skill reads your Community profile and member directory first,
asks at most three questions at a time, shows you a table to approve, then drafts in your
channel's format (WhatsApp, SMS, email, Slack, Discord or LinkedIn). You approve every
pair and every message. Nothing is sent unless you explicitly ask, one message at a time,
and nothing is ever bulk-sent.

Every introduction goes into an intro ledger (Notion, Google Sheets, Airtable or a CSV
file) with next-check dates, so follow-ups happen and your impact report counts real
outcomes.

Built-in guardrails: no pairs from the same organisation, identity checks for similar
names, no sensitive attributes in match reasons, cooldowns and message spacing, no cold
messages, and immediate handling of opt-out and removal requests.

## Optional connector: seven tools, stores nothing

The skills work on their own. Add the Community Manager Toolkit connector and seven tools
do the exact work in code, so the answer is the same every time. The assistant keeps the
judgement and the writing.

- `detect_member_fields`: maps the columns of any export to member fields.
- `merge_member_records`: merges records from several sources into one directory and
  lists uncertain matches for you instead of merging them.
- `pair_attendees`: pairs event guests with a backup for each, never from the same
  organisation.
- `segment_members`: sorts members by activity and says who can be messaged now.
- `plan_week`: builds this week's list and resolves message-spacing conflicts.
- `compute_impact_metrics`: counts the introduction funnel and event figures exactly.
- `check_draft_message`: checks a draft against the channel's rules before you send it.

No sign-in. The connector processes what your assistant sends it in memory and stores
nothing. Address: `https://toolkit.commonos.ai/mcp`. Add it from your assistant's
connector settings.

## Connectors (all optional)

Declared in the plugin: Luma, HubSpot, Salesforce, Attio, Pipedrive, Affinity, Zoho CRM,
Notion, Airtable, Google Sheets, Google Drive, Gmail, Microsoft 365, Slack,
Ticket Tailor, Tally, Mailchimp, Kit, beehiiv, MailerLite and Fireflies. RSVPify, Jotform
and SurveyMonkey also work if you connect them. Discord, Eventbrite, Typeform, Google
Forms, WhatsApp and LinkedIn have no official connector: upload their exports. No
connectors at all? Upload CSV or spreadsheet exports, or paste text. See
[CONNECTORS.md](CONNECTORS.md).

## What data goes where

- **The skills** are instructions only. They have no server of their own and store
  nothing. Your data stays in your AI assistant and the tools you connect, under those
  providers' terms. The skills write to your tools (the profile, the directory, ledger
  rows, drafts, a saved report) only after you approve.
- **The optional connector** processes the data your assistant sends to its tools in
  memory to compute the result, then discards it. It stores nothing and logs no content:
  its logs hold only the tool name, timing, record counts and status. It has no sign-in
  and no analytics, and it runs in London.
- The skills read only the fields they need, never put phone numbers or email addresses
  in reports, the ledger or the member directory, and name members in reports only with
  your confirmation.

## Links

- Website: https://toolkit.commonos.ai/
- Privacy policy: https://toolkit.commonos.ai/privacy
- Terms: https://toolkit.commonos.ai/terms
- Support: https://toolkit.commonos.ai/support or jason@commonos.ai
- Publisher: CommonOS, operated by Jason Basel as an individual until CommonOS Ltd is
  incorporated
- Licence: MIT
