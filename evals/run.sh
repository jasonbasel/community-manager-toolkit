#!/usr/bin/env bash
# Run eval cases through the local `claude` CLI: without the plugin, with it, and with it plus the connector.
#
#   evals/run.sh                        every case, both arms (with + without)
#   evals/run.sh em-01 mi-02            only cases whose id starts with em-01 / mi-02
#   evals/run.sh --mode without mi-02   one arm only (with | without | connector)
#   evals/run.sh --mode all em-01       three arms: with, without, connector
#   evals/run.sh --list                 list case ids
#
# Options: --mode M (both|with|without|connector|all, default both)  --model M (default $EVAL_MODEL or sonnet)
#          --results-dir DIR (reuse a run dir)
# The connector arm is the plugin plus the toolkit's own MCP connector (connector/, `npm start`) at
# $CMT_CONNECTOR_URL (default http://127.0.0.1:8787/mcp); it needs the server running (checked via /healthz first).
#
# Each arm gets a fresh temp dir under $TMPDIR containing only the case's fixture files, and the
# isolation in evals/iso_claude.sh (no user settings/CLAUDE.md/hooks/plugins/connectors, file tools only;
# the connector arm adds that one MCP server and nothing else).
# Output: evals/results/<timestamp>/<case>/{with,without,connector}.json (final result event), *.stream.jsonl
# (full transcript incl. tool calls), {with,without,connector}-files/ (files the run wrote), prompt.txt.
# Then grade it: evals/grade.sh
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
PLUGIN="$REPO/plugin"
MODE="both"; MODEL="${EVAL_MODEL:-claude-sonnet-5-5}"; RESULTS_DIR=""; WANT=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --results-dir) RESULTS_DIR="$2"; shift 2 ;;
    --list) for f in "$HERE"/cases/*.json; do basename "$f" .json; done; exit 0 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) WANT+=("$1"); shift ;;
  esac
done
[[ "$MODE" =~ ^(both|with|without|connector|all)$ ]] || { echo "--mode must be both, with, without, connector or all" >&2; exit 2; }
command -v claude >/dev/null || { echo "claude CLI not found on PATH" >&2; exit 1; }

# Arms: without = plain Claude; with = + the plugin; connector = + the plugin + the toolkit's MCP connector.
CONNECTOR_URL="${CMT_CONNECTOR_URL:-http://127.0.0.1:8787/mcp}"
plugin_ready() { compgen -G "$PLUGIN/skills/*/SKILL.md" >/dev/null; }
case "$MODE" in
  both) ARMS=(with without) ;;
  with) ARMS=(with) ;;
  without) ARMS=(without) ;;
  connector) ARMS=(connector) ;;
  all) ARMS=(with without connector) ;;
esac
if ! plugin_ready; then   # the with and connector arms both load the plugin; without does not
  KEEP=(); SKIP=()
  for a in "${ARMS[@]}"; do if [[ "$a" == "without" ]]; then KEEP+=("$a"); else SKIP+=("$a"); fi; done
  if [[ ${#SKIP[@]} -gt 0 ]]; then
    if [[ ${#KEEP[@]} -eq 0 ]]; then echo "plugin has no skills yet ($PLUGIN/skills/*/SKILL.md): nothing to run" >&2; exit 1; fi
    if [[ ${#SKIP[@]} -eq 1 ]]; then skipped="the '${SKIP[0]}' arm"; else skipped="the '${SKIP[0]}' and '${SKIP[1]}' arms"; fi
    echo "note: $PLUGIN/skills has no SKILL.md files yet; skipping $skipped" >&2
    ARMS=("${KEEP[@]}")
  fi
fi

# choose case files
FILES=()
if [[ ${#WANT[@]} -eq 0 ]]; then
  FILES=("$HERE"/cases/*.json)
else
  for w in "${WANT[@]}"; do
    m=("$HERE"/cases/"$w"*.json)
    [[ -e "${m[0]}" ]] || { echo "no case matches '$w' (try --list)" >&2; exit 2; }
    FILES+=("${m[@]}")
  done
fi

# The connector arm needs the server up. Without a connection the CLI still starts the run, just without
# the tools, and the arm would silently measure the plain plugin. So check /healthz (the MCP URL with its
# trailing /mcp swapped for /healthz) before anything runs or any results dir is created.
if [[ " ${ARMS[*]} " == *" connector "* ]]; then
  command -v curl >/dev/null || { echo "curl not found on PATH (needed for the connector health check)" >&2; exit 1; }
  HEALTH_URL="${CONNECTOR_URL%/}"; HEALTH_URL="${HEALTH_URL%/mcp}/healthz"
  code="$(curl -sS -o /dev/null -m 10 -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)" || code="000"
  if [[ "$code" != "200" ]]; then
    echo "connector arm selected but $HEALTH_URL did not return 200 (got: $([[ "$code" == "000" ]] && echo "no response" || echo "HTTP $code"))." >&2
    echo "Start the connector first:   (cd \"$REPO/connector\" && npm start)   # serves http://127.0.0.1:8787/mcp and /healthz" >&2
    echo "or point CMT_CONNECTOR_URL at another connector /mcp URL, or choose --mode with|without|both." >&2
    exit 1
  fi
fi

TS="$(date +%Y%m%d-%H%M%S)"
[[ -z "$RESULTS_DIR" ]] && RESULTS_DIR="$HERE/results/$TS"
mkdir -p "$RESULTS_DIR"
RESULTS_DIR="$(cd "$RESULTS_DIR" && pwd -P)"   # absolute, so the results/latest symlink resolves
ln -sfn "$RESULTS_DIR" "$HERE/results/latest"
python3 - "$RESULTS_DIR/run-info.$MODE.json" "$MODEL" "${ARMS[*]}" "$(claude --version 2>/dev/null)" "$CONNECTOR_URL" <<'EOF'
import json, sys, datetime
path, model, arms, ver, connector_url = sys.argv[1:6]
info = {"started": datetime.datetime.now().isoformat(timespec="seconds"), "model_alias": model,
        "arms": arms.split(), "claude_version": ver}
if "connector" in info["arms"]:
    info["connector_url"] = connector_url
json.dump(info, open(path, "w"), indent=2)
EOF

casefield() { python3 -c 'import json,sys; v=json.load(open(sys.argv[1]))[sys.argv[2]]; print(v if isinstance(v,str) else "\n".join(v))' "$1" "$2"; }

for f in "${FILES[@]}"; do
  id="$(casefield "$f" id)"
  cdir="$RESULTS_DIR/$id"; mkdir -p "$cdir"
  casefield "$f" prompt > "$cdir/prompt.txt"
  for arm in "${ARMS[@]}"; do
    work="$(mktemp -d "${TMPDIR:-/tmp}/cmt-eval.XXXXXX")"
    while IFS= read -r fx; do cp "$HERE/fixtures/$fx" "$work/"; done < <(casefield "$f" fixtures)
    plugin_args=(); [[ "$arm" == "with" || "$arm" == "connector" ]] && plugin_args=(--plugin "$PLUGIN")
    mcp_args=(); [[ "$arm" == "connector" ]] && mcp_args=(--mcp-url "$CONNECTOR_URL")
    # Per-case date (cases may carry "today": "YYYY-MM-DD"); the default keeps v0.1 cases on 30 Sep 2026.
    EVAL_TODAY="$(python3 -c 'import json,sys,datetime; t=json.load(open(sys.argv[1])).get("today"); print(datetime.date.fromisoformat(t).strftime("%-d %B %Y") if t else "30 September 2026")' "$f")"
    export EVAL_TODAY
    start=$(date +%s)
    "$HERE/iso_claude.sh" --cwd "$work" --model "$MODEL" ${plugin_args[@]+"${plugin_args[@]}"} ${mcp_args[@]+"${mcp_args[@]}"} < "$cdir/prompt.txt" \
      > "$cdir/$arm.stream.jsonl" 2> "$cdir/$arm.stderr.txt"
    rc=$?
    secs=$(( $(date +%s) - start ))
    python3 "$HERE/streamlib.py" result "$cdir/$arm.stream.jsonl" > "$cdir/$arm.json"
    python3 "$HERE/collect.py" "$work" "$cdir/$arm-files" "$HERE/fixtures" > "$cdir/$arm.files.txt"
    [[ -s "$cdir/$arm.stderr.txt" ]] || rm -f "$cdir/$arm.stderr.txt"
    rm -rf "$work"
    info="$(python3 - "$cdir/$arm.json" "$cdir/$arm.stream.jsonl" "$HERE" "$arm" <<'EOF'
import json, sys
sys.path.insert(0, sys.argv[3])
import streamlib
r = json.load(open(sys.argv[1]))
ev = streamlib.load(sys.argv[2])
sk = streamlib.skills_invoked(ev)
conn = "  connector=%s" % streamlib.connector_summary(ev) if sys.argv[4] == "connector" else ""  # tools called, or NOT CONNECTED
print("cost=$%.3f turns=%s skills=%s%s%s" % (r.get("total_cost_usd") or 0, r.get("num_turns"), ",".join(sk) or "none", conn,
      "  ERROR: " + str(r.get("error") or r.get("subtype")) if r.get("is_error") else ""))
EOF
)"
    printf '%-34s %-8s %4ss rc=%s %s\n' "$id" "$arm" "$secs" "$rc" "$info"
  done
done
echo "RESULTS_DIR=$RESULTS_DIR"
