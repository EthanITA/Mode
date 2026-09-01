#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: check-artifact.sh [--target a|b|s] <file...>"
  echo "  b (default) published artifact · a in-repo lab · s local standalone showpiece"
}

TARGET=b
files=""
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
    "$(printf '%s\n' "$clean" | python3 -c '
import re, sys
src = sys.stdin.read()
style = "\n".join(re.findall(r"<style>([\s\S]*?)</style>", src))

hidden  = set(re.findall(r"(?m)^\s*\.([A-Za-z][\w-]*)\s*\{[^}]*display:\s*none", style))
reshown = set(re.findall(r"(?m)^\s*\.([A-Za-z][\w-]*)\.[\w-]+\s*\{[^}]*display:\s*(?!none)", style))
guarded = set(re.findall(r"(?m)^\s*\.js\s+\.([A-Za-z][\w-]*)", style))
for c in sorted((hidden & reshown) - guarded):
    print(".%s is display:none by default and only script re-shows it; guard it with .js" % c)

scripts = "\n".join(re.findall(r"<script[^>]*>([\s\S]*?)</script>", src))
body    = re.sub(r"<script[\s\S]*?</script>", "", src)
for tag, i in re.findall(r"<(\w+)[^>]*\bid=\"([^\"]+)\"[^>]*>\s*</\1>", body):
    if tag.lower() == "canvas":   # a canvas has no HTML content to author; prose never depends on it
        continue
    if ("\"%s\"" % i) in scripts or ("%s" % i) in re.findall(r"[\x27]([^\x27]+)[\x27]", scripts):
        print("#%s is empty in the markup and filled only by script; author it in HTML" % i)
' 2>/dev/null || true)"

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
  fi

  report "table-wrap nested in a panel: a card inside a card, drop the panel" \
    "$(printf '%s\n' "$clean" | python3 -c '
import re, sys
src = sys.stdin.read()
depth, hits = [], []
for m in re.finditer(r"<div class=\"([^\"]*)\"|<div|</div>", src):
    if m.group(0) == "</div>":
        if depth: depth.pop()
    else:
        cls = m.group(1) or ""
        if "table-wrap" in cls and any("panel" in d for d in depth):
            hits.append(src[:m.start()].count("\n") + 1)
        depth.append(cls)
for n in hits: print("%d: a table-wrap inside a panel" % n)
' 2>/dev/null || true)"

  report "svg class used but never defined: the shape renders black" \
    "$(printf '%s\n' "$clean" | python3 -c '
import re, sys
src = sys.stdin.read()
used = set()
for block in re.findall(r"<svg[\s\S]*?</svg>", src):
    for c in re.findall(r"class=\"([^\"]+)\"", block):
        used.update(c.split())
style = "\n".join(re.findall(r"<style>([\s\S]*?)</style>", src))
defined = set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]*)", style))
for c in sorted(used - defined): print("  ." + c)
' 2>/dev/null || true)"

  # a hex outside a custom-property declaration is a colour that escaped the token set
  report "hardcoded hex outside a token declaration" \
    "$(printf '%s\n' "$clean" | grep -nE '#[0-9a-fA-F]{3,8}\b' | grep -v -- '--[a-z0-9-]*:' | grep -vE 'href="#|id="' || true)"

  if [ "$hit" -eq 0 ]; then echo "  clean"; else fail=1; fi
done

exit $fail
