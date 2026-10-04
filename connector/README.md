# Community Manager Toolkit by CommonOS: connector (Phase 1)

A hosted MCP server that gives the toolkit's skills fast, exact tools and in-chat approval views.
Nobody signs in and nothing is stored: each call is processed in memory and discarded. Design:
[`DESIGN.md`](DESIGN.md). Deployment: [`DEPLOY.md`](DEPLOY.md).

## Tools (all read-only, deterministic)

| Tool | What it does |
|---|---|
| `detect_member_fields` | Maps an export's columns to standard member fields and guesses the platform (HubSpot, Salesforce, Attio, Pipedrive, Affinity, Zoho, Slack, Discord, forms, email tools, Luma, Eventbrite, LinkedIn, sheets). Flags contact, sensitive and inverted-consent columns. Only headers in the known vocabulary are repeated; any other column is `column N` with its index, so a headerless export's first data row is never echoed. |
| `merge_member_records` | Merges records from several sources into one directory with no emails or phone numbers. Certain matches merge; uncertain ones (Sam and Samantha Patel, chat handles) are listed and never merged. Source IDs whose prefix or source label names a phone channel (WhatsApp, SMS, `tel:`, `mobile_phone:` …) are dropped, never echoed. Also reports coverage and the top gaps. View: `directory.html`. |
| `pair_attendees` | Pairs event guests under hard rules (no same-organisation pairs, avoid list, cap per person), with trios for an odd guest, backups and the basis of each match. Pairs 1,000 guests in under 200 ms. View: `pairs.html` (approve, remove, swap, copy as CSV). |
| `segment_members` | Assigns engagement segments and works out who can be contacted now under the 7-day and 72-hour spacing rules; opted-out members are never eligible. |
| `plan_week` | Builds at most seven prioritised items for the week, runs one spacing check across them, and says what it moved. Ledger rows carry `opted_out` and `removal_request` (requester, target, both or none) set by the caller from the notes; without them, any opt-out or removal wording in a note holds both people of that row and lists it in `needs_review` for the manager to confirm. It never guesses who a note refers to. |
| `compute_impact_metrics` | Gives exact funnel counts and rates, outcome mix and coverage, average rating with n, and splits by source and month. View: `report.html`. |
| `check_draft_message` | Checks a draft against channel limits and message-craft rules: length, SMS segments, markdown, questions, placeholders, contact details in a consent ask, broadcast phrasing, sensitive words and a missing email subject. |

## Run locally

```bash
npm install
npm run dev        # http://localhost:8787 — /mcp, /healthz and the pages from ../docs
npm run build      # dist/ + site/ (copy of ../docs) + the three views in dist/ui
npm start          # serve the build
```

The views embed the CommonOS fonts if `BRAND_FONTS_DIR` (default `~/Desktop/commonos/brand/fonts`)
holds them; otherwise they use system fonts. Font files are never committed.

## Test

```bash
npm test           # unit tests per tool + golden tests over ../evals/fixtures
npm run smoke      # starts the built server on a free port (or PORT, if set and free) and drives it with an MCP client
```

## Privacy posture

- No database, no storage, no accounts and no outbound network calls. Views load nothing from the
  network: no analytics, no third-party scripts, and fonts are embedded.
- Emails are used only to match records and are never returned. Free text is scrubbed of email
  addresses and phone numbers, and sensitive-attribute words never become tags or match reasons.
- Logs record only the route or tool name, latency, record counts and status: never inputs or IP addresses.
  Unknown paths, MCP methods and tool names are logged as "other".
- Requests are limited to 2 MB, list sizes are capped, and there is an in-memory rate limit of 600
  requests per minute per client (an IPv4 address or an IPv6 /64), tracking at most 10,000 clients.
