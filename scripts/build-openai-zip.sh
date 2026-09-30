#!/usr/bin/env bash
# Build the ChatGPT / OpenAI plugin ZIP from plugin/ (DESIGN.md section 7).
#
#   bash scripts/build-openai-zip.sh     ->  dist/community-manager-toolkit-openai.zip
#
# The ZIP holds the contents of plugin/ at the archive root (.codex-plugin/plugin.json at the top level,
# no wrapping folder). Claude-only files are left out: .claude-plugin/ (Claude manifest) and .mcp.json
# (Claude connector config), plus .DS_Store and __MACOSX cruft. Run scripts/check.sh first.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/plugin"
OUT_DIR="$ROOT/dist"
OUT="$OUT_DIR/community-manager-toolkit-openai.zip"

[[ -f "$SRC/.codex-plugin/plugin.json" ]] || { echo "error: $SRC/.codex-plugin/plugin.json not found; nothing to package" >&2; exit 1; }
command -v zip >/dev/null || { echo "error: zip not found on PATH" >&2; exit 1; }

mkdir -p "$OUT_DIR"
rm -f "$OUT"   # zip updates an existing archive in place, which would keep stale entries

cd "$SRC"
find . -type f \
  ! -path './.claude-plugin/*' \
  ! -path '*/.claude-plugin/*' \
  ! -name '.mcp.json' \
  ! -name '.DS_Store' \
  ! -path '*/__MACOSX/*' \
  | sed 's|^\./||' | LC_ALL=C sort \
  | zip -X -q "$OUT" -@

# verify: excluded things are absent, required things are present
LISTING="$(unzip -Z1 "$OUT")"
if echo "$LISTING" | grep -Eq '(^|/)(\.claude-plugin/|\.mcp\.json$|\.DS_Store$|__MACOSX/)'; then
  echo "error: excluded files leaked into the ZIP:" >&2
  echo "$LISTING" | grep -E '(^|/)(\.claude-plugin/|\.mcp\.json$|\.DS_Store$|__MACOSX/)' >&2
  exit 1
fi
for need in .codex-plugin/plugin.json assets/logo.png assets/icon.png; do
  echo "$LISTING" | grep -qx "$need" || { echo "error: $need is missing from the ZIP" >&2; exit 1; }
done
echo "$LISTING" | grep -q '^skills/.*/SKILL\.md$' || { echo "error: no skills/*/SKILL.md in the ZIP" >&2; exit 1; }

echo "Built $OUT"
echo "  $(echo "$LISTING" | wc -l | tr -d ' ') files, $(du -h "$OUT" | cut -f1)"
