# Submission pack

Everything Jason needs to list v0.1.0 in both directories. Not shipped with the plugin.

## Order of operations

1. Approve `docs/privacy.html` and `docs/terms.html`, then remove their "Draft" banners.
2. Make the GitHub repo `jasonbasel/community-manager-toolkit` public and push `main`.
3. Enable GitHub Pages (branch `main`, folder `/docs`). Check the four URLs below load.
4. Claude submission (§A).
5. OpenAI verification + submission (§B).

## URLs (live once Pages is on)

| Purpose | URL |
|---|---|
| Website | https://jasonbasel.github.io/community-manager-toolkit/ |
| Privacy | https://jasonbasel.github.io/community-manager-toolkit/privacy.html |
| Terms | https://jasonbasel.github.io/community-manager-toolkit/terms.html |
| Support | https://jasonbasel.github.io/community-manager-toolkit/support.html |
| Repo | https://github.com/jasonbasel/community-manager-toolkit |

## A. Claude plugin directory

Portal: https://claude.ai/directory/manage → **Submit new** → **Plugin bundle**.
Needs a paid Claude plan (you're on Max).

| Field | Value |
|---|---|
| Repository | `jasonbasel/community-manager-toolkit` |
| Branch | `main` |
| Plugin path | `plugin` |
| Name (from manifest, permanent) | `community-manager-toolkit` |
| Display name | Community Manager Toolkit |
| Listing description | `plugin/README.md` (the portal reads it) |

Steps:
1. **Validate.** Expect a possible **Policy hold** for "name made only of generic words".
   That's the known trade-off you accepted: submit anyway; a reviewer reads it.
   Our local CLI (2.1.139) rejects `displayName`; the portal's validator is the real
   check. If the portal also rejects it, remove `displayName` from
   `plugin/.claude-plugin/plugin.json`, bump `version` to 0.1.1, push, **Re-validate**.
2. Fix anything marked **Blocking**, re-validate, then **Submit for review** and accept the
   attestations yourself.
3. After approval you choose when to publish.

## B. ChatGPT Plugin Directory

Portal: https://platform.openai.com/plugins

Before you submit (you only):
1. Make sure you own an OpenAI organisation (or have Apps Management Write).
2. **Organisation settings → Verification → Individual.** This uses your government ID,
   which I'm not allowed to handle. `developerName` comes from this verification.

Submission:

| Field | Value |
|---|---|
| Type | **Skills only** |
| Upload | `dist/community-manager-toolkit-openai.zip` (build: `bash scripts/build-openai-zip.sh`) |
| Display name (≤30) | Community Manager Toolkit |
| Short description (≤30) | Intros, event matching, ROI |
| Long description | from `plugin/.codex-plugin/plugin.json` → `interface.longDescription` |
| Category | Business & Operations |
| Default prompts | "Match the attendees of my next Luma event" · "Help me introduce two members, double opt-in" · "Build this quarter's community impact report" |
| Logo / composer icon | `plugin/assets/logo.png` (1024²) · `plugin/assets/icon.png` (512²) |
| Website / Support / Privacy / Terms | the four URLs above |
| Country allowlist | leave unset (every supported country), unless you want GB-only first |
| Test credentials / demo video / test cases | not required for skills-only |

Notes:
- Skills-only plugins "may be subject to additional eligibility requirements" (OpenAI
  doesn't say which). Respond to reviewer feedback with a new ZIP; only one review can be
  active at a time.
- The ZIP strips `.claude-plugin/` and `.mcp.json`; skill text is already platform-neutral.

## After launch

- Claude: the developer portal shows installs/usage; later commits on `main` are picked up
  automatically (bump `version` each release).
- ChatGPT: re-upload a new ZIP per version.
- Support: GitHub Issues + jason@communitylab.ai.
