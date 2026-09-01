#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: embed-fonts.sh <dir> [--family NAME] [--weights 400,700] [--no-italic]"
  echo "  emits base64 @font-face rules on stdout; family/weight/style inferred from filenames"
}

DIR=""; FAMILY=""; WEIGHTS=""; NO_ITALIC=0
while [ $# -gt 0 ]; do
  case "$1" in
    --family)    FAMILY="${2:-}"; shift 2 ;;
    --weights)   WEIGHTS="${2:-}"; shift 2 ;;
    --no-italic) NO_ITALIC=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           DIR="$1"; shift ;;
  esac
done

[ -n "$DIR" ] || { usage >&2; exit 2; }
[ -d "$DIR" ] || { echo "not a directory: $DIR" >&2; exit 2; }

files=$(find "$DIR" -maxdepth 1 -type f \( -iname '*.otf' -o -iname '*.ttf' -o -iname '*.woff' -o -iname '*.woff2' \) | sort)
[ -n "$files" ] || { echo "no font files (otf/ttf/woff/woff2) in $DIR" >&2; exit 1; }

weight_of() {
  case "$1" in
    *Thin*)                      echo 100 ;;
    *ExtraLight*|*UltraLight*)   echo 200 ;;
    *Light*)                     echo 300 ;;
    *Regular*|*Book*|*Normal*)   echo 400 ;;
    *Medium*)                    echo 500 ;;
    *SemiBold*|*DemiBold*)       echo 600 ;;
    *ExtraBold*|*UltraBold*)     echo 800 ;;
    *Black*|*Heavy*)             echo 900 ;;
    *Bold*)                      echo 700 ;;
    *)                           echo 400 ;;
  esac
}

format_of() {
  case "$1" in
    *.otf|*.OTF)     echo opentype ;;
    *.ttf|*.TTF)     echo truetype ;;
    *.woff2|*.WOFF2) echo woff2 ;;
    *.woff|*.WOFF)   echo woff ;;
  esac
}

mime_of() {
  case "$1" in
    woff2) echo font/woff2 ;;
    woff)  echo font/woff ;;
    *)     echo font/otf ;;
  esac
}

# A renamed non-font base64s cleanly and then silently falls back in the browser.
sniff_ok() {
  sig=$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')
  case "$sig" in
    4f54544f|00010000|74727565|774f4646|774f4632) return 0 ;;
    *) return 1 ;;
  esac
}

total=0; emitted=0; skipped=0

for f in $files; do
  base=$(basename "$f"); stem="${base%.*}"
  variant="${stem##*-}"; [ "$variant" = "$stem" ] && variant="Regular"
  raw_family="${stem%-*}"

  if [ -n "$FAMILY" ]; then
    family="$FAMILY"
  else
    family=$(printf '%s' "$raw_family" \
      | sed -e 's/\([A-Z]\)\([A-Z][a-z]\)/\1 \2/g' -e 's/\([a-z0-9]\)\([A-Z]\)/\1 \2/g' -e 's/_/ /g')
  fi

  weight=$(weight_of "$variant")
  style=normal
  case "$variant" in *Italic*|*Oblique*) style=italic ;; esac

  if [ "$NO_ITALIC" -eq 1 ] && [ "$style" = italic ]; then continue; fi
  if [ -n "$WEIGHTS" ] && ! printf '%s' ",$WEIGHTS," | grep -q ",$weight,"; then continue; fi

  if ! sniff_ok "$f"; then
    echo "skip (not a font file): $base" >&2; skipped=$((skipped + 1)); continue
  fi

  fmt=$(format_of "$base"); mime=$(mime_of "$fmt")
  bytes=$(wc -c < "$f" | tr -d ' ')
  total=$((total + bytes))

  printf "@font-face{font-family:'%s';font-weight:%s;font-style:%s;font-display:swap;src:url(data:%s;base64," \
    "$family" "$weight" "$style" "$mime"
  base64 < "$f" | tr -d '\n'
  printf ") format('%s');}\n" "$fmt"
  emitted=$((emitted + 1))
done

# An empty block would only reveal itself in the browser, long after publishing.
[ "$emitted" -gt 0 ] || { echo "no faces emitted from $DIR (filters too narrow, or none were real fonts)" >&2; exit 1; }

b64=$((total * 4 / 3))
echo "embedded $emitted face(s), $((total / 1024))KB raw, about $((b64 / 1024))KB as base64" >&2
[ "$skipped" -eq 0 ] || echo "skipped $skipped file(s) that were not fonts" >&2
[ "$b64" -lt 4000000 ] || echo "WARNING: over 4MB in fonts alone; the whole page must stay under 16MB" >&2
