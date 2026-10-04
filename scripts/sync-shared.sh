#!/usr/bin/env bash
# Copy the single-source reference files in shared/ into each skill's references/.
#
# Skills must be self-contained (they are uploaded one at a time on some surfaces), so
# every skill ships its own copy. Edit files in shared/, never in plugin/skills/*/references/,
# then run this script.
#
# Usage:
#   scripts/sync-shared.sh           copy changed files, remove stale shared copies
#   scripts/sync-shared.sh --check   change nothing; exit 1 if any copy is out of date
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED="$ROOT/shared"
SKILLS="$ROOT/plugin/skills"

CHECK=0
if [ "${1:-}" = "--check" ]; then
  CHECK=1
elif [ -n "${1:-}" ]; then
  echo "usage: $0 [--check]" >&2
  exit 2
fi

# Which shared files each skill needs. Every skill gets all seven: the shared files point to
# each other (guardrails.md and community-profile.md cite message-craft.md and ledger.md;
# data-sources.md cites community-profile.md and platform-guide.md), so a partial set
# would leave a skill with dangling references.
files_for() {
  case "$1" in
    getting-started|member-directory|weekly-community-review|event-matchmaking|member-introductions|community-impact-report|new-member-onboarding|member-re-engagement)
      echo "guardrails.md data-sources.md community-profile.md platform-guide.md ledger.md message-craft.md connector-tools.md" ;;
    *)
      return 1 ;;
  esac
}

SKILL_NAMES="getting-started member-directory weekly-community-review event-matchmaking member-introductions community-impact-report new-member-onboarding member-re-engagement"

# Fail loudly if a skill folder exists that this script doesn't know about.
for dir in "$SKILLS"/*/; do
  name="$(basename "$dir")"
  if ! files_for "$name" >/dev/null; then
    echo "error: skill '$name' has no entry in files_for() in $0" >&2
    exit 1
  fi
done

changed=0
for skill in $SKILL_NAMES; do
  dest="$SKILLS/$skill/references"
  if [ ! -f "$SKILLS/$skill/SKILL.md" ]; then
    echo "error: $SKILLS/$skill/SKILL.md not found" >&2
    exit 1
  fi
  wanted="$(files_for "$skill")"

  for f in $wanted; do
    src="$SHARED/$f"
    if [ ! -f "$src" ]; then
      echo "error: $src not found" >&2
      exit 1
    fi
    if [ -f "$dest/$f" ] && cmp -s "$src" "$dest/$f"; then
      continue
    fi
    changed=1
    if [ "$CHECK" -eq 1 ]; then
      echo "out of date: $skill/references/$f"
    else
      mkdir -p "$dest"
      cp "$src" "$dest/$f"
      echo "updated: $skill/references/$f"
    fi
  done

  # Remove copies of shared files this skill no longer needs. Files in references/ that
  # don't exist in shared/ are skill-specific and left alone.
  for src in "$SHARED"/*.md; do
    f="$(basename "$src")"
    case " $wanted " in *" $f "*) continue ;; esac
    if [ -f "$dest/$f" ]; then
      changed=1
      if [ "$CHECK" -eq 1 ]; then
        echo "stale: $skill/references/$f"
      else
        rm "$dest/$f"
        echo "removed: $skill/references/$f"
      fi
    fi
  done
done

if [ "$changed" -eq 0 ]; then
  echo "all references up to date"
elif [ "$CHECK" -eq 1 ]; then
  echo "run scripts/sync-shared.sh to fix" >&2
  exit 1
fi
