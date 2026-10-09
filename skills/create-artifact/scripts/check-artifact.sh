#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: check-artifact.sh [--target a|b|s] <file...>"
  echo "  b (default) published artifact · a in-repo lab · s local standalone showpiece"
}

TARGET=b
files=""
case $0 in */*) here=${0%/*} ;; *) here=. ;; esac
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-b}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) files="$files $1"; shift ;;
  esac
done

[ -n "$files" ] || { usage >&2; exit 2; }

fail=0

for f in $files; do
  [ -f "$f" ] || { echo "not a file: $f"; fail=1; continue; }
  echo "checking $f (target $TARGET)"
  hit=0

  # comments discuss these rules and the review layer is injected tooling; newlines keep numbering
  clean=$(perl -0777 -pe 's{<!-- rv:start -->.*?<!-- rv:end -->}{"\n" x ($&=~tr/\n//)}ges;
                          s{<!--.*?-->}{"\n" x ($&=~tr/\n//)}ges;
                          s{/\*.*?\*/}{"\n" x ($&=~tr/\n//)}ges' "$f")
  scan() { printf '%s\n' "$clean" | grep "$@" || true; }

  report() {
    [ -n "$2" ] || return 0
    hit=1
    echo "  [$1]"
    printf '%s\n' "$2" | sed 's/^/    /'
  }

  report "unresolved placeholder: fill it or delete the block" \
    "$(scan -nE '\{\{[A-Z0-9_]+\}\}')"

  [ -n "$(scan -n 'class="theme-toggle"')" ] || \
    report "no light/dark toggle: copy references/artifact-shell.html" "every page ships one, fixed top-right"

  [ -n "$(scan -n 'data-theme')" ] || \
    report "no data-theme stamp: a dark-OS viewer would open in dark" "stamp light before paint"

  # a media query is only safe while an explicit stamp of higher specificity exists
  if [ -n "$(scan -n 'prefers-color-scheme')" ] && [ -z "$(scan -n 'data-theme="light"')" ]; then
    report "prefers-color-scheme decides the initial theme" "add the data-theme=\"light\" block that outranks it"
  fi

  # .reveal hidden in base CSS means a page whose script never runs shows nothing
  report "reveal hidden without the .js guard: no-JS readers get a blank page" \
    "$(printf '%s\n' "$clean" | grep -nE '\.reveal[^{]*\{[^}]*opacity: *0' | grep -v '\.js ' || true)"

  # the same failure by two other routes: a pane hidden until script routes to it,
  # and a container left empty in the markup for script to fill
  report "content exists only once script runs: the page must read with JavaScript off" \
    "$(printf '%s\n' "$clean" | node "$here/checks.ts" script-only)"

  if [ "$TARGET" = b ]; then
    report "document skeleton written by hand: the artifact wrapper owns these" \
      "$(scan -niE '<!doctype|<html[ >]|<head[ >]|<body[ >]')"

    # an importmap or a dynamic import() is neither <script src= nor <link href=, so match CDN hosts too
    report "external resource: CSP blocks every host but Google Fonts" \
      "$(printf '%s\n' "$clean" \
         | grep -nE '<script[^>]+src="https?://|<link[^>]+href="https?://|<img[^>]+src="https?://|@import|url\(https?://|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|skypack\.dev|import\(["'"'"']https?://|fetch\(["'"'"']https?://' \
         | grep -v 'fonts\.googleapis\.com\|fonts\.gstatic\.com' || true)"

    bytes=$(wc -c < "$f" | tr -d ' ')
    [ "$bytes" -lt 16000000 ] || report "over the 16MB page cap" "$((bytes / 1024 / 1024))MB"
  fi

  if [ "$TARGET" = s ]; then
    [ -n "$(scan -niE '<!doctype')" ] || \
      report "no document skeleton: a local file owns its own doctype, html, head and body" "add them"

    cdn=$(printf '%s\n' "$clean" | grep -nE 'https?://(cdn\.jsdelivr\.net|unpkg\.com)/' || true)
    report "unpinned CDN: a floating version breaks the page months later" \
      "$(printf '%s\n' "$cdn" | grep -vE '@[0-9]+\.[0-9]+' || true)"

    # a library that fails to load must degrade, so the page still reads offline
    if [ -n "$cdn" ] && [ -z "$(scan -n 'catch')" ]; then
      report "CDN with no fallback: wrap init in try/catch or guard on the global" "offline would blank the page"
    fi

    report "viewport unit: the page is read in a frame that sizes to its body, so vh feeds back on itself; use rem" \
      "$(scan -nE '[0-9.]+vh\b')"
  fi

  if [ "$TARGET" = a ]; then
    report "viewport unit: the page is read in a frame that sizes to its body, so vh feeds back on itself; use rem" \
      "$(scan -nE '[0-9.]+vh\b')"
  fi

  report "table-wrap nested in a panel: a card inside a card, drop the panel" \
    "$(printf '%s\n' "$clean" | node "$here/checks.ts" nested-panel)"

  report "svg class used but never defined: the shape renders black" \
    "$(printf '%s\n' "$clean" | node "$here/checks.ts" svg-classes)"

  # a hex outside a custom-property declaration is a colour that escaped the token set
  report "hardcoded hex outside a token declaration" \
    "$(printf '%s\n' "$clean" | grep -nE '#[0-9a-fA-F]{3,8}\b' | grep -v -- '--[a-z0-9-]*:' | grep -vE 'href="#|id="' || true)"

  if [ "$hit" -eq 0 ]; then echo "  clean"; else fail=1; fi
done

exit $fail
