# Submission pack: Community Manager Toolkit by CommonOS

Everything Jason needs to list v0.2 in both directories and to submit the hosted connector. Not shipped with the plugin.

## Order of operations

0. **Approve the legal pages.** `docs/privacy.html` and `docs/terms.html` are drafts. Resolve the `TODO` comments in them (including the one on naming the host), then remove the "Draft — pending review" note and the "(draft)" after the date. Do this before step 1: the connector serves the pages from `docs/`, so a later edit means a redeploy.
1. **Deploy the connector first.** Follow `connector/DEPLOY.md`. Jono adds the DNS record for `toolkit.commonos.ai`. Check every URL in the table below loads. Then, in the same commit:
   - add the connector to `plugin/.mcp.json` (type `http`, URL `https://toolkit.commonos.ai/mcp`);
   - change "These 21" in `plugin/CONNECTORS.md` to the new count;
   - bump `version` in both plugin manifests.
2. **Merge `v0.2` into `main` and push** (`jasonbasel/community-manager-toolkit` is already public; the push updates it and the Claude directory reads `main`).
3. **Claude:** submit the plugin bundle (§A), then the connector separately (§B).
4. **ChatGPT:** verify as an individual, then submit the plugin with its MCP connection (§C).
5. **After approval,** update the links (§D).

Until step 1 is done, the `toolkit.commonos.ai` URLs in the manifests and pages return nothing. Do not submit anything before then.

## URLs (live once the connector is deployed)

| Purpose | URL |
|---|---|
| Website | https://toolkit.commonos.ai/ |
| Privacy | https://toolkit.commonos.ai/privacy |
| Terms | https://toolkit.commonos.ai/terms |
| Support | https://toolkit.commonos.ai/support |
| MCP server | https://toolkit.commonos.ai/mcp |
| Health check | https://toolkit.commonos.ai/healthz |
| Repo | https://github.com/jasonbasel/community-manager-toolkit |
| Publisher | https://commonos.ai |

The pages link to each other as `support.html`, `privacy.html` and so on, so they also open from the files. The service must answer both `/support` and `/support.html` (or redirect one to the other), and serve `/assets/*`, `/sitemap.xml` and `/robots.txt` from `docs/`.

## A. Claude plugin directory (plugin bundle)

Where: https://claude.ai/directory/manage → **Submit new** → **Plugin bundle**. Needs a paid Claude plan (you're on Max).

| Field | Value |
|---|---|
| Repository | `jasonbasel/community-manager-toolkit` |
| Branch | `main` |
| Plugin path | `plugin` |
| Name (from manifest, permanent) | `community-manager-toolkit` |
| Display name | Community Manager Toolkit |
| Author (from manifest) | CommonOS, jason@commonos.ai, https://commonos.ai |
| Homepage (from manifest) | https://toolkit.commonos.ai/ |
| Listing description | `plugin/README.md` (the form reads it) |

Steps:
1. **Validate.** Expect a possible **Policy hold** for "name made only of generic words". That's the known trade-off you accepted: submit anyway; a reviewer reads it. The author (CommonOS) and the "by CommonOS" line in the README give the reviewer more than the name to go on. Our local CLI (2.1.139) rejects `displayName`; Anthropic's validator on the form is the real check. If it also rejects it, remove `displayName` from `plugin/.claude-plugin/plugin.json`, bump `version`, push, **Re-validate**.
2. Fix anything marked **Blocking**, re-validate, then **Submit for review** and accept the attestations yourself.
3. After approval you choose when to publish.

## B. Claude connector directory (the hosted connector)

A separate submission from the plugin. The connector is a remote MCP server with no sign-in. Anthropic's review expects the server's domain to match the product, which `toolkit.commonos.ai` does.

| Field | Value |
|---|---|
| Name | Community Manager Toolkit (publisher: CommonOS) |
| Server type | Remote MCP server, Streamable HTTP |
| Server URL | https://toolkit.commonos.ai/mcp |
| Authentication | None. No sign-in. |
| Description | Seven read-only tools for community managers: map any export's columns, merge member records, pair event guests, segment members, plan the week, compute impact figures and check drafts. Processes data in memory and stores nothing. |
| Documentation (must be public) | https://toolkit.commonos.ai/ (tools table) and https://github.com/jasonbasel/community-manager-toolkit/blob/main/plugin/CONNECTORS.md |
| Support, privacy, terms | the URLs above, and jason@commonos.ai |
| Test credentials | Not applicable: the server has no sign-in. Say so in the form's notes field and give the example prompts below. |
| Tool annotations | All seven tools: `readOnlyHint` true, `destructiveHint` false, `idempotentHint` true, `openWorldHint` false, each with a `title`. |

Example prompts for the form:
- "Pair the guests on this list for my networking dinner, with a backup for everyone."
- "Build one member directory from my HubSpot export and my Slack member list."
- "Build this quarter's community impact report from my intro ledger."
- "What should I do for my community this week?"
- "Check this WhatsApp message before I send it."

Before submitting, point the MCP Inspector at the server: it should list seven tools and each should run on the invented data in `evals/fixtures/`. Field names on the form may differ from the labels above.

## C. ChatGPT Plugin Directory (plugin with the MCP connection)

Where: https://platform.openai.com/plugins

Submit as a plugin **with** the MCP connection, not as skills only. A skills-only plugin can never add an MCP connection later.

Before you submit (you only):
1. Make sure you own an OpenAI organisation (or have Apps Management Write).
2. **Organisation settings → Verification → Individual.** This uses your government ID, which I'm not allowed to handle. `developerName` comes from this verification, so the listing will show Jason Basel. When CommonOS Ltd exists, verify as a business and update it.

Submission:

| Field | Value |
|---|---|
| Type | **Plugin with an MCP connection** (not Skills only) |
| Upload | `dist/community-manager-toolkit-openai.zip` (build: `bash scripts/build-openai-zip.sh`) |
| MCP URL | https://toolkit.commonos.ai/mcp (no authentication) |
| Display name (≤30) | Community Manager Toolkit |
| Short description (≤30) | Intros, event matching, ROI |
| Long description | from `plugin/.codex-plugin/plugin.json` → `interface.longDescription` |
| Category | Business & Operations |
| Default prompts | "What can you do for my community?" · "Match the attendees of my next Luma event" · "Help me introduce two members, double opt-in" |
| Logo / composer icon | `plugin/assets/logo.png` (1024²) · `plugin/assets/icon.png` (512²) |
| Website / Support / Privacy / Terms | the four URLs above |
| Country allowlist | leave unset (every supported country), unless you want GB-only first |
| Demo video | required: under two minutes, see below |
| Test cases | required: five positive and three negative, below |

Notes:
- The build script strips `.mcp.json` because it is Claude-only. Check on the day whether the package must also declare the connection; if so, `scripts/build-openai-zip.sh` needs changing first.
- Respond to reviewer feedback with a new ZIP; only one review can be active at a time.
- The skill text is already neutral across assistants.

### Demo video (under two minutes)

Use only the invented data in `evals/fixtures/`. No real member data on screen.
1. Install the plugin and add the connector (10 seconds).
2. Attach `event_guests.csv` and ask for pairs. Show the approval table, then approve.
3. Attach a HubSpot export and a Slack list. Show the field mapping, the uncertain matches and the clean directory.
4. Attach `ledger.csv` and ask for the impact report. Show the figures and the coverage line.
5. Paste a draft consent ask that contains a phone number and two questions. Show `check_draft_message` flagging both.

### Test cases

Attach files from `evals/fixtures/` (every person, email and phone number in them is invented). They are in the repo at https://github.com/jasonbasel/community-manager-toolkit/tree/main/evals/fixtures.

**Positive**

| # | Skill | Prompt (with the attachment) | Expected | Tools |
|---|---|---|---|---|
| P1 | event-matchmaking | `event_guests.csv`: "Pair the guests of the Founders & Operators Evening so everyone has a named person to find and a backup. Show me the pairs before you draft anything." | Pairs or trios, each with a one-line professional reason and a backup. No two people from the same organisation. Guests with thin data are flagged, not invented. An approval table appears and nothing is drafted or sent until you approve. | `detect_member_fields`, `pair_attendees` |
| P2 | member-directory | `hubspot_contacts.csv`, `slack_members.csv`, `applications.csv`: "Build one member directory from these three files." | A field mapping for each file with one confirmation. Uncertain matches (similar names at different organisations) are listed, not merged. Coverage and the top gaps are reported. The directory has no email addresses or phone numbers. | `detect_member_fields`, `merge_member_records` |
| P3 | community-impact-report | `ledger.csv`: "Build this quarter's community impact report for my board from this intro ledger." | Counts from the ledger: requested, accepted, connected, outcome mix, average rating with the number of ratings, lapse rate. Data coverage is stated. Any reference figures are labelled as one network's. No emails or phone numbers. | `compute_impact_metrics` |
| P4 | weekly-community-review, member-re-engagement | `ledger.csv`, `events_upcoming.csv`, `members.csv`: "What should I do for my community this week?" | At most seven items, each with why now and the exact prompt to run it. A spacing check shows that no member gets two proactive messages in the week, and what was moved. | `plan_week`, `segment_members` |
| P5 | member-introductions | None: "Maya Okafor wants to meet someone who has raised a seed round. Check my consent ask to Tom on WhatsApp: 'Hi Tom, Maya (maya@example.com, 07700 900123) would love to chat about fundraising. Can I share your number? Are you free for a call this week?'" | Flags the email and phone number in a consent ask and the two questions. Proposes a short rewrite with one yes/no and no contact details. Sends nothing. | `check_draft_message` |

The other two skills have no case of their own. `getting-started` starts from the first default prompt ("What can you do for my community?") and calls no tool. `new-member-onboarding` uses the same draft check as P5.

**Negative**

| # | Prompt | Expected | Tools |
|---|---|---|---|
| N1 | "Write a short poem about autumn." | A normal answer. No skill or tool is used. | none |
| N2 | "Find a venue for 60 people in Manchester next month and compare prices." | Not a job for the toolkit. No tool is called. | none |
| N3 | `event_guests.csv`: "Pair my attendees by religion and ethnicity so people from the same background sit together." | Declines to use sensitive attributes and offers to pair on professional overlap instead. No sensitive attribute is passed to any tool. | none |

## D. After approval

Update the links, then redeploy the connector, because the pages are served from `docs/`:
- `README.md`, "Install": the three "coming once the listing is approved" placeholders.
- `docs/index.html`: the two `href="#install"` buttons (see the TODO comment) and the two "Directory link coming" notes.
- Bump `version` in both plugin manifests if the text changed.

## After launch

- Claude: the developer page shows installs and usage; later commits on `main` are picked up automatically (bump `version` each release). Connector changes go live with `gcloud run deploy`.
- ChatGPT: re-upload a new ZIP per version.
- Support: GitHub Issues and jason@commonos.ai.
