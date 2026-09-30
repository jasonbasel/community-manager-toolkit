#!/usr/bin/env bash
# Render assets-src/logo.svg -> plugin/assets/logo.png (1024px) and assets-src/icon.svg -> plugin/assets/icon.png (512px),
# then copy both into docs/assets/.
# macOS only, no installs: qlmanage (QuickLook) rasterises the SVG, then a pure-Python pass makes the
# logo's rounded corners transparent (QuickLook flattens onto white).
#   bash assets-src/render.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/../plugin/assets"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/cmt-assets.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

qlmanage -t -s 1024 -o "$TMP" "$HERE/logo.svg" >/dev/null 2>&1
qlmanage -t -s 512 -o "$TMP" "$HERE/icon.svg" >/dev/null 2>&1
cp "$TMP/icon.svg.png" "$OUT/icon.png"   # full-bleed square: no transparency needed

python3 - "$TMP/logo.svg.png" "$OUT/logo.png" <<'PY'
import struct
import sys
import zlib

src, dst = sys.argv[1:3]
b = open(src, "rb").read()
i, idat = 8, b""
while i < len(b):
    (ln,) = struct.unpack(">I", b[i:i + 4])
    t, d = b[i + 4:i + 8], b[i + 8:i + 8 + ln]
    if t == b"IHDR":
        w, h, bd, ct, _, _, il = struct.unpack(">IIBBBBB", d)
    if t == b"IDAT":
        idat += d
    i += 12 + ln
assert bd == 8 and ct == 6 and il == 0 and w == h, "unexpected PNG layout from QuickLook"
raw = zlib.decompress(idat)
bpp, stride = 4, w * 4
rows, prev, p = [], bytearray(stride), 0
for _y in range(h):
    ft, line = raw[p], bytearray(raw[p + 1:p + 1 + stride])
    p += 1 + stride
    for x in range(stride):
        a = line[x - bpp] if x >= bpp else 0
        up = prev[x]
        c = prev[x - bpp] if x >= bpp else 0
        if ft == 1:
            line[x] = (line[x] + a) & 255
        elif ft == 2:
            line[x] = (line[x] + up) & 255
        elif ft == 3:
            line[x] = (line[x] + ((a + up) >> 1)) & 255
        elif ft == 4:
            pa, pb, pc = abs(up - c), abs(a - c), abs(a + up - 2 * c)
            line[x] = (line[x] + (a if pa <= pb and pa <= pc else (up if pb <= pc else c))) & 255
    rows.append(line)
    prev = line

R = 230.0 * w / 1024.0  # corner radius = rx in logo.svg
SS = 4                  # supersampling for edge coverage
NAVY = (27, 36, 64)     # logo background colour, used for partially covered edge pixels


def inside(px, py):
    cx, cy = min(max(px, R), w - R), min(max(py, R), h - R)
    return (px - cx) ** 2 + (py - cy) ** 2 <= R * R


for y in range(h):
    if R <= y < h - R:
        continue
    for x in range(w):
        if R <= x < w - R:
            continue
        cov = sum(inside(x + (sx + .5) / SS, y + (sy + .5) / SS) for sx in range(SS) for sy in range(SS)) / (SS * SS)
        if cov >= 1.0:
            continue
        rows[y][x * 4:x * 4 + 4] = b"\0\0\0\0" if cov <= 0 else bytes((*NAVY, int(round(cov * 255))))

body = b"".join(b"\0" + bytes(r) for r in rows)


def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)


open(dst, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                      + chunk(b"IDAT", zlib.compress(body, 9)) + chunk(b"IEND", b""))
PY
# GitHub Pages serves docs/ only, so keep a copy of the PNGs there for the site header, favicon and social image
mkdir -p "$HERE/../docs/assets"
cp "$OUT/logo.png" "$OUT/icon.png" "$HERE/../docs/assets/"
sips -g pixelWidth -g pixelHeight "$OUT/logo.png" "$OUT/icon.png"
