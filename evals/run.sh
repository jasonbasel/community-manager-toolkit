#!/usr/bin/env bash
# Run eval cases through the local `claude` CLI, with and without the plugin.
#
#   evals/run.sh                        every case, both arms
#   evals/run.sh em-01 mi-02            only cases whose id starts with em-01 / mi-02
#   evals/run.sh --mode without mi-02   one arm only (with | without | both)
#   evals/run.sh --list                 list case ids
#
# Options: --mode M  --model M (default $EVAL_MODEL or sonnet)  --results-dir DIR (reuse a run dir)
#
# Each arm gets a fresh temp dir under $TMPDIR containing only the case's fixture files, and the
# isolation in evals/iso_claude.sh (no user settings/CLAUDE.md/hooks/plugins/connectors, file tools only).
# Output: evals/results/<timestamp>/<case>/{with,without}.json (final result event), *.stream.jsonl
# (full transcript incl. tool calls), {with,without}-files/ (files the run wrote), prompt.txt.
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
    -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) WANT+=("$1"); shift ;;
  esac
done
[[ "$MODE" =~ ^(both|with|without)$ ]] || { echo "--mode must be both, with or without" >&2; exit 2; }
command -v claude >/dev/null || { echo "claude CLI not found on PATH" >&2; exit 1; }

plugin_ready() { compgen -G "$PLUGIN/skills/*/SKILL.md" >/dev/null; }
ARMS=()
[[ "$MODE" != "without" ]] && ARMS+=(with)
[[ "$MODE" != "with" ]] && ARMS+=(without)
if [[ " ${ARMS[*]} " == *" with "* ]] && ! plugin_ready; then
  if [[ "$MODE" == "with" ]]; then echo "plugin has no skills yet ($PLUGIN/skills/*/SKILL.md): nothing to run" >&2; exit 1; fi
  echo "note: $PLUGIN/skills has no SKILL.md files yet; skipping the 'with' arm" >&2
  ARMS=(without)
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

TS="$(date +%Y%m%d-%H%M%S)"
[[ -z "$RESULTS_DIR" ]] && RESULTS_DIR="$HERE/results/$TS"
mkdir -p "$RESULTS_DIR"
RESULTS_DIR="$(cd "$RESULTS_DIR" && pwd -P)"   # absolute, so the results/latest symlink resolves
ln -sfn "$RESULTS_DIR" "$HERE/results/latest"
python3 - "$RESULTS_DIR/run-info.json" "$MODEL" "${ARMS[*]}" "$(claude --version 2>/dev/null)" <<'EOF'
import json, sys, datetime
path, model, arms, ver = sys.argv[1:5]
json.dump({"started": datetime.datetime.now().isoformat(timespec="seconds"), "model_alias": model,
           "arms": arms.split(), "claude_version": ver}, open(path, "w"), indent=2)
EOF

casefield() { python3 -c 'import json,sys; v=json.load(open(sys.argv[1]))[sys.argv[2]]; print(v if isinstance(v,str) else "\n".join(v))' "$1" "$2"; }

for f in "${FILES[@]}"; do
  id="$(casefield "$f" id)"
  cdir="$RESULTS_DIR/$id"; mkdir -p "$cdir"
  casefield "$f" prompt > "$cdir/prompt.txt"
  for arm in "${ARMS[@]}"; do
    work="$(mktemp -d "${TMPDIR:-/tmp}/cmt-eval.XXXXXX")"
    while IFS= read -r fx; do cp "$HERE/fixtures/$fx" "$work/"; done < <(casefield "$f" fixtures)
    plugin_args=(); [[ "$arm" == "with" ]] && plugin_args=(--plugin "$PLUGIN")
    start=$(date +%s)
    "$HERE/iso_claude.sh" --cwd "$work" --model "$MODEL" ${plugin_args[@]+"${plugin_args[@]}"} < "$cdir/prompt.txt" \
      > "$cdir/$arm.stream.jsonl" 2> "$cdir/$arm.stderr.txt"
    rc=$?
    secs=$(( $(date +%s) - start ))
    python3 "$HERE/streamlib.py" result "$cdir/$arm.stream.jsonl" > "$cdir/$arm.json"
    python3 "$HERE/collect.py" "$work" "$cdir/$arm-files" "$HERE/fixtures" > "$cdir/$arm.files.txt"
    [[ -s "$cdir/$arm.stderr.txt" ]] || rm -f "$cdir/$arm.stderr.txt"
    rm -rf "$work"
    info="$(python3 - "$cdir/$arm.json" "$cdir/$arm.stream.jsonl" "$HERE" <<'EOF'
import json, sys
sys.path.insert(0, sys.argv[3])
import streamlib
r = json.load(open(sys.argv[1]))
ev = streamlib.load(sys.argv[2])
sk = streamlib.skills_invoked(ev)
print("cost=$%.3f turns=%s skills=%s%s" % (r.get("total_cost_usd") or 0, r.get("num_turns"), ",".join(sk) or "none",
      "  ERROR: " + str(r.get("error") or r.get("subtype")) if r.get("is_error") else ""))
EOF
)"
    printf '%-34s %-8s %4ss rc=%s %s\n' "$id" "$arm" "$secs" "$rc" "$info"
  done
done
echo "RESULTS_DIR=$RESULTS_DIR"
