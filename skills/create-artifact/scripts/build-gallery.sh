#!/usr/bin/env bash
set -eu

S="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$S/references/gallery.html"

{
  cat <<'HEAD'
<!doctype html>
<html lang="en" data-ds="neutral" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>create-artifact — design system gallery</title>
<style>
HEAD
  cat "$S/assets/doc-system.css"
  cat "$S/assets/themes.css"
  cat <<'MID'
.ds-bar{position:fixed;top:16px;left:16px;right:62px;z-index:50;display:flex;flex-wrap:wrap;gap:6px}
.ds-bar button{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;
  padding:5px 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);
  color:var(--muted);cursor:pointer}
.ds-bar button[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
.page{padding-top:104px}
</style>
</head>
<body>
<nav class="ds-bar" id="bar" aria-label="Design system"></nav>
<button type="button" class="theme-toggle" id="tt" aria-label="Switch to dark theme">
<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>
</button>

<main class="page">
<p class="eyebrow">create-artifact &middot; gallery</p>
<h1>Every design system, same markup</h1>
<p class="lede">One document, ten token sets. Nothing below changes when you switch &mdash; only <code>data-ds</code> on the root element does. Use the theme button to check both themes; light is always the default.</p>

<div class="section-head"><span class="num">01</span><h2>Surfaces and type</h2></div>
<p>Body copy sits on the page floor. Panels lift onto <code>--surface</code>, and a second step is available as <code>--surface-2</code>. Headings take the system's display weight and tracking &mdash; the difference between Linear and Material 3 here is mostly tracking, not colour.</p>

<div class="panel">
<p class="panel-title">A panel</p>
<p>Panels carry the border, the radius and the shadow the system actually uses. Carbon shows zero of all three by design; Apple shows the most.</p>
</div>

<div class="stats">
<div class="stat"><div class="value">10</div><div class="label">packs</div></div>
<div class="stat"><div class="value">1</div><div class="label">neutral</div></div>
<div class="stat"><div class="value">9</div><div class="label">public brand</div></div>
</div>

<div class="section-head"><span class="num">02</span><h2>Callouts</h2></div>
<div class="callout callout--take"><span class="callout-label">My read</span>The accent callout &mdash; the one opinion per document.</div>
<div class="callout callout--tension"><span class="callout-label">Tension</span>The unresolved thing, on the warning tint.</div>
<div class="callout callout--verified"><span class="callout-label">Verified</span>Checked against a source, on the success tint.</div>
<div class="callout callout--risk"><span class="callout-label">Risk</span>What breaks if this is wrong.</div>

<div class="section-head"><span class="num">03</span><h2>Tables and chips</h2></div>
<div class="table-wrap">
<table>
<thead><tr><th>Item</th><th>State</th><th>Note</th></tr></thead>
<tbody>
<tr><td>Token block</td><td><span class="chip chip--met">done</span></td><td>light and dark</td></tr>
<tr><td>Provenance</td><td><span class="chip chip--met">done</span></td><td>vendor or derived</td></tr>
<tr><td>Vendor tint tokens</td><td><span class="chip chip--open">open</span></td><td><code>color-mix</code> stands in</td></tr>
<tr><td>Fonts over CDN</td><td><span class="chip chip--gone">blocked</span></td><td>CSP; fallback stack</td></tr>
</tbody>
</table>
</div>

<div class="section-head"><span class="num">04</span><h2>Decision fork</h2></div>
<div class="fork">
<div class="opt rec"><h4>One shared doc system</h4><p>Ten brands become ten token blocks. Adding a brand is a CSS block and a pack file.</p></div>
<div class="opt"><h4>One stylesheet per brand</h4><p>Full fidelity per brand, but the document system gets copied ten times and drifts.</p></div>
</div>

<p class="maxim">Swap the tokens, keep the document.</p>

<div class="section-head"><span class="num">05</span><h2>Phases</h2></div>
<div class="phase"><p class="when">step one</p><p>Resolve the design system from the registry.</p></div>
<div class="phase"><p class="when">step two</p><p>Ground it &mdash; house packs re-read their repo, public packs trust the pack file.</p></div>
<div class="phase"><p class="when">step three</p><p>Inline, author, stamp light, publish, stop.</p></div>
</main>

<script>
var KEYS = ["neutral","primer","material-3","carbon","linear","geist","stripe","notion","apple-hig","spacex"];
var root = document.documentElement, bar = document.getElementById("bar");
KEYS.forEach(function (k) {
  var b = document.createElement("button");
  b.type = "button"; b.textContent = k;
  b.setAttribute("aria-pressed", String(k === "neutral"));
  b.onclick = function () {
    root.setAttribute("data-ds", k);
    [].forEach.call(bar.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); });
  };
  bar.appendChild(b);
});
document.getElementById("tt").onclick = function () {
  var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  this.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
};
</script>
</body>
</html>
MID
} > "$OUT"

echo "wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines)"
