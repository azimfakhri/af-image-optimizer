#!/bin/sh
# Builds test fixtures from macOS system wallpapers (needs macOS sips + python3; cwebp optional).
set -e
SRC="/System/Library/Wallpapers/.default/DefaultAerial.jpg"
HEIC="/System/Library/Desktop Pictures/.wallpapers/Sonoma Horizon/Sonoma Horizon.heic"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/tests/fixtures"
TOOLS="$ROOT/scripts/fixture-tools.py"
mkdir -p "$OUT" && cd "$OUT"

sips -s format jpeg -s formatOptions 95 --resampleHeightWidth 4000 6000 "$SRC" --out camera-24mp.jpg >/dev/null
sips -s format png --resampleWidth 1800 "$SRC" --out photo.png >/dev/null
sips -s format jpeg -s formatOptions 90 --resampleWidth 1600 "$SRC" --out landscape.jpg >/dev/null
# Pixels stored rotated 90° CW with EXIF orientation 8, so it should display as the original landscape.
sips -r 90 landscape.jpg --out rotated-exif.jpg >/dev/null
python3 "$TOOLS" orient rotated-exif.jpg 8
cp landscape.jpg photo.jfif
cp landscape.jpg jpeg-renamed.png
python3 "$TOOLS" logo logo-transparent.png
sips -s format png --resampleWidth 600 "$SRC" --out small.png >/dev/null
if command -v cwebp >/dev/null; then cwebp -quiet -q 70 -m 6 small.png -o already-small.webp; fi
rm small.png
{ printf '\377\330\377\340'; head -c 20000 /dev/urandom; } > corrupt.jpg
cp "$HEIC" iphone.heic
ls -la
