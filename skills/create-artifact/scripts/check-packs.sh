#!/usr/bin/env bash
set -u

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DS="$SKILL_DIR/design-systems"
THEMES="$SKILL_DIR/assets/themes.css"
fail=0

err() { printf '  FAIL  %s\n' "$1"; fail=1; }
ok()  { printf '  ok    %s\n' "$1"; }

echo "packs:"
for f in "$DS"/*.md; do
  key="$(basename "$f" .md)"
  [ "$key" = "REGISTRY" ] && continue

  missing=""
  for section in '\*\*Kind:\*\*' '^## Identity' '^## Tokens' "^## Do / don't" '^## Provenance'; do
    grep -qE "$section" "$f" || missing="$missing $(echo "$section" | tr -d '^\\')"
  done
  [ -n "$missing" ] && err "$key — missing:$missing"

  # A self-contained pack ships its own CSS and has no themes.css block.
  if grep -q 'doc-system.css` + `themes.css' "$f"; then
    grep -q "\[data-ds=\"$key\"\]" "$THEMES" \
      || err "$key — no :root[data-ds=\"$key\"] block in themes.css"
    grep -q "\[data-ds=\"$key\"\]\[data-theme=\"dark\"\]" "$THEMES" \
      || err "$key — no dark twin in themes.css"
  fi

  grep -qE "^\| \`$key\`" "$DS/REGISTRY.md" || err "$key — not listed in REGISTRY.md"
  [ -z "$missing" ] && ok "$key"
done

echo "registry rows resolve:"
rows=$(grep -oE '^\| `[a-z0-9-]+`' "$DS/REGISTRY.md" | tr -d '|` ')
[ -z "$rows" ] && err "REGISTRY.md lists no keys — the row format changed"
for key in $rows; do
  if [ -f "$DS/$key.md" ]; then ok "$key"; else err "registry row '$key' has no pack file"; fi
done

echo "assets:"
for css in "$SKILL_DIR"/assets/*.css; do
  o=$(tr -cd '{' < "$css" | wc -c | tr -d ' ')
  c=$(tr -cd '}' < "$css" | wc -c | tr -d ' ')
  if [ "$o" = "$c" ]; then ok "$(basename "$css") — $o balanced braces"
  else err "$(basename "$css") — $o '{' vs $c '}'"; fi
done

echo "required tokens per data-ds block:"
for key in $(grep -oE ':root\[data-ds="[a-z0-9-]+"\] \{' "$THEMES" | sed -E 's/.*"(.*)".*/\1/'); do
  block=$(awk -v k="$key" '$0 ~ ":root\\[data-ds=\""k"\"\\] \\{" {f=1} f {print} f && /^\}/ {exit}' "$THEMES")
  miss=""
  for t in --bg --surface --surface-2 --ink --muted --faint --border --border-strong --accent --accent-ink --accent-soft --ok --warn --bad --info; do
    echo "$block" | grep -q -- "$t:" || miss="$miss $t"
  done
  if [ -n "$miss" ]; then err "$key —$miss"; else ok "$key"; fi
done

block_vars() { awk -v s="$1" 'index($0, s) == 1 {f=1} f {print} f && /^\}/ {exit}' "$THEMES" | grep -oE -- '--[a-z0-9-]+:' | tr -d ' :'; }

# :root[data-theme="dark"] and :root[data-ds="x"] tie on specificity, so a dark block
# that omits a var the neutral dark block sets loses to the LIGHT colour of its own set.
echo "dark blocks override every neutral-dark var:"
neutral_dark=$(block_vars ':root[data-theme="dark"],')
for key in $(grep -oE ':root\[data-ds="[a-z0-9-]+"\]\[data-theme="dark"\] \{' "$THEMES" | sed -E 's/.*data-ds="([a-z0-9-]+)".*/\1/'); do
  [ "$key" = "neutral" ] && continue
  have=$(block_vars ":root[data-ds=\"$key\"][data-theme=\"dark\"] {")
  miss=""
  for v in $neutral_dark; do
    echo "$have" | grep -qx -- "$v" || miss="$miss $v"
  done
  if [ -n "$miss" ]; then err "$key dark — inherits neutral's:$miss"; else ok "$key dark"; fi
done

echo "every var used by doc-system.css resolves:"
defined=$(grep -ohE -- '--[a-z0-9-]+:' "$THEMES" | tr -d ' :' | sort -u)
for v in $(grep -oE 'var\(--[a-z0-9-]+[,)]' "$SKILL_DIR/assets/doc-system.css" | sed -E 's/var\((--[a-z0-9-]+)[,)]/\1/' | sort -u); do
  echo "$defined" | grep -qx -- "$v" && continue
  grep -q "var($v," "$SKILL_DIR/assets/doc-system.css" \
    || err "doc-system.css uses $v — never defined in themes.css and no fallback"
done
ok "no unresolvable vars"

echo
if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "CHECKS FAILED"; fi
exit "$fail"
