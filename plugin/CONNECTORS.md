# Connectors

Every connector is optional. Each skill starts by checking what is connected, uses what
answers, falls back to files you upload or paste, and tells you which sources it used.
Connect only the tools you already use.

## Declared in this plugin

These 21 are listed in the plugin's connector file, so assistants that read it offer them
when you install the plugin. Anywhere else, add them from your assistant's connector
settings.

| Connector | What the skills use it for |
|---|---|
| HubSpot, Salesforce, Attio, Pipedrive, Affinity, Zoho CRM | Member records: name, organisation, role, location, membership status, opt-outs. Notes only for a named member. |
| Slack | Member list, channel membership as interest signals, last-message dates for activity, intro requests you point to; drafts when you ask. Messages are never quoted back. |
| Luma | Guest lists (approved / going guests only, paged through in full), registration answers, upcoming events. The Luma connection cannot mark check-ins. |
| Ticket Tailor | Attendees, custom question answers, check-in status where available. |
| Notion | The member directory and intro ledger (first choice), a "Community profile" page, saved reports. |
| Google Sheets | Member lists, event exports, Google Forms response sheets; the directory and ledger (second choice). |
| Google Drive | Finding sheets and docs, a "Community profile" doc, saved reports. |
| Airtable | Member bases; the directory and ledger (third choice). |
| Microsoft 365 | Excel files on OneDrive or SharePoint, intro requests and drafts in Outlook, a Teams message you point to. |
| Gmail | Reading an intro request you name; email intro drafts when you ask. |
| Tally | Application and registration answers (the best source of asks and offers), consent questions. |
| Mailchimp, Kit, beehiiv, MailerLite | Subscription status (opt-in and unsubscribes), tags and groups. Email opens are never counted as activity. |
| Fireflies | Meeting summaries for a named member: what they're looking for, what they offer, what they're working on. |

## Also works if you connect them

RSVPify (attendees and check-ins), Jotform and SurveyMonkey (form responses) have
official connectors in assistant directories but aren't declared here. Add them from your
assistant's connector settings if you use them.

## No connector: upload the export

| Tool | What to upload |
|---|---|
| Discord | A member list from a bot you already run in the server, role member lists, or a channel export made with a bot account. Never self-bots or scrapers. |
| Eventbrite | The attendee report (Manage attendees, then Reports) as CSV or XLSX. Its check-in status shows who actually came. |
| Typeform | Responses downloaded as CSV or XLSX. |
| Google Forms | Link responses to a Google Sheet and connect Google Sheets, or download the responses as CSV. |
| WhatsApp | A chat export (.txt, exported without media). |
| LinkedIn | Your own `Connections.csv` (Settings, Data privacy, Get a copy of your data). Used only to fill organisation and role for existing members. |
| Anything else | Any CSV or spreadsheet export. The skills map columns by meaning and show you the mapping first. |

## Which skill uses what

| Skill | Reads | Writes, only after you approve |
|---|---|---|
| getting-started | which tools are connected (one light check each); your answers | the Community profile, where you choose |
| member-directory | member records, Slack or Discord members, sheets, forms, email tools, events, the ledger | the member directory |
| weekly-community-review | the profile, ledger, directory, upcoming events, activity you point to | nothing; drafts only when you ask |
| event-matchmaking | a guest list; member records | ledger rows; message drafts |
| member-introductions | the request (Slack, Gmail, Outlook or pasted); member records; the ledger | ledger rows; message and email drafts |
| new-member-onboarding | new-member profiles; member records; upcoming events | ledger rows; message drafts |
| member-re-engagement | member list, activity and opt-in; the ledger | ledger rows; message drafts |
| community-impact-report | the ledger; event exports; member list | the report, if you ask for it to be saved; confirmed ledger fixes |

No skill sends anything on its own. If you explicitly ask it to send through a connected
tool, it confirms each message with you, one at a time, and never bulk-sends.

## What data goes where

- This plugin has no server of its own. It is a set of instructions; your data stays in
  your AI assistant and the tools you connect.
- The skills read only the fields they need: name, organisation, role, location, what
  people want and offer, last active, opt-in.
- Phone numbers and email addresses never go into reports, the intro ledger or the member
  directory. The directory keeps an email domain and source IDs (such as `hubspot:123`)
  so you can find the full record in its own system.
- Writes (the profile, the directory, ledger rows, drafts, a saved report) go only to
  tools you've connected, and only after you approve.

## No connectors at all

Upload or paste instead:

- a member list (CSV or spreadsheet) with name, organisation, role, city, what they want,
  what they offer, last active and joined date;
- an event guest export (Luma guest CSV, Eventbrite attendee report, or any other
  platform's attendee export);
- a WhatsApp chat export or a Discord member list;
- form responses (CSV);
- your intro ledger and member directory as CSVs (the skills give you the header lines
  and a new file to keep);
- the intro request itself, pasted as text.
