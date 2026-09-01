#!/usr/bin/env bash
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: check-prose.sh <file...>"; exit 2; }

fail=0
for f in "$@"; do
  [ -f "$f" ] || { echo "not a file: $f"; fail=1; continue; }

  # the review layer is tooling injected into the page, so its svg must not count as the page's visual
  page=$(perl -0777 -pe 's{<!-- rv:start -->.*?<!-- rv:end -->}{}gs' "$f")

  # comments quote the rules and inline <code> is the escape hatch, so neither is prose
  stripped=$(printf '%s\n' "$page" | perl -0777 -pe 's{<!--.*?-->}{"\n" x ($&=~tr/\n//)}ges' \
    | sed 's|<code[^>]*>[^<]*</code>||g' | awk '
    /<(script|style|svg|pre)([> \t]|$)/ { depth++ }
    { if (depth > 0) print ""; else print }
    /<\/(script|style|svg|pre)>/       { if (depth > 0) depth-- }
  ')

  raw=$(printf '%s\n' "$stripped" | grep -nE '—|⇒|∩|≥|≤|∴|≠|≈|→|·|✓|×' || true)
  ent=$(printf '%s\n' "$stripped" | grep -nE '&mdash;|&#8212;|&rArr;|&hArr;|&cap;|&ge;|&le;|&there4;|&ne;|&asymp;' || true)
  chain=$(printf '%s\n' "$stripped" | grep -nE '(&rarr;|&#8594;)[[:space:]]*[[:alnum:]]' || true)
  splice=$(printf '%s\n' "$stripped" | grep -nE ' &ndash; ' || true)

  hit=0
  print_hits() {
    [ -n "$2" ] || return 0
    hit=1
    echo "  [$1]"
    printf '%s\n' "$2" | sed 's/^/    /'
  }

  tags=$(printf '%s\n' "$page" | grep -oE '<(p|h[1-6]|table|figure|svg|img|ul|ol|dl|pre|blockquote|hr|canvas)[ >]' | tr -d '<> ' || true)
  wall=$(printf '%s\n' "$tags" | awk '$0=="p"{run++; if(run==5){print "a run of 5+ <p> blocks with no structural break"; exit}} $0!="p"{run=0}')
  figures=$(printf '%s\n' "$tags" | grep -cE '^(table|figure|svg|img|canvas)$' || true)
  mermaids=$(printf '%s\n' "$page" | grep -c '<pre class="mermaid"' || true)

  echo "checking $f"
  print_hits "raw multibyte char: entity it (charset rule) or drop it (prose register)" "$raw"
  print_hits "banned entity in prose: em dash or math/logic symbol" "$ent"
  print_hits "arrow chain: arrow entity followed by text; write the words" "$chain"
  print_hits "spaced en dash used as a clause splice" "$splice"
  print_hits "wall of text: lift the buried structure into a visual (information-design.md)" "$wall"
  if [ "$((${figures:-0} + ${mermaids:-0}))" -eq 0 ]; then
    print_hits "no visual element on the page (table, figure, svg, img, canvas, mermaid)" "zero visuals in the document"
  fi

  if [ "$hit" -eq 0 ]; then
    echo "  clean"
  else
    fail=1
  fi
done

exit $fail
