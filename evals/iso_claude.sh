#!/usr/bin/env bash
# Single place that defines how the eval harness calls the local `claude` CLI in isolation.
# run.sh, grade.py and probe_isolation.sh all go through this script, so the flags below
# are the whole isolation story (see evals/README.md for what each one does and what leaks).
#
# usage: iso_claude.sh --cwd DIR --model MODEL [--plugin DIR] [--mcp-url URL] [--tools LIST]
#                      [--format json|stream-json] [--append-note TEXT] < prompt.txt > output
#   --cwd      working directory for the run (a fresh temp dir; the only place the model can write)
#   --plugin   load this plugin dir for the session (adds a read-only allow rule for that dir)
#   --mcp-url  connect the toolkit's own MCP connector (http transport) as the one MCP server, named
#              community-manager-toolkit, and allow all of its tools (default: no MCP server at all)
#   --tools    built-in tools to expose (default: file tools + Skill; "" = no tools, used for the judge)
#   --format   output format (default stream-json, which includes the init event and every tool call)
# The prompt is read from stdin (avoids argv length limits and variadic-flag parsing traps).
# Env overrides: EVAL_TIMEOUT (seconds, default 900), EVAL_MAX_USD (per run, default 3),
# EVAL_EFFORT (model-under-test effort, default medium; the judge passes --effort high).
set -euo pipefail

CWD="" MODEL="" PLUGIN="" MCP_URL="" FORMAT="stream-json" NOTE_EXTRA="" EFFORT="${EVAL_EFFORT:-medium}"
MCP_NAME="community-manager-toolkit"   # server name; its tools appear as mcp__community-manager-toolkit__<tool>
TOOLS="Read,Write,Edit,Glob,Grep,Skill"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cwd) CWD="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --plugin) PLUGIN="$2"; shift 2 ;;
    --mcp-url) MCP_URL="$2"; shift 2 ;;
    --tools) TOOLS="$2"; shift 2 ;;
    --format) FORMAT="$2"; shift 2 ;;
    --append-note) NOTE_EXTRA="$2"; shift 2 ;;
    --effort) EFFORT="$2"; shift 2 ;;
    *) echo "iso_claude.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done
[[ -d "$CWD" && -n "$MODEL" ]] || { echo "iso_claude.sh: --cwd (existing dir) and --model are required" >&2; exit 2; }

# An empty MCP config plus --strict-mcp-config stops every other MCP source loading,
# including the claude.ai account connectors (Luma, HubSpot, Slack, Notion, ...).
# With --mcp-url the config holds exactly one server, the toolkit connector; --strict-mcp-config
# still blocks every other source.
EMPTY_MCP="$(mktemp "${TMPDIR:-/tmp}/cmt-empty-mcp.XXXXXX")"
trap 'rm -f "$EMPTY_MCP"' EXIT
if [[ -n "$MCP_URL" ]]; then
  [[ "$MCP_URL" =~ ^https?://[^[:space:]]+$ ]] || { echo "iso_claude.sh: --mcp-url must be an http(s) URL, got: $MCP_URL" >&2; exit 2; }
  python3 -c 'import json,sys; print(json.dumps({"mcpServers": {sys.argv[1]: {"type": "http", "url": sys.argv[2]}}}))' \
    "$MCP_NAME" "$MCP_URL" > "$EMPTY_MCP"
else
  echo '{"mcpServers":{}}' > "$EMPTY_MCP"
fi

NOTE="You are running inside an automated test harness with a single user turn; nobody can reply mid-run. \
Your only tools are file tools on the current working directory: the files the user mentions are there, and any file you produce should be saved there. \
Treat today's date as ${EVAL_TODAY:-30 September 2026}. \
Any account email address, username or directory path you can see in your environment belongs to the test harness, not to the person you are helping: never infer a name from it, and never sign or address anything with it (use a placeholder such as [Your name] where a sender name is needed)."
[[ -n "$NOTE_EXTRA" ]] && NOTE="$NOTE $NOTE_EXTRA"

# Never inherit the operator's session effort (the desktop app exports CLAUDE_EFFORT, e.g. "max",
# which made every run think far longer than a normal chat user's would). Pin it explicitly.
unset CLAUDE_EFFORT
ARGS=(-p --model "$MODEL" --output-format "$FORMAT" --effort "$EFFORT"
  --setting-sources ""            # no user / project / local settings: drops ~/.claude/CLAUDE.md, user hooks, enabledPlugins, user skills
  --strict-mcp-config --mcp-config "$EMPTY_MCP"
  --tools "$TOOLS"                # built-in tool allowlist: no Bash, no Web*, no Agent/Task, no cron
  --permission-mode acceptEdits   # edits inside cwd only; anything else is denied in headless mode
  --no-session-persistence
  --max-budget-usd "${EVAL_MAX_USD:-3}"
  --append-system-prompt "$NOTE")
[[ "$FORMAT" == "stream-json" ]] && ARGS+=(--verbose)
ALLOW=()
if [[ -n "$PLUGIN" ]]; then
  PLUGIN="$(cd "$PLUGIN" && pwd -P)"
  # Skills read their own references/ files from the plugin dir, which is outside cwd.
  # Allow Read on that one path; Write/Edit there stay denied.
  ARGS+=(--plugin-dir "$PLUGIN")
  ALLOW+=("Read(/${PLUGIN}/**)")
fi
# Headless mode has no one to approve an MCP tool call, so a server's tools are denied unless
# allow-listed. "mcp__<server>" allows every tool of that one server and nothing else.
[[ -n "$MCP_URL" ]] && ALLOW+=("mcp__${MCP_NAME}")
[[ ${#ALLOW[@]} -gt 0 ]] && ARGS+=(--allowedTools "${ALLOW[@]}")

# A parent session can export MCP_CONNECTION_NONBLOCKING=true (one started from Claude Desktop had it). The
# CLI then starts the first turn before the MCP server has connected, so a server that takes more than a
# moment to answer (any remote host) is "pending" in the init event with none of its tools, and the model
# never sees them. Unset it for the connector arm so the CLI waits for the connection (see README).
ENV_UNSET=()
[[ -n "$MCP_URL" ]] && ENV_UNSET=(-u MCP_CONNECTION_NONBLOCKING)

cd "$CWD"
set +e
env ${ENV_UNSET[@]+"${ENV_UNSET[@]}"} \
  CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
  CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 \
  CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1 \
  perl -e 'alarm shift; exec @ARGV' "${EVAL_TIMEOUT:-900}" claude "${ARGS[@]}"
rc=$?
exit $rc
