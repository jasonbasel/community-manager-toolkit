#!/usr/bin/env bash
# Grade an eval run: deterministic regex checks + LLM judge (opus, isolated) per rubric item.
#
#   evals/grade.sh                      grade the latest run in evals/results/
#   evals/grade.sh evals/results/<ts>   grade a specific run
#   evals/grade.sh <dir> mi-02 --no-judge     extra args go to grade.py (case-id prefixes, --no-judge, --jobs N, --judge-model M)
#
# Writes <run dir>/summary.md (table: case, with-score, without-score, failed items) and grades.json.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="${1:-$HERE/results/latest}"
[[ $# -gt 0 ]] && shift
[[ -d "$DIR" ]] || { echo "results dir not found: $DIR (run evals/run.sh first)" >&2; exit 1; }
exec python3 "$HERE/grade.py" "$DIR" "$@"
