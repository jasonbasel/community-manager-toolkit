#!/usr/bin/env bash
# Validate the plugin and lint it for cross-platform portability (DESIGN.md section 7).
#
#   bash scripts/check.sh
#
# Sections:
#   1. claude plugin validate plugin/        (Claude Code's own manifest validator; needs the claude CLI)
#   2. portability lint on plugin/           (rules listed in the python block below)
#   3. eval fixtures still match DESIGN 9    (evals/fixtures/verify_fixtures.py)
# Exits 1 if any section fails, with one message per problem.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0

echo "== 1. claude plugin validate plugin/"
if command -v claude >/dev/null 2>&1; then
  # Local CLI 2.1.139 predates the documented `displayName` key (Anthropic's own directory
  # plugins use it), so validate a copy with that one key stripped. The directory portal's
  # Validate step is the authoritative check for the real manifest.
  VTMP="$(mktemp -d)"
  cp -R "$ROOT/plugin" "$VTMP/plugin"
  python3 -c "import json,sys;p=sys.argv[1];d=json.load(open(p));d.pop('displayName',None);open(p,'w').write(json.dumps(d,indent=2))" "$VTMP/plugin/.claude-plugin/plugin.json"
  if ! claude plugin validate "$VTMP/plugin"; then
    echo "FAIL: claude plugin validate rejected plugin/ (output above)"
    FAIL=1
  else
    echo "PASS: claude plugin validate (displayName stripped for the local CLI)"
  fi
  rm -rf "$VTMP"
else
  echo "FAIL: claude CLI not found on PATH, cannot run 'claude plugin validate'"
  FAIL=1
fi

echo
echo "== 2. portability lint (plugin/)"
python3 - "$ROOT" <<'PY' || FAIL=1
import json
import os
import re
import struct
import sys
from pathlib import Path

root = Path(sys.argv[1])
plugin = root / "plugin"
skills_dir = plugin / "skills"
EXPECTED_SKILLS = ["getting-started", "member-directory", "weekly-community-review",
                   "event-matchmaking", "member-introductions", "community-impact-report",
                   "new-member-onboarding", "member-re-engagement"]
FORBIDDEN = re.compile(r"claude|chatgpt|openai|anthropic|~~", re.I)
MAX_FILE = 256 * 1024
results = []  # (rule, [problems])


def rule(name, problems):
    results.append((name, problems))


def all_files(base):
    for dirpath, _dirs, files in os.walk(base):
        for f in files:
            yield Path(dirpath) / f


def rel(p):
    return str(p.relative_to(root))


def is_binary(p):
    try:
        return b"\0" in p.read_bytes()[:8192]
    except OSError:
        return False


def parse_frontmatter(text):
    m = re.match(r"---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)(.*)", text, re.S)
    if not m:
        return None, text
    raw, body = m.group(1), m.group(2)
    keys, cur = {}, None
    for line in raw.splitlines():
        km = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if km and not line.startswith((" ", "\t")):
            cur = km.group(1)
            keys[cur] = km.group(2)
        elif cur is not None:
            keys[cur] += " " + line.strip()
    norm = {}
    for k, v in keys.items():
        v = v.strip()
        v = re.sub(r"^[>|][+-]?\s*", "", v)
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
            v = v.replace('\\"', '"').replace("\\n", " ")
        norm[k] = re.sub(r"\s+", " ", v).strip()
    return norm, body


# ---- plugin identity
plugin_name = "community-manager-toolkit"
cj = plugin / ".claude-plugin" / "plugin.json"
if cj.is_file():
    try:
        plugin_name = json.loads(cj.read_text()).get("name", plugin_name)
    except json.JSONDecodeError:
        pass

# ---- JSON parses
bad = []
json_files = [p for p in all_files(plugin) if p.suffix == ".json"]
for p in json_files:
    try:
        json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        bad.append("%s: %s" % (rel(p), e))
for needed in (".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".mcp.json"):
    if not (plugin / needed).is_file():
        bad.append("plugin/%s is missing" % needed)
rule("every JSON file parses (and the three manifests exist)", bad)

# ---- skills exist
missing = ["plugin/skills/%s/SKILL.md is missing" % s for s in EXPECTED_SKILLS if not (skills_dir / s / "SKILL.md").is_file()]
extra = ["plugin/skills/%s has no SKILL.md" % d.name for d in sorted(skills_dir.glob("*")) if d.is_dir() and not (d / "SKILL.md").is_file()] if skills_dir.is_dir() else []
rule("all eight skills present", missing + extra)

# ---- per-skill front matter / size / naming
fm_problems, desc_problems, words_problems, name_problems = [], [], [], []
for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
    d = skill_md.parent.name
    fm, body = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
    if fm is None:
        fm_problems.append("%s: no YAML front matter" % rel(skill_md))
        continue
    extra_keys = sorted(set(fm) - {"name", "description"})
    if extra_keys:
        fm_problems.append("%s: front matter has extra keys %s (only name and description allowed)" % (rel(skill_md), extra_keys))
    for k in ("name", "description"):
        if not fm.get(k):
            fm_problems.append("%s: front matter is missing '%s'" % (rel(skill_md), k))
    desc = fm.get("description", "")
    if len(desc) > 1024:
        desc_problems.append("%s: description is %d chars (max 1,024)" % (rel(skill_md), len(desc)))
    n_words = len(body.split())
    if n_words > 1500:
        words_problems.append("%s: body is %d words (max 1,500)" % (rel(skill_md), n_words))
    if fm.get("name") and fm["name"] != d:
        name_problems.append("%s: name '%s' does not match folder '%s'" % (rel(skill_md), fm["name"], d))
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", d):
        name_problems.append("skill folder '%s' is not kebab-case" % d)
    prefixed = "%s:%s" % (plugin_name, d)
    if len(prefixed) > 64:
        name_problems.append("'%s' is %d chars (max 64)" % (prefixed, len(prefixed)))
rule("front matter has only name + description", fm_problems)
rule("description <= 1,024 characters", desc_problems)
rule("SKILL.md body <= 1,500 words", words_problems)
rule("skill names match folders; '%s:<skill>' <= 64 chars" % plugin_name, name_problems)

# ---- forbidden vendor words / placeholders in skill text
hits = []
for p in sorted(all_files(skills_dir)) if skills_dir.is_dir() else []:
    if is_binary(p):
        continue
    for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        m = FORBIDDEN.search(line)
        if m:
            hits.append("%s:%d contains '%s': %s" % (rel(p), i, m.group(0), line.strip()[:90]))
rule("no claude / chatgpt / openai / anthropic / ~~ in plugin/skills", hits)

# ---- file size, binaries, .DS_Store
big, binaries, ds = [], [], []
for p in all_files(plugin):
    if p.name == ".DS_Store":
        ds.append(rel(p))
    if p.stat().st_size > MAX_FILE:
        big.append("%s is %d KiB (max 256)" % (rel(p), p.stat().st_size // 1024))
    if p.suffix.lower() != ".png" and is_binary(p):
        binaries.append("%s looks binary (only PNG assets may be binary)" % rel(p))
rule("no file over 256 KiB", big)
rule("no binaries except PNG assets", binaries)
rule("no .DS_Store in plugin/", ds)

# ---- codex manifest limits
cp = plugin / ".codex-plugin" / "plugin.json"
cprobs = []
if cp.is_file():
    try:
        c = json.loads(cp.read_text(encoding="utf-8"))
        iface = c.get("interface", {})
        for k in ("displayName", "shortDescription"):
            v = iface.get(k)
            if not v:
                cprobs.append("interface.%s is missing" % k)
            elif len(v) > 30:
                cprobs.append("interface.%s is %d chars (max 30): %r" % (k, len(v), v))
        prompts = iface.get("defaultPrompt", [])
        if len(prompts) > 3:
            cprobs.append("interface.defaultPrompt has %d entries (max 3)" % len(prompts))
        for pr in prompts:
            if len(pr) > 128:
                cprobs.append("a defaultPrompt is %d chars (max 128): %r" % (len(pr), pr[:40]))
        for k in ("logo", "composerIcon"):
            v = iface.get(k)
            if v and not (plugin / v).is_file():
                cprobs.append("interface.%s points to %s which does not exist" % (k, v))
        if c.get("skills") and not (plugin / c["skills"]).is_dir():
            cprobs.append("skills path %s does not exist" % c["skills"])
    except (json.JSONDecodeError, UnicodeDecodeError):
        cprobs.append("plugin/.codex-plugin/plugin.json does not parse")
rule(".codex-plugin: displayName <= 30, shortDescription <= 30, defaultPrompt <= 3 x 128, referenced files exist", cprobs)

# ---- assets
aprobs = []
for n in ("logo.png", "icon.png"):
    p = plugin / "assets" / n
    if not p.is_file():
        aprobs.append("plugin/assets/%s is missing" % n)
        continue
    b = p.read_bytes()
    if b[:8] != b"\x89PNG\r\n\x1a\n":
        aprobs.append("plugin/assets/%s is not a PNG" % n)
        continue
    w, h = struct.unpack(">II", b[16:24])
    if w != h or w < 512:
        aprobs.append("plugin/assets/%s is %dx%d (must be square and at least 512px)" % (n, w, h))
rule("assets/logo.png and icon.png are square PNGs >= 512px", aprobs)

# ---- listing README
rp = plugin / "README.md"
rprobs = []
if not rp.is_file():
    rprobs.append("plugin/README.md is missing")
elif len(rp.read_text(encoding="utf-8").split()) < 40:
    rprobs.append("plugin/README.md has fewer than 40 words")
rule("plugin/README.md exists and has >= 40 words", rprobs)

failed = 0
for name, problems in results:
    if problems:
        failed += 1
        print("FAIL: %s" % name)
        for pr in problems:
            print("    - %s" % pr)
    else:
        print("PASS: %s" % name)
print("\nportability lint: %d rule(s) failed of %d" % (failed, len(results)))
sys.exit(1 if failed else 0)
PY

echo
echo "== 3. eval fixtures match DESIGN section 9"
VF="$(mktemp "${TMPDIR:-/tmp}/cmt-verify-fixtures.XXXXXX")"
if python3 "$ROOT/evals/fixtures/verify_fixtures.py" >"$VF" 2>&1; then
  tail -1 "$VF"
  echo "PASS: fixtures"
else
  grep '^FAIL' "$VF" || cat "$VF"
  echo "FAIL: fixtures do not match DESIGN section 9"
  FAIL=1
fi
rm -f "$VF"

echo
if [[ $FAIL -ne 0 ]]; then
  echo "CHECK FAILED"
  exit 1
fi
echo "ALL CHECKS PASSED"
