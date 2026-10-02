# Platform guide

Where member, event and activity data lives in each tool, how to read it, and what to
watch for. Use it with `data-sources.md`, which says where to look first, which fields
to read and what to do about gaps.

"Connector: yes" means an official connector is listed in at least one major assistant
connector directory as of October 2026. Availability differs by assistant and plan, so
what counts is what is actually connected: check with one cheap read. Where there is no
connector, use the export path.

## Rules for every source

- **Map by meaning; column names vary.** Show the mapping (source field → field you'll
  use) in one line or a small table before relying on it. Ask only about fields you can't
  place.
- **Read the minimum.** The fields in `data-sources.md`, nothing more. Emails and phone
  numbers stay internal (de-duplication, colleague check) and never appear in outputs.
- **Activity is something the member did:** sent a message, came to an event, replied,
  submitted a form, answered an intro ask, joined a meeting. Email opens are not
  activity: mail privacy protection opens messages automatically, which inflates opens.
  Clicks are weak. Outreach your team logged in a CRM (calls, emails, meetings booked) is
  your touch, not their activity: use it for spacing checks, never as last active.
- **Opt-out anywhere counts.** An unsubscribe, opt-out or "do not contact" flag in any
  tool means no proactive drafts until the manager says otherwise (`guardrails.md` §10).
  Say which tool it came from.
- **Messages are signals, never quotes.** Slack and Discord messages, form answers and
  meeting notes tell you asks, offers and activity. Summarise in your own words.
- **Stay within each platform's terms.** No self-bots, scrapers, browser automation of a
  personal account, or unofficial exporters. Use connectors, the platform's own exports,
  or a bot the admin already runs.
- If a connector can't return what you need, say so and give the export path.

## Connector status (October 2026)

- **Connector: yes.** HubSpot, Salesforce, Attio, Pipedrive, Affinity, Zoho CRM, Airtable,
  Google Sheets, Google Drive, Gmail, Notion, Microsoft 365 (Outlook, Teams, OneDrive and
  SharePoint, including Excel files), Slack, Luma, Ticket Tailor, RSVPify, Tally, Jotform,
  SurveyMonkey, Mailchimp, Kit, beehiiv, MailerLite, Fireflies.
- **No connector: use the export.** Discord, Typeform, Google Forms, Eventbrite, WhatsApp,
  LinkedIn.

## CRMs

Common to all of them:

- Members are usually a subset: a lifecycle stage, list, tag, pipeline or custom field.
  Use the one the Community profile names; otherwise ask which.
- Leads and prospects are not members and haven't opted in.
- Custom fields for asks, offers and joined date have names that vary. Map by label.
- The record's created date is when the record was created, not when they joined. Use a
  membership start field if there is one.
- Read notes only for a named member and only the lines that bear on the task.

**HubSpot** (connector: yes). Contacts: `firstname`, `lastname`, `email` (internal),
`company`, `jobtitle`, `city`, `country`, `createdate`. `company` is free text; if it's
blank, use the associated company record. `notes_last_contacted` is your team's last
logged call, email or meeting with them: a touch, not activity. `hs_email_optout` = true
means unsubscribed from all email: treat as opted out. Export: a contacts view, exported
as CSV or XLSX.

**Salesforce** (connector: yes). Contact: `FirstName`, `LastName`, `Title`,
`Account.Name`, `MailingCity`, `CreatedDate`, `LastActivityDate`, `HasOptedOutOfEmail`.
Membership is often a custom field, a campaign or a related object; ask which.
`LastActivityDate` is the latest task or event your team logged: a touch.
`HasOptedOutOfEmail` = true means opted out. Custom fields end in `__c`; map by label.
Export: a contacts report, exported as CSV.

**Attio** (connector: yes). People records and the lists they sit on; a members list often
holds status as a list-entry attribute, so read the person and the list entry.
Organisation comes from the linked company record. If email and calendar sync is on, the
interaction attributes (such as last interaction) record your team's emails and meetings:
touches. Opt-in is usually a custom attribute or a list, else unknown. Export: a list or
view as CSV.

**Pipedrive** (connector: yes). Persons, their organisation, labels and custom fields.
Membership may be a label, a custom field or a deal in a membership pipeline, where the
deal stage is the status. Activity dates are your team's logged activities. If the
manager uses Pipedrive's email campaigns, the marketing status field is the opt-in
signal; else unknown. Export: a filtered persons list as CSV or Excel.

**Affinity** (connector: yes). People, organisations and the lists they sit on, with list
fields and notes. It holds everyone the team has emailed: only people on the members list
are members. Interaction dates and relationship strength come from your team's email and
calendar: touches, not interest. Export: a list as CSV.

**Zoho CRM** (connector: yes). Contacts (separate from Leads): first and last name,
account name, title, mailing city, created time. Email Opt Out = true means opted out.
Last Activity Time can change when anyone edits the record, so it isn't member activity.
Export: a module or custom view as CSV (needs export permission).

## Slack and Discord

**Slack** (connector: yes).
- Read: the member list (real name, display name, title, time zone, and any custom
  profile fields the workspace set up) and channel membership, which signals interest and
  location (#fundraising, #hiring, #london). The time of a member's last message in the
  channels the manager points you to is their last active.
- Intro requests: read only the message or thread the manager points to.
- Members: full members of the community's own workspace. Guests (single- and
  multi-channel), bots, deactivated accounts and people from other organisations in shared
  channels are not members unless the manager says otherwise.
- Display names aren't unique. Match to the directory by real name plus title or email
  domain (internal); list the rest as uncertain.
- Never quote messages. Never read private channels or DMs the manager didn't point you
  to. Never post to a channel or use @here or @channel.
- Export: workspace owners and admins can usually export the member list as CSV from the
  admin pages. Message exports depend on plan and role; use only what the manager exports
  themselves.

**Discord** (connector: no; no built-in member export).
- Use only what the admin can produce legitimately: a member list from a bot they already
  run in the server, role member lists or the server settings Members page copied by
  hand, or a channel export made with a bot account, never their personal account.
- Never self-bots, user-token tools or scrapers: they break Discord's terms and can get
  the admin's account banned.
- Read: username and server nickname, roles (interest and segment signals such as
  @founder, @investor, @berlin), join date where the list has it, last message date from
  an export.
- Usernames often aren't real names. Match to the directory only on a confirmed link (a
  verified-member role, a linking form, the manager's say-so); list the rest as unmatched.
  Never guess identity from a username.
- Many members block DMs from server members. Prefer the profile's main channel.

## Sheets and databases

**Airtable** (connector: yes). Find the members base and table, and prefer the view the
manager uses ("Active members"). Use field names as they are. Linked-record fields (an
organisation linked to a Companies table) may come back as IDs: read the linked table's
primary field. "Last modified time" fields record edits, not activity. Export: the view's
Download CSV.

**Google Sheets** (connector: yes; also through Google Drive). Find the right tab, then
the header row (it isn't always row 1: title rows and merged cells sit above it), map,
then read rows. Events often have one tab each. A Google Forms response sheet is read
here. Export: File, Download, CSV, one tab at a time.

**Excel** (connector: yes, through Microsoft 365 for files on OneDrive or SharePoint; or
upload the file). Same mapping rules; check every sheet and named table. Dates can arrive
as numbers (45930 is an Excel serial date): convert them and say so. CSVs saved from
Excel can garble accented names, so check them. Microsoft 365 also covers Outlook
(requests, email drafts) and Teams (a message the manager points to).

**Notion databases** (connector: yes). Read database properties, not page bodies. A linked
view may show only some rows: find the source database. Relation properties point to
other databases (organisations, events); select and multi-select properties make good
tags. "Last edited time" is edits, not member activity. Export: the database menu, Export,
CSV.

## Forms

Application and registration answers are the richest source of asks and offers ("what
are you looking for", "what can you help with", "what are you working on"). Map each
question to asks, offers, organisation or role, summarise the answers in your own words,
and label anything you infer. A submission date is activity. A consent question ("happy
to be introduced to other members") is an opt-in signal: record it with the form's name.
Conditional questions leave blanks, and blank isn't "no".

- **Typeform** (connector: no). Download responses as CSV or XLSX from the form's results.
  Each question is a column headed by its full text; hidden fields and "other" answers
  get their own columns.
- **Tally** (connector: yes). Submissions, with question titles as fields; or download the
  submissions as CSV.
- **Google Forms** (connector: no). Link responses to a Google Sheet and read it with the
  Sheets connector, or download the responses as CSV.
- **Jotform** (connector: yes). Submissions; or download them as CSV or Excel.
- **SurveyMonkey** (connector: yes). Responses per survey; or export them as CSV or XLSX.
  Anonymous surveys can't be tied to members: use them for themes only.

## Email tools

Useful: subscription status (the opt-in signal for email), tags and groups (interest and
segment signals), signup date and custom fields (company, role, city). Opens are not
activity; clicks are weak; a reply is activity. A list usually includes non-members, so
subscription isn't membership.

- **Mailchimp** (connector: yes). Audience contacts: `FNAME`, `LNAME` and other merge
  fields, status (`subscribed`, `unsubscribed`, `cleaned`, `pending`, `transactional`,
  `archived`), tags, signup date. Only `subscribed` is opted in; `pending` hasn't
  confirmed. Export: the audience's contacts as CSV.
- **Kit** (connector: yes). Subscribers: first name, state, tags, custom fields. Only an
  active state means subscribed. Export: subscribers as CSV.
- **beehiiv** (connector: yes). Subscriptions: status (only active means subscribed), tier
  (free or paid: a segment signal, not engagement), custom fields, signup source.
  Export: subscribers as CSV.
- **MailerLite** (connector: yes). Subscribers: default fields include name, last name,
  company, city and country; status (only active means subscribed); groups and segments.
  Export: subscribers as CSV or XLSX.

## Event tools

**Luma** (connector: yes). Find the event by name or date; confirm it if more than one
matches.
- Use approved / going guests only. Leave out pending approval, waitlist, declined,
  invited-but-not-registered and cancelled, and say how many.
- Guest lists come back in pages of 50. Keep requesting the next page until there are
  none, then check against the event's registered total and say "fetched N of N". A list
  of exactly 50, 100 or 150 usually means paging stopped early.
- Registration answers are the best source for asks and offers.
- The connection can't mark guests as checked in, and check-in data may not come through
  it reliably. For who came, ask for the guest CSV from the event dashboard, which
  includes check-in times when the door used Luma check-in.
- A Luma blast goes to every guest: it's a broadcast. Draft it; never send it.

**Eventbrite** (connector: no). Export the attendee report: Manage attendees, then
Reports (Attendee summary), as CSV or XLSX. Map first and last name, ticket type,
attendee status, check-in status and any custom question columns (company, job title,
"what are you looking for"). Keep attending or checked-in people; leave out refunded,
cancelled and transferred tickets and say how many. Check-in status shows who came: use
it for the morning-after follow-up and "pairs met". A custom Eventbrite connection the
manager added works the same way; say which fields it returned.

**Ticket Tailor and RSVPify** (connector: yes). Confirmed tickets or attending RSVPs
only, custom question answers, and check-in status where available. Same rules as Luma.

**Anything else** (Meetup, Zoom, webinar platforms): ask for the attendee or registrant
CSV. A Zoom attendance report shows who joined: attendance, not just registration.

## Meeting notes

**Fireflies** (connector: yes) and other note-takers (export or paste). Read summaries and
action items only for meetings the manager names or that include a named member, and
only lines that bear on the task: asks, offers, what they're working on. A meeting the
member joined is activity for them and a touch for spacing. Never quote transcripts; leave out
anything personal or said in confidence.

## Exports with no connector

**WhatsApp chat export** (.txt, exported without media). Lines look like
`[dd/mm/yyyy, hh:mm:ss] Name: message` or `dd/mm/yyyy, hh:mm - Name: message`; date order
follows the phone's locale (check whether days or months exceed 12). A message can run
over several lines until the next timestamp. Skip system lines (joined, left, changed the
group name, media omitted, deleted messages).
- Senders saved in the exporter's phone appear by name; others appear as a phone number.
  Map numbers to members only via the member list, and never print a phone number.
- Last active = the date of each sender's last message.
- Asks: "looking for", "does anyone know", "can anyone recommend", "we're hiring", "need
  help with". Offers: "happy to help", "I can", "we offer", "ping me if". One line per
  person in your own words, with the date.
- Ignore personal or off-topic content.

**LinkedIn connections export.** The manager's own export: Settings, Data privacy, Get a
copy of your data, Connections. `Connections.csv` has First Name, Last Name, URL, Email
Address (usually blank), Company, Position and Connected On, and may start with a few
lines of notes above the header row: skip them.
- Use it only to fill organisation and role for people already in the member data (match
  on full name plus company; list uncertain ones). Never add people from it: connections
  aren't members and haven't opted in.
- Connected On isn't activity.
- Never scrape LinkedIn or open profiles unless the manager asks about a named person.

## Email inboxes

**Gmail, Outlook** (connector: yes). Read the request thread the manager names. Create
email drafts only when asked; never send without the manager's explicit go for that one
message (`guardrails.md` §1).

## Other tools

Other community platforms (for example Circle or Mighty Networks), membership tools and
spreadsheets: ask for the member CSV export, map by meaning and show the mapping.
