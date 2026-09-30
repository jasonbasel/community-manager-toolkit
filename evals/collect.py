#!/usr/bin/env python3
"""Copy files an eval run created or changed out of its temp work dir.

usage: collect.py WORKDIR OUTDIR FIXTURE_DIR
Anything in WORKDIR that is not byte-identical to a file of the same name in FIXTURE_DIR
is copied to OUTDIR, keeping relative paths. Prints the relative paths copied.
"""
import hashlib
import shutil
import sys
from pathlib import Path


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    work, out, fixtures = (Path(a) for a in sys.argv[1:4])
    copied = []
    for p in sorted(work.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(work)
        if rel.name == ".DS_Store":
            continue
        orig = fixtures / rel
        if orig.is_file() and digest(orig) == digest(p):
            continue
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)
        copied.append(str(rel))
    print("\n".join(copied))


if __name__ == "__main__":
    main()
