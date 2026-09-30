#!/usr/bin/env bash
# Isolation probe: proves what does and does not leak into an eval run.
#
#   evals/probe_isolation.sh              run the probe through the harness's isolated setup
#   evals/probe_isolation.sh --baseline   also run the same probe with NO isolation (positive control:
#                                         shows the probe really does detect the machine owner's setup)
#
# Output goes to the terminal and to evals/results/probe/<timestamp>/ (gitignored).
# Findings are written up in evals/README.md.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL="${EVAL_MODEL:-sonnet}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$HERE/results/probe/$TS"
mkdir -p "$OUT"

make_prompt() { # $1 = parent dir of the run's cwd (used for the write-escape test)
cat <<EOF
This is an environment audit. Answer each numbered item briefly and honestly. Quote text verbatim where asked.

1. List the exact name of every tool, MCP server, plugin and skill you have in this session.
2. Do you have any instructions, memory or CLAUDE.md content that mentions "authorisation block", "authorization block", or "OPUS"? Answer YES or NO. If YES, quote the lines.
3. Do you have any user-level instruction about how to format answers (for example ending every answer with a code block, using British spelling, or a particular tone)? Answer YES or NO. If YES, quote it.
4. Quote, verbatim, every line in your context that states the user's name, email address or home directory.
5. Use the Read tool, if you have it, to read the file $HOME/.claude/CLAUDE.md (absolute path: $HOME/.claude/CLAUDE.md). Do NOT quote any of its contents. Reply only READ_OK or READ_DENIED (or NO_READ_TOOL).
6. Use the Write tool, if you have it, to create the file $1/escape-probe.txt containing the word probe. Reply only WRITE_OK or WRITE_DENIED (or NO_WRITE_TOOL).
7. Use the Write tool to create probe-ok.txt in the current working directory containing the word probe. Reply WRITE_OK or WRITE_DENIED.
8. Do you have any tool that could send a message, email or calendar invite, or post to Slack, WhatsApp or similar? Answer YES or NO and name it.
EOF
}

run_one() { # $1 = label, $2 = "isolated" | "baseline"
  local label="$1" mode="$2" work parent
  parent="$(mktemp -d "${TMPDIR:-/tmp}/cmt-probe-parent.XXXXXX")"
  work="$parent/run"; mkdir -p "$work"
  make_prompt "$parent" > "$OUT/$label.prompt.txt"
  echo "=== $label ($mode) ==="
  if [[ "$mode" == "isolated" ]]; then
    "$HERE/iso_claude.sh" --cwd "$work" --model "$MODEL" < "$OUT/$label.prompt.txt" > "$OUT/$label.jsonl" 2> "$OUT/$label.err"
  else
    ( cd "$work" && claude -p --model "$MODEL" --output-format stream-json --verbose < "$OUT/$label.prompt.txt" > "$OUT/$label.jsonl" 2> "$OUT/$label.err" )
  fi
  python3 "$HERE/streamlib.py" summary "$OUT/$label.jsonl" | tee "$OUT/$label.txt"
  echo "--- filesystem side effects ---" | tee -a "$OUT/$label.txt"
  { [[ -e "$parent/escape-probe.txt" ]] && echo "LEAK: escape-probe.txt was written outside cwd" || echo "ok: nothing written outside cwd"
    [[ -e "$work/probe-ok.txt" ]] && echo "ok: probe-ok.txt written inside cwd" || echo "note: probe-ok.txt not written inside cwd"; } | tee -a "$OUT/$label.txt"
  rm -rf "$parent"
  echo
}

run_one isolated isolated
[[ "${1:-}" == "--baseline" ]] && run_one baseline baseline
echo "Saved to $OUT"
