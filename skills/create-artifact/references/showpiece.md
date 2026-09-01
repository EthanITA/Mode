# Showpiece: settle the six decisions before you write the page

**This file is the canonical statement of the six-slot anatomy.** It is used two ways. Here, you settle the slots for yourself because you are the one building. In the `showpiece-prompt` skill, the same slots get written into a prompt for a model that will build. Same six either way, defined once, here.

The principle behind all of it: **anything left unsettled is a decision made badly, late, under pressure.** When you are writing a prompt, unsettled means delegated to the model. When you are building, unsettled means delegated to the version of you that wants to be finished. Delegate execution. Never delegate architecture, feasibility, the quality bar, or the definition of done.

## The gate: is this reachable in one file?

Run this before anything else, and reshape or split the ask if it fails.

- **Self-contained.** One file. No backend, no build step, no server.
- **No external unknowns.** No auth wall, no API key, no rate limit, no data needing cleaning. If the piece pulls from a source, confirm the access story this session rather than assuming it.
- **Well-represented technique.** Three.js, Canvas physics, D3, SVG and CSS motion sit deep in the training data, so a strong result is reachable. Something exotic is not, and the honest move is to reshape rather than half-build.

## The six slots

| Slot | What it buys | Worked example |
|---|---|---|
| **Architecture, and why** | Removes the worst decision from the critical path. The stated reason becomes the invariant every later choice has to preserve. | "Fetch the orbital elements once every two hours, then propagate in the browser, so real time comes from local physics rather than from polling." |
| **Terms of art** | Retrieval keys into the expert region. Naming the real technique reaches better work than describing the desired effect. | Instanced meshes, Verlet integration, signed distance fields, ACES tonemapping, tabular numerals. Never "make it feel realistic". |
| **Banned shortcut** | Closes the cheapest escape route before it gets taken under pressure. | "Never fake the depth with an image, a texture or a video." "Never narrate a number that belongs in a table." |
| **Quantified acceptance** | Makes the bar enumerable, so scope cannot shrink quietly. | "Four presets, nine debug views, twenty-one live parameters, device pixel ratio capped at 2." "Three chapters, each with its own anchor visual." |
| **Named references** | Sets the register far more efficiently than any adjective. | Name the two or three real things you are aiming at. A codename can import an entire aesthetic in one word. |
| **Feasibility pre-clearance** | Kills the hedging reflex that produces placeholders and `TODO` where real content belongs. | "No registration, no API key, no rate limit. Frontend only. Difficulty: minimal." |

When you are building rather than prompting, the slots stop being lines of text and become notes you actually act on. Write them down anyway. A slot you only thought about is a slot you will quietly renegotiate at hour three.

## Harden against how the medium actually breaks

A showpiece that throws in the console is not a showpiece. For canvas and WebGL, each of these is a real failure worth pre-empting:

- Cap device pixel ratio at 2, or a retina screen renders four times the pixels.
- Pause the loop on `visibilitychange`, so a hidden tab stops burning the battery.
- Draw and simulate only what is on screen; lazy-init below-the-fold scenes with `IntersectionObserver`.
- Recompute pointer coordinates after a resize, or hit-testing drifts.
- Handle `webglcontextlost` rather than letting the canvas go black forever.
- Size the canvas to its container, never to the window.
- No black screens and no unhandled console errors, in any state.

Other media break differently. Charts break on an empty series and on a single point. Scroll-driven pieces break when the reader arrives mid-page from a deep link. Tabbed pages break when a pane that starts hidden contains something that measures itself at load. List the breakages belonging to what you are building, and close them.

**Then prove it.** `scripts/smoke-artifact.ts` runs the page's own scripts against a stubbed DOM and fails on an unfilled host or a stray `NaN`. It is not a browser, so it stays inside the rule that looking at the page is the user's job, and it catches the class of bug that looking would catch.

## One signature moment

A showpiece is remembered for one thing. Decide what that thing is, spend the effort there, and keep everything else disciplined. Motion everywhere reads as a template with the animation turned up. Motion in exactly one right place reads as intent.

## Restraint counts as ambition

The strongest artifact this skill has produced has almost no animation in it. Its impressiveness comes from information density, typesetting and the fact that every number carries a source. Read `visual-system.md` for how that page holds together.

So scale the anatomy to the piece and let the medium follow from the subject. Even a one-page report has an architecture (its narrative spine), a banned shortcut (narrating what should have been a table), a quantified bar (every section carries an anchor visual) and a reference register. A sober RFC keeps all six. It just has no WebGL.
