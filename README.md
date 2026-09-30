# Community Manager Toolkit

A free plugin for Claude and ChatGPT that helps community managers run warm introductions, event matchmaking, member onboarding and re-engagement, and prove community ROI with outcomes instead of activity.

Built from what worked in a real ~850-member professional network. Drafts only, consent first, no server, nothing collected.

## What it does

Five skills for community management and member engagement:

| Skill | What you get |
|---|---|
| **Event matchmaking** | Pair attendees from a Luma or Eventbrite guest list (or a CSV) with a reason and a backup for everyone. Host sheet, "find [name]" messages before the event, morning-after follow-up. |
| **Member introductions** | Consent-first, double opt-in warm introductions. Screens out sales pitches, checks identity when names are similar, logs every intro and follows up until you know the conversation happened. |
| **Community impact report** | A board or sponsor report built on outcomes (conversations that happened, how members rated them), with data coverage stated honestly. |
| **New member onboarding** | A first month built around one named introduction instead of a feature tour, with day-3, day-14 and day-30 check-ins. |
| **Member re-engagement** | Segment quiet and dormant members, pick the right touch for each, and draft a small batch of personal messages instead of a broadcast. |

Ask in plain words: "Match the attendees of my next Luma event", "Help me introduce two members, double opt-in", "Build this quarter's community impact report".

It works with whatever you have connected (Luma, HubSpot, Notion, Slack, Google Drive, Airtable, Gmail, Circle) or with files you upload (CSV exports, a WhatsApp chat export). Every connector is optional.

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
- **Data minimisation.** Reports and the intro ledger never include phone numbers or email addresses.
- **Cooldowns and spacing** so members are not over-messaged; opt-out and removal requests are honoured immediately.

## Install

- **Claude** (claude.ai, Claude Desktop, Claude Code): install from the Claude plugin directory. Link: _coming once the listing is approved_.
- **ChatGPT**: install from the ChatGPT Plugin Directory. Link: _coming once the listing is approved_.
- **Without installing**: the skills are plain Markdown in [`plugin/skills/`](plugin/skills). Read them, adapt them, or paste one into any AI assistant.

Landing page: <https://jasonbasel.github.io/community-manager-toolkit/> (published from [`docs/`](docs)).

## Privacy

The plugin is instructions only. It has no server and collects and stores nothing. Your data is processed by the AI assistant you run it in and by any tools you connect, under those providers' terms. If you use it with member data, you are responsible for having a lawful basis and any consent needed (UK GDPR and GDPR). See [`docs/privacy.html`](docs/privacy.html) and [`docs/terms.html`](docs/terms.html) (currently drafts pending review).

## Repository layout

```
DESIGN.md          what the plugin does and why (source of truth; not shipped)
README.md          this file
LICENSE            MIT
shared/            single source for the references/ files copied into each skill
scripts/           sync-shared.sh, build-openai-zip.sh, check.sh
evals/             synthetic fixtures, test cases, run and grade scripts
docs/              GitHub Pages site: home, privacy, terms, support
assets-src/        logo and icon source (SVG) and render script
plugin/            the plugin itself (Claude plugin path; source of the OpenAI ZIP)
  .claude-plugin/  .codex-plugin/  .mcp.json  CONNECTORS.md  README.md
  assets/          logo.png, icon.png
  skills/          event-matchmaking, member-introductions, community-impact-report,
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

## Support

Bugs, questions and ideas: [GitHub Issues](https://github.com/jasonbasel/community-manager-toolkit/issues). Anything private: jason@communitylab.ai.

## Licence

[MIT](LICENSE). Copyright (c) 2026 Jason Basel. Claude is a trademark of Anthropic, PBC; ChatGPT and OpenAI are trademarks of OpenAI. This is an independent project, not affiliated with or endorsed by either company.
