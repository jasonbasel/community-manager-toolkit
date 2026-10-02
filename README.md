# Community Manager Toolkit by CommonOS

A free plugin for Claude and ChatGPT for community managers. It helps you run warm introductions, event matchmaking, member onboarding and re-engagement, keep one clean member directory, and show the value of a community with outcomes instead of activity.

For anyone running a professional network, association, alumni group, members' club, accelerator cohort, event series, or a WhatsApp, Slack or Discord community. Built from what worked in a real ~850-member professional network. Drafts only, consent first. The skills have no server. The optional connector stores nothing.

## Eight skills

Skills for community management and member engagement:

| Skill | What you get |
|---|---|
| **Getting started** | The eight jobs with a prompt to copy for each, which of your tools to connect, and a Community profile so no skill asks the same thing twice. |
| **Member directory** | One clean member table from your CRM, Slack or Discord, sheets, forms and email tools. De-duplicated, with the gaps listed and a plan to fill them. No phone numbers or email addresses in the directory. |
| **Weekly community review** | Up to seven things to do this week, each with the prompt to run it, spaced so no member gets two messages. |
| **Event matchmaking** | Pair attendees from a Luma or Eventbrite guest list (or a CSV) with a reason and a backup for everyone. Host sheet, "find [name]" messages before the event, morning-after follow-up. |
| **Member introductions** | Consent-first, double opt-in warm introductions. Screens out sales pitches, checks identity when names are similar, logs every intro and follows up until you know the conversation happened. |
| **New member onboarding** | A first month built around one named introduction instead of a feature tour, with day-3, day-14 and day-30 check-ins. |
| **Member re-engagement** | Segment quiet and dormant members, pick the right touch for each, and draft a small batch of personal messages instead of a broadcast. |
| **Community impact report** | A board or sponsor report built on outcomes (conversations that happened, how members rated them), with data coverage stated honestly. |

Ask in plain words: "What can you do for my community?", "Match the attendees of my next Luma event", "Help me introduce two members, double opt-in", "What should I do for my community this week?".

## Optional connector: seven tools, stores nothing

The skills work on their own. The connector is a hosted MCP server that does the exact work in code, so the answer is the same every time. The assistant keeps the judgement and the writing. No sign-in. It processes what your assistant sends it in memory and stores nothing.

Address: `https://toolkit.commonos.ai/mcp`

| Tool | What it does |
|---|---|
| `detect_member_fields` | Maps the columns of any export (CRM, Slack, Discord, forms, email tools, Luma, Eventbrite) to member fields. Flags contact columns so they are ignored. |
| `merge_member_records` | Merges records from several sources into one directory. Lists uncertain matches for you instead of merging them. Never returns email addresses or phone numbers. |
| `pair_attendees` | Pairs event guests, with a backup for each. Never the same organisation, never a pair you have ruled out, a cap on introductions per person. |
| `segment_members` | Sorts members by activity and says who can be messaged now without breaking your spacing rules. |
| `plan_week` | Builds this week's list and resolves spacing conflicts so no member gets two proactive messages. |
| `compute_impact_metrics` | Counts the introduction funnel, outcomes, ratings, event attendance and new-member activation exactly from your ledger. |
| `check_draft_message` | Checks a draft against the channel's rules before you send it. |

Every tool is read-only. None of them can send a message. Where your assistant supports it, pairing shows an approval table in the chat and the impact figures show as a report. Design: [`connector/DESIGN.md`](connector/DESIGN.md).

## Works with your tools, or just a file

Every connection is optional. The toolkit uses whatever you have connected, or files you upload.

- **CRM:** HubSpot, Salesforce, Attio, Pipedrive, Affinity, Zoho CRM.
- **Community:** Slack (connected) and Discord (upload a member list).
- **Events:** Luma, Ticket Tailor, RSVPify, and Eventbrite attendee reports.
- **Sheets and notes:** Airtable, Google Sheets, Excel, Notion, Google Drive.
- **Forms and email tools:** Typeform, Tally, Google Forms, Jotform, Mailchimp, Kit, beehiiv, MailerLite.
- **Files:** any CSV export, a WhatsApp chat export, a LinkedIn connections export.

[`plugin/CONNECTORS.md`](plugin/CONNECTORS.md) lists every connector, what each skill reads from it and what to upload when there is no connector.

## Install

- **Claude** (claude.ai, Claude Desktop, Claude Code): install from the Claude plugin directory. Link: _coming once the listing is approved_.
- **ChatGPT**: install from the ChatGPT Plugin Directory. Link: _coming once the listing is approved_.
- **The connector**: add `https://toolkit.commonos.ai/mcp` from your assistant's connector settings. Directory link: _coming once the listing is approved_.
- **Without installing**: the skills are plain Markdown in [`plugin/skills/`](plugin/skills). Read them, adapt them, or paste one into any AI assistant.

Website: <https://toolkit.commonos.ai/> (built from [`docs/`](docs)).

## Why it works this way

The rules come from one ~850-member professional network that ran member introductions over WhatsApp between June and September 2026. Figures are rounded, come from that one network, and are a reference point rather than a benchmark.

- **A named person plus a yes/no decision beats a feature tour.** "[Name] asked to meet you, yes or no?" got replies about 63% of the time, against about 28% for a generic event reminder and about 18% for a one-off broadcast to members never contacted before.
- **Roughly 1 intro request in 3 became a real conversation**, and people who met rated it about 4.7 out of 5. Nobody can prove that without logging each introduction and asking afterwards, so the toolkit does both.
- **New members introduced to a named person in their first days replied about 59% of the time**, against about 47% for a plain welcome message.
- **Registration is not attendance.** At one event only about 30% of pre-matched pairs had both people turn up, so every guest gets a backup match.

For context on the problem: in CMX's 2026 community report (via Bettermode, August 2026), proving value was the top frustration for community teams (36%), only 17% could put a number on it, and 34% of community teams were one person.

## Guardrails

- **Drafts only.** Nothing is sent unless you explicitly ask, one message at a time. No bulk sends.
- **Consent first.** Nobody's contact details or profile go to another person until they have said yes.
- **No same-organisation pairs**, and an identity check (full name and organisation) when two members have similar names.
- **Professional reasons only.** Match reasons never mention or infer sensitive attributes.
- **Data minimisation.** Reports, the member directory and the intro ledger never include phone numbers or email addresses.
- **Cooldowns and spacing** so members are not over-messaged; opt-out and removal requests are honoured immediately.

## Privacy

The skills are instructions only. They have no server and collect and store nothing. The optional connector processes what your assistant sends it in memory, then discards it: nothing is stored, logs hold only the tool name, timing, counts and status, there is no sign-in and no analytics, and it runs in London. Your data is also processed by the AI assistant you run the toolkit in and by any tools you connect, under those providers' terms. If you use it with member data, you are responsible for having a lawful basis and any consent needed (UK GDPR and GDPR). See [`docs/privacy.html`](docs/privacy.html) and [`docs/terms.html`](docs/terms.html) (currently drafts pending review).

## Repository layout

```
DESIGN.md          what the plugin does and why (source of truth; not shipped)
SUBMISSION.md      how to list the plugin and the connector in both directories (not shipped)
README.md          this file
LICENSE            MIT
shared/            single source for the references/ files copied into each skill
scripts/           sync-shared.sh, build-openai-zip.sh, check.sh
evals/             synthetic fixtures, test cases, run and grade scripts
connector/         the optional hosted connector (seven tools, MCP over HTTP): DESIGN.md, source, DEPLOY.md
docs/              the website: home, privacy, terms, support (served at toolkit.commonos.ai)
assets-src/        logo and icon source (SVG) and render script
plugin/            the plugin itself (Claude plugin path; source of the OpenAI ZIP)
  .claude-plugin/  .codex-plugin/  .mcp.json  CONNECTORS.md  README.md
  assets/          logo.png, icon.png
  skills/          getting-started, member-directory, weekly-community-review,
                   event-matchmaking, member-introductions, community-impact-report,
                   new-member-onboarding, member-re-engagement
```

## Checks and evals

```
bash scripts/check.sh                # claude plugin validate + portability lint + fixture check
bash scripts/build-openai-zip.sh     # dist/community-manager-toolkit-openai.zip (no Claude-only files)
bash evals/run.sh                    # run every case with and without the plugin (uses the local claude CLI)
bash evals/grade.sh                  # LLM judge + regex checks, writes evals/results/<run>/summary.md
```

The evals use only synthetic data (every person, company, email and phone number in `evals/fixtures/` is invented) and run the same prompts with and without the plugin, in an isolated session with file tools only and nothing able to send a message. See [`evals/README.md`](evals/README.md) for how the isolation works and what it cannot remove.

**Results, 1 October 2026** (rubric pass rate on synthetic data, same prompts with and without the plugin). The plugin beat the no-plugin baseline on four skills and tied on the impact report:

| Skill | With the plugin | Without | Result |
|---|---|---|---|
| Event matchmaking | 97% | 54% | Ahead |
| Member introductions | 98% | 84% | Ahead |
| Member re-engagement | 100% | 84% | Ahead |
| New member onboarding | 95% | 76% | Ahead |
| Community impact report | 100% | 100% | Level |

This run covers the five original skills. Results for the three v0.2 skills are not in it.

## Support

Bugs, questions and ideas: [GitHub Issues](https://github.com/jasonbasel/community-manager-toolkit/issues). Anything private: jason@commonos.ai. Help page: <https://toolkit.commonos.ai/support>.

## Licence

[MIT](LICENSE). Copyright (c) 2026 Jason Basel. Community Manager Toolkit is by CommonOS, operated by Jason Basel as an individual until CommonOS Ltd is incorporated. Claude is a trademark of Anthropic, PBC; ChatGPT and OpenAI are trademarks of OpenAI. This is an independent project, not affiliated with or endorsed by either company.
