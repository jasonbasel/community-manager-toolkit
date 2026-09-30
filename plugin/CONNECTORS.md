# Connectors

Every connector is optional. Each skill starts by checking what is connected, uses what
answers, falls back to files you upload or paste, and tells you which sources it used.

## Pre-configured in this plugin

| Connector | What the skills use it for |
|---|---|
| Luma | Guest lists (approved / going guests only, paged through in full), registration answers, upcoming events. The Luma connection cannot mark check-ins. |
| HubSpot | Member records: organisation, role, last activity, and any custom fields for asks, offers or joined date. |
| Notion | Member directories; the intro ledger (first choice); saving reports when you ask. |
| Slack | Reading intro requests; last-message dates for activity; drafts when you ask. |
| Google Drive | Member lists and exports in Google Sheets; the intro ledger (second choice); saving reports when you ask. It has no fixed address in this plugin, so connect it from your assistant's connector settings. |

## Also used if you have connected them

- **Airtable:** member bases; the intro ledger (third choice).
- **Gmail:** reading intro requests; email intro drafts when you ask.
- **Circle:** member directory, joined dates, activity, asks and offers in posts.
- **Ticket Tailor, RSVPify:** attendees and check-in status.
- **Eventbrite:** there is no official connector, so export the attendee report (Manage
  attendees, then Reports) as CSV or XLSX and upload it. Its check-in status shows who
  actually came. A custom Eventbrite connector you have added yourself also works.

## Which skill uses what

| Skill | Reads | Writes, only after you approve |
|---|---|---|
| event-matchmaking | Luma or an event export; member records | ledger rows; message drafts |
| member-introductions | the request (Slack, Gmail or pasted); member records; the ledger | ledger rows; message and email drafts |
| community-impact-report | the ledger; event exports; member list | the report, if you ask for it to be saved; confirmed ledger fixes |
| new-member-onboarding | new-member profile; member records; upcoming events | ledger rows; message drafts |
| member-re-engagement | member list and activity; the ledger | ledger rows; message drafts |

No skill sends anything on its own. If you explicitly ask it to send through a connected
tool, it confirms each message with you, one at a time, and never bulk-sends.

## No connectors at all

Upload or paste instead:

- a member list (CSV or spreadsheet) with name, organisation, role, city, what they want,
  what they offer, last active and joined date;
- an event guest export (Luma guest CSV, Eventbrite attendee report, or any other
  platform's attendee export);
- a WhatsApp chat export (.txt, exported without media);
- your intro ledger as a CSV (the skills give you the header line and a new file to keep);
- the intro request itself, pasted as text.
