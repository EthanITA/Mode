# Interaction and motion: earn it, and never depend on it

Two rules sit above everything else here.

**Motion serves comprehension.** An animation earns its place by making an idea clearer: a flow that steps through, a number that lands, a diagram that reveals its layers in the order you should read them. One orchestrated moment beats effects scattered over the page. If an effect would survive being deleted with nothing lost, delete it.

**The page must read with zero JavaScript.** A published artifact can fail to run a script for reasons you do not control. Content is therefore visible by default and enhanced afterwards, never hidden by default and rescued by script. This single rule is the difference between a degraded page and a blank one.

## Libraries are available, and the patterns here still are not

Target S is the standing default, and a local file has no content security policy, so three.js, GSAP, a charting library and React all load. Use them where they genuinely help.

The patterns below stay dependency-free anyway, for a reason worth keeping in mind: a reveal, a counter, a set of tabs and a tooltip are a few lines each. Pulling a library for them buys nothing and costs a version to pin, a global to guard and a failure branch to get wrong. Save the dependency budget for the thing that actually needs it.

Whenever you do load one: pin an exact version, load it with `defer` or at the end of `<body>`, wrap initialisation in `try`/`catch` or a check that the global exists, and make sure the page still reads when it does not arrive. A published artifact (Target B, only when the user asks for a link) blocks every host but Google Fonts, so never carry a file built this way there.

## Fade in up: the default reveal on every artifact

This is not optional garnish. Every artifact puts `.reveal` on its major blocks (each panel, figure, table wrapper, callout and section head) and lets them rise into place as the reader reaches them. The `js` class is added by the script itself, so the hiding rule cannot apply unless the script ran.

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
.js .reveal       { opacity: 0; }
.js .reveal.is-in { animation: fadeInUp .55s cubic-bezier(.22, .61, .36, 1) both;
                    animation-delay: calc(var(--d, 0) * 70ms); }
```

An animation rather than a transition, because `animation-delay` staggers a group without the delay also applying when the property changes back, and because `both` leaves the element in its final state rather than snapping.

```js
(function () {
  var els = document.querySelectorAll('.reveal');
  // bail BEFORE adding .js — otherwise a browser without IO hides the content forever
  if (!els.length || !('IntersectionObserver' in window)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('js');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  // stagger is derived from position among reveal siblings, so nothing is hand-numbered
  els.forEach(function (el) {
    if (!el.style.getPropertyValue('--d')) {
      var sibs = el.parentNode ? el.parentNode.querySelectorAll(':scope > .reveal') : [];
      var i = Array.prototype.indexOf.call(sibs, el);
      el.style.setProperty('--d', Math.min(i < 0 ? 0 : i, 5));
    }
    io.observe(el);
  });
})();
```

**If the page already sets a `js` class for something else, give the reveal its own guard.** The dossier scaffold adds `js` at the top of `<head>` so its tab panes can hide, and that runs unconditionally. Reusing it to gate the reveal means a browser without `IntersectionObserver` hides every block forever. Add a second class, `js-rv`, in the same early script but only after checking the observer exists and reduced motion is off, then key the reveal rules on that.

The stagger caps at five steps on purpose. Past about six the last item reads as broken rather than choreographed, and a long list would otherwise leave its tail sitting invisible while the reader waits.

## Count-up on a headline number

Write the real, formatted number in the HTML. If the script never runs, the reader still sees the figure rather than a zero.

```html
<span class="stat" data-count="1240">1,240</span>
```

```js
(function () {
  var els = document.querySelectorAll('[data-count]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  els.forEach(function (el) {
    var to = Number(el.dataset.count);
    if (!isFinite(to) || reduce) return;          // leave the authored text in place
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      var dur = 900, t0 = performance.now(), done = false;
      var settle = function () { if (done) return; done = true; el.textContent = to.toLocaleString(); };
      requestAnimationFrame(function step(now) {
        var p = Math.min(1, (now - t0) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step); else settle();
      });
      setTimeout(settle, dur + 400);              // a backgrounded tab throttles rAF and would freeze mid-count
    });
    io.observe(el);
  });
})();
```

Two failures are baked out of that code and both are easy to reintroduce. Always drive the number from `data-count`, never by reading the text back, because a formatted `1,240` parses to `NaN` and the count freezes. And always keep the timeout, because a throttled animation frame otherwise leaves a headline number stuck at a meaningless value.

## Tabs

Use real ARIA roles. A `<div>` with a click handler is invisible to a screen reader and unreachable by keyboard.

```html
<div role="tablist" aria-label="Views">
  <button role="tab" id="t1" aria-controls="p1" aria-selected="true">Summary</button>
  <button role="tab" id="t2" aria-controls="p2" aria-selected="false" tabindex="-1">Detail</button>
</div>
<div role="tabpanel" id="p1" aria-labelledby="t1">…</div>
<div role="tabpanel" id="p2" aria-labelledby="t2" hidden>…</div>
```

```js
(function () {
  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function show(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
    }
    list.addEventListener('click', function (e) {
      var tab = e.target.closest('[role="tab"]');
      if (tab) show(tab);
    });
    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (i < 0 || !step) return;
      e.preventDefault();
      var next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      show(next);
    });
  });
})();
```

**A hidden panel measures zero.** Anything that sizes itself at load — a diagram, a chart, an SVG scaled to its container — comes out collapsed inside a panel that starts `hidden`, and stays collapsed after you reveal it. When a panel holds one of those, hide it with `visibility:hidden` and absolute positioning instead, so it still has a width while it renders.

## Tooltip

```css
[data-tip] { position: relative; }
[data-tip]::after {
  content: attr(data-tip); position: absolute; bottom: calc(100% + 6px); left: 50%;
  transform: translateX(-50%); white-space: nowrap; padding: 4px 8px;
  border-radius: var(--radius-sm); background: var(--ink); color: var(--bg);
  font-size: .75rem; opacity: 0; pointer-events: none; transition: opacity .15s;
}
[data-tip]:hover::after, [data-tip]:focus-visible::after { opacity: 1; }
```

Put it on something focusable, or add `tabindex="0"`, otherwise it is mouse-only. A tooltip is for a gloss a reader can live without. Anything load-bearing goes in the text, because generated content is unreliable for assistive technology and invisible on touch.

## React, for an island with real state

Reach for it when the page holds genuine interactive state: a simulator, a filterable or sortable table, a form whose fields depend on each other. Below that bar, hand-written DOM code is shorter and has nothing to pin.

**React renders islands, never the prose.** The document body stays static HTML, and React mounts into one container inside it. That way a CDN that fails to answer costs you the widget, not the page.

No build step is needed. `htm` gives the JSX-like syntax through a tagged template, so there is no Babel and no bundler.

```html
<div id="sim-root">
  <p class="muted">The interactive version needs scripts. The table below carries the same numbers.</p>
</div>

<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" defer></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" defer></script>
<script src="https://unpkg.com/htm@3.1.1/dist/htm.umd.js" defer></script>
```

```js
window.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('sim-root');
  if (!root || !window.React || !window.ReactDOM || !window.htm) return;  // keep the authored fallback
  try {
    var html = htm.bind(React.createElement);
    var useState = React.useState;

    function Sim() {
      var s = useState(0), n = s[0], setN = s[1];
      return html`<div class="panel">
        <button type="button" onClick=${function () { setN(n + 1); }}>Step</button>
        <span class="mono">${n}</span>
      </div>`;
    }
    ReactDOM.createRoot(root).render(html`<${Sim} />`);
  } catch (e) {
    /* the static fallback above stays on screen */
  }
});
```

Three things that bite. Pin every version, because `latest` breaks the file months later. Guard on the globals *before* clearing the fallback, so an offline read still shows something. And keep the component's colours in CSS classes rather than inline styles, or the light and dark toggle stops reaching them.

## The floor every artifact clears

- **Reduced motion is honoured.** Ambient and looping motion does not start at all. Motion that carries meaning stays, kept short.
- **Every interactive element is reachable by keyboard** and shows a visible `:focus-visible` ring.
- **Nothing scrolls the page sideways.** Wide tables, diagrams and code blocks scroll inside their own `overflow-x:auto` container.
- **State is visible without colour alone.** A selected tab, a passing check and a warning each carry a shape, a label or a weight change too.
- **Theme changes are instant.** Read colours from CSS custom properties so the light and dark toggle needs no JavaScript beyond flipping `data-theme`.
