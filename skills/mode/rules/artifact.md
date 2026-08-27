---
name: artifact
summary: An artifact is a local interactive HTML the reader operates, sourced by clickable links.
when: artifact|mockup|html page|landing page|one-pager|one pager|dossier|design lab|web page|explainer|visuali
---

## Artifacts

An artifact is one self-contained `.html` file written to disk and opened locally. Never an inline reply, never a published page unless a shareable link is asked for by name. Local means no content-security policy, which is the whole reason to build there: pinned CDN libraries, WebGL, real interactivity.

### It is operated, not read

The deliverable is a working model of the subject, not an illustrated report about it. The reader must be able to do the thing:

| The subject | What the page must let the reader do |
|---|---|
| A bug or incident | Reproduce it. Step the failing flow, feed the real input, watch the wrong output appear, then flip the fix and watch it not. |
| A frontend change | See the mockup rendered as working markup, and switch between the variants under discussion. |
| A backend flow, contract or state machine | Run scenarios. Choose an input or a state, watch the path light up, read what each hop returned. |
| Data, volume or blast radius | Explore the real exported records, not a summary of them. Filter, hover, select, and reach a count nobody pre-wrote. |
| A comparison or a decision | Change the assumption and watch the recommendation move. |

Two tests before shipping. Remove every interactive element: if the page still says the same thing, the interactivity was decoration and the work is not done. Then ask whether a reader can reach a conclusion nobody wrote into the page; when they cannot, it is still a document.

**Every visual is driven by real exported data.** Export the actual rows into the page and render from them. A 3D scene, a chart or a diagram built from invented shapes is decoration wearing evidence's clothes.

### Sources are links, not labels

Every load-bearing claim carries a clickable source, in the page, resolving to the real thing outside it: a repository permalink pinned to the line, an observability query already filtered to the incident, the ticket, the pipeline, the design node, the message permalink. A monospace `file:line` in plain text is not a source, because nobody can follow it.

Receipts appear twice: an inline chip beside the claim it supports, and a Sources section near the end. A claim that cannot be sourced is cut, or marked as a recommendation or an open question. Rendering a guess as fact is never available.

### Shape

Hero, then scroll chapters, each chapter earning its place with a figure the reader can operate. No tab bars and no section switcher: tabs hide a wall of text behind several walls, and the cure for a wall of text is a working figure, not a nav.

### Theme

Light is the default, always. The base `:root` block carries the complete light palette, and `@media (prefers-color-scheme: dark)` never decides the initial theme: dark is opt-in, whatever a vendor's own artifact convention defaults to. Every page ships an icon-only light and dark toggle, fixed top right, with an `aria-label` naming the destination theme and a visible `:focus-visible` state, flipping `data-theme` on `document.documentElement`. Both themes are designed through `:root[data-theme="dark"]` and `[data-theme="light"]` token blocks; a colour defined only inside a media or theme block renders one theme's text on the other theme's ground. Never hardcode a hex: add a token instead.

**Never wear another organisation's brand on work that is not theirs.** Take a vendor skill's method and run it on the design system the work actually belongs to.

### The floor under the interactivity

- The prose reads with zero JavaScript. Content is visible by default and enhanced afterwards, never hidden in base CSS and rescued by a script, so a failed CDN degrades the figures and never blanks the page.
- Pin every library to an exact version, wrap each init in `try`/`catch`, and leave static content underneath.
- Honour `prefers-reduced-motion`, keep interactive elements keyboard reachable with a visible focus state, and size a canvas to its container so it cannot overflow.
- Motion earns its place by making something clearer. One orchestrated signature moment beats scattered effects.

### Verifying it

Behaviour is provable and is yours to check: the console is clean, every library loaded, and each control actually does what the page claims. Taste is the user's, so never drive a browser to judge how it looks, and never ask whether it renders nicely. Build it, check it runs, open it, and hand over the path.
