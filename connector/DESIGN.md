# Community Manager Toolkit connector: Phase 1 design

Owner: Jason Basel for CommonOS. Written 2 Oct 2026. Status: to build (Phase 1).
Product name in listings: **Community Manager Toolkit by CommonOS**.

## 1. What Phase 1 is

A hosted MCP server that gives the plugin's skills fast, exact tools and in-chat
approval views. **Nothing is stored and nobody signs in.** Data the assistant sends to a
tool is processed in memory to compute the answer and is then discarded.

Why it exists (each is a measured problem from v0.1 evals and the 1 Oct live test):
- **Speed.** Pairing 35 guests took 7–10 minutes because the model solved the
  assignment in its head (~94k thinking tokens). A deterministic tool does it in
  milliseconds; the model only extracts short tags and writes reason lines.
- **Exact numbers.** Impact figures must match the ledger exactly; code counts, the model
  explains.
- **Merging sources.** De-duplication across a CRM, Slack, Discord and forms is fiddly
  and error-prone in prose; code applies the same rules every time.
- **Ease of use.** An approval table the manager can tick, edit and send back beats a
  markdown table they have to retype.
- **Discovery.** A directory connector is eligible for in-chat suggestions.

Phase 2 (later, not in this build): sign-in, a stored member directory, intro ledger and
Community profile, weekly review across sessions, lead capture. The data holder is
decided before Phase 2 goes live.

## 2. Hosting and addresses

- Google Cloud Run, region `europe-west2` (London), scale to zero, max 2 instances,
  512 MiB. Deployed later from a separate Google account Jason sets up; this build only
  has to deploy cleanly with `gcloud run deploy --source .` (Dockerfile included).
- Address: `https://toolkit.commonos.ai` (Jono adds the DNS record). The same service
  serves `/mcp` (Streamable HTTP), `/healthz`, and the product pages (`/`, `/privacy`,
  `/terms`, `/support`) built from the repo's `docs/` folder, so the server's domain
  matches the product, as Claude's review expects.
- Document the custom-domain options for Cloud Run in `connector/DEPLOY.md` (Cloud Run
  domain mapping where the region supports it, otherwise Firebase Hosting rewrite to the
  service); don't pick a paid load balancer.

## 3. Stack

Node 22, TypeScript, Hono + `@hono/node-server`, `@modelcontextprotocol/sdk` Streamable
HTTP in **stateless** mode (no session IDs; Cloud Run may run several instances),
`@modelcontextprotocol/ext-apps` for the in-chat views (bundled with esbuild into single
HTML resources), zod for every input, vitest for tests. Reuse the working patterns in
`/Users/jasonbasel/Desktop/opus-claude/grant-precedent/` (read-only reference: `src/server.ts`,
`src/ui.ts` for `claudeUiDomain` and `uiToolMeta` incl. the `openai/outputTemplate` alias,
`src/build-ui.ts`, `src/ui/*.ts`). Never modify that project.

## 4. Tools

All tools: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`,
`openWorldHint: false`, a `title`, names ≤64 chars, descriptions that say what the tool
does and when to use it (no instructions about other tools, no promotion). Every tool
returns a short human-readable text summary **and** `structuredContent`, so it works
with or without the view. Errors are specific ("guests[3].id is missing"), never generic.

Canonical member fields used throughout: `name, first_name, last_name, organisation,
role, location, email (identity only, never returned), source, source_id, joined,
last_active, status, asks, offers, tags, opted_in, notes`.

### 4.1 `detect_member_fields`
Map any export's columns to the canonical fields.
- In: `source_name`, `headers` (≤200), optional `sample_rows` (≤5 rows).
- Out: `platform_guess {name, confidence, evidence}`, `mapping [{column, field,
  confidence, reason}]`, `unmapped`, `contact_columns` (will be ignored downstream),
  `warnings`.
- Header signatures for: HubSpot export, Salesforce report, Attio, Pipedrive, Affinity,
  Zoho, Slack members export, Discord bot/role export, Airtable/Notion/Sheets (generic),
  Typeform / Tally / Google Forms / Jotform responses (question-style headers → asks and
  offers by phrases like "hoping to get", "looking for", "could offer", "help with"),
  Mailchimp / Kit / beehiiv / MailerLite exports (opt-in status columns), Luma guests,
  Eventbrite attendee report, LinkedIn connections export, WhatsApp is text (not here).
  Alias tables live in `src/fields/` as data, with tests per platform.
- Echo rule: a header string is repeated only when it is in the known header vocabulary
  (alias tables, ignored headers, platform columns, contact / sensitive / engagement
  patterns, question phrases) and is not itself a data value. Every other column is called
  `column N` (1-based), and every mapping, unmapped, contact and sensitive entry carries
  `index`, so the first data row of a headerless export can never be echoed even when the
  row-level check does not fire. Sample values are returned only when they are consent or
  status vocabulary; the rest are counted.
- Sensitive headers are matched as whole words and specific phrases (health status /
  condition, medical, diagnosis, disability, pregnan*, religio*, ethnic*, race, sexual
  orientation, gender identity, marital, relationship status, plus gender, pronouns, date of
  birth, dietary …), never as stems inside other words: "Industry (e.g. Healthcare)",
  "Healthtech focus", "Diagnostics" and "Relationship owner" are not flagged.

### 4.2 `merge_member_records`
Merge records from several sources into one directory without contact details.
- In: `records` (≤5,000; fields above plus `inferred_fields`), optional `precedence`,
  `today`.
- Rules:
  - Normalise names (case, whitespace), organisations (strip Ltd, Limited, Inc, LLC, LLP,
    plc, GmbH, punctuation), emails (lowercase; Gmail dots and +tags), dates (ISO).
  - Certain match: same email, same source-ID cross-reference, or same normalised
    name + organisation.
  - Uncertain (never auto-merged, returned for the manager): same name with organisation
    missing on one side; similar names (e.g. Jaro-Winkler ≥ 0.9) at different
    organisations (Sam Patel / Samantha Patel); chat handles that don't match a name.
  - Precedence (default): identity, organisation, role from CRM > forms > community
    platforms; asks and offers from forms > notes > chat (chat-derived stays `inferred`);
    `last_active` = latest across sources with its source; `joined` = earliest;
    `opted_in` = most restrictive explicit value (any "no" wins).
  - Source IDs: `label:value` is parsed in `source_id` as well as in `source_ids`. An ID is
    dropped (never echoed; the record index is named in a warning) when its own prefix or
    the record's source label contains a phone / WhatsApp / SMS word, matched as whole
    words or segments (`mobile_phone:`, `phone_number:`, `wa:`, `whatsapp:`, `tel:`,
    `msisdn:`, source "WA group", "WhatsApp export", "sms"), when the value is phone-shaped
    (leading `+`, separators, trunk 0), an email address, a link, or a handle under a
    social label. No country-code list is involved: a bare number under a non-phone source
    (HubSpot record IDs, Discord snowflakes, Slack `U…` IDs) is a platform ID and kept, and
    a prefix that names a platform (`slack:`, `discord:`) keeps its own meaning whatever
    the record's source.
- Out: `members` (directory columns from DESIGN.md v0.2 A1: `member_id, name,
  organisation, role, location, email_domain, source_ids, status, joined, last_active,
  last_active_source, asks, offers, tags, opted_in, opt_in_source, profile_quality,
  inferred_fields, notes, conflicts`), `uncertain_matches [{a, b, reason, score}]`,
  `stats {input_records, unique_members, merged, by_source, coverage{…%}}`, `gaps`
  (top 25 by importance). **Emails are never returned**; personal domains (gmail,
  outlook, icloud, hotmail, yahoo, proton…) give a blank `email_domain`.

### 4.3 `pair_attendees`
Pair event guests fast, with backups, under hard rules.
- In: `event {name, starts_at}`, `guests` (≤1,000: `id, name, organisation, role, side,
  tags[], asks[], offers[], member, thin`), `avoid_pairs`, `exclude_ids`, `options
  {max_per_person=3, backups=true, allow_trio=true, mode='match'|'host_buddy'}`.
- Score(a,b): ask↔offer keyword overlap both ways (weight 3 each), shared tags (1),
  complementary sides (founder↔investor, operator↔founder, etc.: 1), small penalty for
  thin profiles. Keyword overlap on normalised tokens with a small synonym table
  (hire/hiring/recruit, raise/raising/fundraising/investors…).
- Hard rules: never the same normalised organisation; never an `avoid_pairs` pair;
  `exclude_ids` removed; nobody named in more than `max_per_person` rows.
- Greedy: hardest-to-match first (fewest viable partners), best available partner; odd
  remainder → trio with the best-fitting pair; then one backup per guest in a second pass
  (next-best viable partner under the cap; else `host places at door`).
- `host_buddy` mode: trios of one member + up to two non-members, different
  organisations.
- Out: `groups [{ids, score, strength: strong|medium|weak, basis{ask_offer[],
  shared_tags[], complementary}, reason_hint}]`, `backups {id: id|null}`, `unmatched
  [{id, reason}]`, `excluded {same_org, avoid, removed}`, `connectors_top5`, `stats`.
  The model writes the final ≤20-word reason lines from `basis`.
- View: `pairs.html` (see §5).

### 4.4 `segment_members`
- In: `today`, `members` (`id, joined, last_active, last_inbound, proactive_touches[],
  contacted_ever, initiated_90d, opted_in`), options `spacing_days=7`,
  `min_gap_hours=72`.
- Segments (documented, deterministic): regular (initiated ≥2 in 90 days), occasional
  (1), nudge-only (replied only after proactive touches), dark (contacted, no reply in
  90 days), never contacted, unknown (not enough data).
- Out: counts, per-member `{segment, eligible_now, next_eligible, reason}`,
  recommended touch per segment (from DESIGN.md §6.5).

### 4.5 `plan_week`
- In: `today`, `ledger` rows (compact), `events` (next 14 days), `new_members`,
  optional `segments`, `planned_touches`.
- Opt-outs and removal requests (guardrails §12): each ledger row may carry `opted_out`
  and `removal_request`, each `requester | target | both | none`, set by the caller after
  reading the note. When set they are authoritative. When a field is not set, the server
  never attributes the note to a person by name: if the note contains any opt-out or
  removal wording (table in `src/data/consent-signals.ts`: DNC, do not contact / message /
  email, opted out, unsubscribe(d), stop messaging, no more messages, doesn't want to be
  contacted, remove me, delete my data / details / information, erase / redact, forget me,
  GDPR erasure / removal …; clauses split on `. ; : ! ? — – - ( ) [ ] /` and "and", "but",
  "then"; a negator cancels only "not / no longer opted out", "never unsubscribed" and
  "don't forget") it holds BOTH people of the row, adds the row to the removal / opt-out
  item with "confirm who it refers to", and lists it in `needs_review`. A false positive
  holds two people until the manager confirms; a false negative would drop an opt-out.
  `opted_in` on `new_members`, `events.people`, `segments` and `planned_touches` applies as
  before, and people are one identity across inputs (ids and Unicode-aware name keys that
  keep non-Latin letters and drop apostrophes consistently).
- Priority: removal / opt-out requests → overdue answers / lapse notices → follow-through
  and outcome checks due → events in the next 14 days not yet matched (sooner first) →
  new members not welcomed (≤30 days) → a re-engagement batch → impact report if a month
  or quarter just ended.
- Spacing: no member gets two proactive touches in 7 days or two within 72 hours; return
  conflicts with the resolution applied.
- Out: `items` (≤7 default) `{kind, title, why_now, people, due, suggested_prompt}`,
  `spacing_conflicts`, `held` (a hold for an unattributed note reads "opt-out note found —
  confirm who it refers to"), `needs_review [{row, intro_id, requester, target,
  needs_review: true, signals, reason}]` (rule ids only, never note text), `stats`
  (incl. `opted_out`, `needs_review`). All additions are new fields; nothing existing
  changed shape.

### 4.6 `compute_impact_metrics`
- In: `period {start, end}`, `ledger` rows (`intro_id, created, source, status,
  asked_on, answered_on, connected_on, outcome, rating`), optional `events`
  (`registered, attended, pairs_made, pairs_met`), optional `new_members`
  (`joined, first_active`).
- Out: exact counts and rates (requests, asked, accepted, declined, lapsed, connected,
  conversation rate = connected / requests, acceptance and lapse rates over asked,
  outcome mix, average rating with n, outcome coverage %), by source, by month; event
  totals; activation (share active within 30 days, with n). Numbers only, no benchmarks
  (the skills add those, labelled).
- View: `report.html`.

### 4.7 `check_draft_message`
- In: `channel` (whatsapp, sms, email, slack, discord, linkedin), `text`, optional
  `subject`, `purpose` (consent_ask, connection, welcome, reengagement, event, followup,
  other).
- Checks: length (WhatsApp ≤1,024 hard, ≤500 advised; SMS segments; LinkedIn connection
  note ≤300), markdown in plain-text channels, more than one question, unfilled
  `[placeholders]`, phone numbers or emails in a consent ask, broadcast smells ("Dear
  members", "Hi all"), "we miss you"/"just checking in", sensitive-attribute terms,
  email without a subject.
- Out: `issues [{severity, rule, detail}]`, `ok`.

## 5. In-chat views (MCP Apps)

CommonOS look: ink `#0d0e10`, fog `#eceae4`, N-11 `#f5f4f0`, 2 px radius, Switzer (body)
and IBM Plex Mono (figures), both embedded from `~/Desktop/commonos/brand/fonts`
(licences included; never a CDN), light and dark. Plain, dense, no decoration.

- `ui://community-manager-toolkit/pairs.html`: the pairs table (group, strength chip,
  basis, backup), per-row keep/remove, swap a partner from unmatched or backups (re-check
  same-organisation and cap rules client-side), counts, and **Approve** which sends one
  message back into the conversation listing the approved groups (the skill then drafts).
  Also "Copy as CSV".
- `ui://community-manager-toolkit/report.html`: funnel bars, outcome mix, coverage note,
  "Copy summary".
- `ui://community-manager-toolkit/directory.html` (stretch): merge stats, coverage bars,
  uncertain matches with "same person" / "different people" choices sent back as one
  message.

Every view degrades: the tool's text summary is complete without it.

## 6. Privacy and security

- No storage, no database, no payload logging. Logs: tool name, latency, record counts,
  status. No outbound network calls. No analytics in views; no third-party scripts.
- Inputs validated with zod; request body ≤2 MB; list limits as above; per-IP rate limit
  (600 requests/minute by default, in memory; Claude and ChatGPT call from shared IPs, so a low limit would throttle many users together).
- Security headers on pages; CORS as the MCP transport requires.
- Privacy policy text (drafted by a separate task): "processed in memory, not stored",
  hosting region, sub-processor (the cloud host).

## 7. Definition of done

- `npm run build`, `npm test` (unit tests per tool, golden tests against the synthetic
  eval fixtures: no same-organisation pairs, cap respected, everyone placed or listed,
  Sam/Samantha never merged, emails never returned, metrics match fixture ledger
  counts exactly), `npm run smoke` (MCP client lists tools and calls each).
- `npm run dev` serves `/mcp`, `/healthz` and the pages locally on :8787.
- The MCP Inspector can list tools, resources and call each tool.
- `DEPLOY.md` with exact `gcloud` commands, env vars (none secret), and the domain step
  for Jono.
