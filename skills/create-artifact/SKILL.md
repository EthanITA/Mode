---
name: create-artifact
description: Produce a visual artifact (report, review, RFC/design doc, one-pager, study guide, explainer, or app-UI mockup) in a chosen design system. Ships a neutral house style and the public brand systems (GitHub Primer, Material 3, IBM Carbon, Linear, Vercel Geist, Stripe, Notion, Apple HIG, SpaceX), and resolves any design system installed in ~/.claude/mode/design-systems/. Builds to a showpiece register, grounds its claims in real sources, and carries the receipts into the page. Delivers a local self-contained .html with full 3D, motion, React and interactivity, opened for the user on creation; publishing happens only when they ask for a link by name. Use whenever the user asks to create/produce/build/redesign an artifact, visual doc, report or mockup, and whenever they invoke /create-artifact. Responds in the edu style.
user-invocable: true
disable-model-invocation: false
---

# Create artifact

Produce an artifact in a **named design system**, saying only things that are **true**. Reuse the system's real design language, never re-derive tokens or invent a look, and ground every load-bearing claim before you render it. Respond in the **edu register**.

**Invocation:** `/create-artifact <what to build> [--ds <key>]`. The `--ds` flag is optional; §3 resolves it, and it also accepts a bare name (`/create-artifact the release digest --ds linear`). An installation may add wrapper skills that pre-answer `--ds` with one of its own packs.

**The CLI:** `artifact` in every command below is this plugin's `bin/artifact`, sitting beside `bin/mode`. Call it by path, or put the plugin's `bin` on your PATH.

## 0. The register (how to talk while doing this)
Teach as you build, per the `edu` style shipped with this plugin (`skills/mode/styles/edu.md`): top down (big picture, then detail, then options), visible hierarchy (short sections, tables, callouts, never a wall of prose), and `★ Insight ─` blocks for the non-obvious calls (why this target, why this token, a gotcha caught). Warm, readable by a non-native English reader. The artifact embodies the design system; the chat explains the choices. Drop to a plain summary only when the user has asked for a pure production run with no explanation.

## 1. Load `artifact-design` first
Mandatory before writing any artifact page: it calibrates how much design investment the request warrants. The design system decides *what it looks like*; `artifact-design` decides *how far to take it*. If the artifact carries charts, load `dataviz` too, before the first line of chart code; hand-drawn SVG diagrams load `artifact-diagramming` first.

## 1b. Read the open comments before you touch the page
Every local artifact ships a review layer, so a page you are asked to change may already carry the user's comments on it. **Read them first, every time, before you plan a single edit.** Working from the chat while the page holds three open threads is how a round of review gets silently dropped.

1. **`artifact comments <slug>`** prints the threads, and picks up anything the page saved to `~/Downloads` on the way. No layer yet means no comments, and it says so.
2. **Work each open thread.** A comment is an instruction about one specific block, not a suggestion, and it carries the quote it was anchored to.
3. **Answer every one as you go.** `artifact comments <slug> --reply <n> "..."` says something back; `artifact comments <slug> --resolve <n> "what changed"` closes it. A thread you decided not to act on stays open with a reply saying why, because a silent rejection is the one outcome the user cannot see.
4. **Rebuild, then `artifact review <slug>`** to refresh the layer. Threads survive it: each one re-anchors by the text it was attached to, so a block that moved keeps its comment and a block that was rewritten reports itself unanchored rather than pointing at the wrong paragraph.

**Resolving is a claim that the page now does what the thread asked, so resolve after the edit lands, never before.** Nothing is finished while a thread is open and unanswered.

**Waiting for the user.** `artifact wait <slug>` listens on localhost until the page sends its comments or Approve is pressed, then prints what arrived. The page finds that sink by itself and falls back to a downloaded file when nothing is listening, so the artifact still works alone on a laptop with no session running.

**In copilot mode this is the approval gate.** Approve pressed with no open threads is the yes: record it with `mode approve <slug>` and dispatch. Approve pressed with threads still open is an approval with named changes, so those threads are the work. Anything weaker is not an approval, and silence never is.

## 2. Pick the profile
One profile fixes the page shape, the scaffold, the motion budget, the default target and whether §5 applies. Name it in one line and move on. Picking a profile is picking all five at once, which is the point.

| Profile | The ask sounds like | Shape | Scaffold | Motion | Target | Ground it |
|---|---|---|---|---|---|---|
| **brief** | a digest, a one-pager, catch me up | title, then a stat row, then three to five panels | `artifact-shell.html` | fade-in-up reveal | S | yes |
| **report** | a report, a review, a synthesis, an RFC | eyebrow, title, lede, numbered sections, sources | `artifact-shell.html` | fade-in-up reveal | S | yes |
| **explainer** | explain X, teach me, a study guide | lede, a narrative spine, an anchor visual per concept, recap | `artifact-shell.html` | fade-in-up reveal | S | yes |
| **dossier** | analyse X, is it worth it, the full picture with data, **make it interactive**, **navigable, something I come back to**, **a document with structure** | thin topbar, hero, scroll chapters each carrying a figure the reader operates, sources | `templates/interactive.html` | reveal on scroll, stepped scenarios, one data-driven 3D moment | S | yes, heavily |
| **showpiece** | make it impressive, a demo, visualise this | hero, chapters, one signature moment | `templates/showpiece.html` | full, one signature moment | S | only if it asserts |
| **mockup** | a mockup of the settings screen | the real screen, chrome and all | the target repo's own scaffold | whatever the app does | A | no, it asserts nothing |

Only **mockup** asserts nothing, so grounding is the default and skipping it is the exception you say out loud. When two profiles both fit, the tie-break is what the reader does with it: something they read start to finish is a **report**, something they navigate and return to is a **dossier**.

**No tab bars.** A wall of text does not become readable by being split behind five tabs; it becomes five walls with a nav in front. The cure is a figure the reader can operate, so every profile above uses the chapter shape and the tabbed dossier scaffold is retired.

**Interactive means operable, and the page is still a document first.** The reader must be able to do the subject's thing: reproduce the bug, switch the mockup variants, run the backend scenario, filter the real rows and reach a count nobody pre-wrote. Two tests before shipping. Strip every control: if the page still says the same thing, the interactivity was decoration. Then ask whether a reader can reach a conclusion you did not write into the page; if not, it is still a report.

None of that licenses a page that only exists once script runs. Every number, row, caption and definition is authored in the HTML, the opening state of each figure included, and script only takes the interaction over. With script off the chapters stack into one long document that reads start to finish. If the numbers need a single source, splice them in with a build script from a `<slug>.build/` folder beside the artifact, never at runtime. `check-artifact.sh` fails an element left empty for script to fill, which is exactly how this rule is enforced rather than hoped for.

**Every visual is driven by real exported data.** Export the actual rows into the page and render from them: 84 real block orders as 4,553 cells with 157 bad ones reads as evidence, and an invented lattice of the same size reads as a screensaver.

**Then settle the showpiece anatomy: read `references/showpiece.md`.** Six decisions before the first line: architecture and why, terms of art, the banned shortcut, quantified acceptance, named references, feasibility. They live in that file, canonically, for every profile. Scale them to the piece. A sober RFC keeps all six, it just has no WebGL.

**And read `references/visual-system.md` before writing any CSS beyond the pack.** It carries how a page actually holds together: closing the axes on which components could differ, reserving colour for meaning, the micro-label type role, measure per content type, and the token architecture that lets a chart belong to the page.

## 3. Resolve the design system
Read `design-systems/REGISTRY.md`, and straight after it the user registry at `~/.claude/mode/design-systems/REGISTRY.md` when that file exists. Then read the **one** pack you pick; `artifact ds <key>` prints the file that answers for a key (user packs load after the shipped set, and a user pack sharing a shipped key wins). Never load every pack.

Resolve in this order, stopping at the first hit:

1. **Explicit**: the user named one (`--ds notion`, "in the Linear style", "make it look like GitHub").
2. **Inferred from the work**: the user registry may carry context rules (a directory, a project or a topic that implies a pack). Apply them rather than asking; the work usually answers it.
3. **Ask**: only when the artifact is externally visible *and* the brand genuinely changes the deliverable, or two readings are equally live. Use `AskUserQuestion` with the registries' one-line descriptions as the option text, so each option is self-explanatory.
4. **Default `neutral`**: a considered, brand-free look. Say which key you used and why in the closing summary.

★ The keys are not interchangeable registers. A user pack can be work-branded or personal; the user registry says where each belongs. Never put one identity's brand on another identity's output, and never wear a brand on work that is not that brand's.

## 4. Ground the system (every run, because sources drift)
- **User packs that name a source of truth** (a repo stylesheet, a published CSS file): read that source live at the start of the run. The pack's asset is a translation and can lag. If they disagree, **the source wins**, and you update the asset in the same pass.
- **Shipped public packs**: the pack file *is* the ground truth; it records what was read from the vendor and what was derived. Don't re-fetch, and don't upgrade a derived value to a vendor value by guessing.

## 5. Ground the subject: read `references/grounding.md`
§4 makes the artifact *look* real. This makes it *be* real, and it is the step that separates an artifact from a nicely-typeset guess.

Find out before you render. Trace the thing end to end, collect a source for every load-bearing claim, and write the findings to a notes file (for example `<slug>-artifact-notes.md` in your scratch or analysis folder) so the authoring phase reads structured facts rather than chat memory. Grounding is finished when every claim has one source you read this session. A claim you could not source gets **cut**, marked `.rec-label` as your judgement, or marked `.open-label` as an unresolved question. Rendering it as plain fact is never available.

Then carry the sources into the page: a `.receipt` chip beside each claim and a `.sources` section near the end, dated. Skip all of this only for a kind that asserts nothing (§2), and say that you skipped it.

**A receipt is a link, not a label.** Each chip is an `<a href>` resolving to the real thing outside the page: a repository permalink pinned to the commit and line, an observability query already filtered to the incident (Kibana, Grafana, Datadog), the ticket, the pipeline or job, the design node, the message permalink. `alloc.ts:42` as plain monospace text is not a source, because nobody can follow it from the page they are reading.

## 6. Pick the target
| | **S, local showpiece** | **B, published artifact** | **A, in-repo lab** |
|---|---|---|---|
| When | motion, depth, live interactivity, anything CDN-powered | a document worth a shareable link | an app-screen mockup inside a real repo |
| Host | one `.html` on disk, opened by double-click, **no CSP, so every library works** | a hosted Artifact page, CSP-locked; Google Fonts is the only external host | a file in that repo, via file or dev server |
| CSS | inline the pack, plus CDNs freely | inline the pack; no CDN | the repo's own build |
| Components | anything you can write | port framework components to static markup | reuse the repo's real components |
| Gate | `--target s` | `--target b` | `--target a` |

**Target S is the standing default and B is off unless the user asks for it by name.** Local files avoid the published-artifact content policy, which is what blocks every external library and caps the ambition of anything interactive. So build to the artifacts directory and do not offer publishing as an option. Take **B** only on an explicit "publish this" or "I need a link to send", and never carry a Target-A or Target-S file there, because the CSP strips its CDNs and it renders unstyled. `check-artifact.sh` catches that.

**Being local changes what you may reach for, so use it.** Three.js, GSAP, a real charting library and React are all available. The rules that remain are the ones that keep the file working in a year: pin an exact version, wrap initialisation in `try`/`catch` or a check that the global exists, and keep the prose readable when a library fails to load. See §8 and `references/rich-media.md`.

**The artifacts directory** resolves in this order: the `NOTES_ARTIFACTS` environment variable, then the `artifacts` key in `~/.claude/mode/config.json`, then `~/artifacts`. `artifact list` reads the same chain, so where the CLI looks and where you write can never disagree.

## 7. Build for Target B (published artifact)
1. **Start from `references/artifact-shell.html`.** It carries the early inline script that stamps `data-theme="light"` before paint (so a dark-OS viewer sees light with no flash), the fixed top-right toggle, and the receipt and sources markup.
2. **Placeholders are `{{UPPER_SNAKE}}`.** Fill every one or delete the block that holds it. `check-artifact.sh` fails on any left behind, which is the whole point of the convention.
3. **Inline the pack's stylesheets** into the page `<style>`, in the order the pack names them: `assets/doc-system.css` then `assets/themes.css` for shared-stylesheet packs, or the single file of a self-contained user pack.
4. **Link the pack's real typeface** when it names a Google Fonts family; the pack gives the exact `<link>`. Only Söhne (`stripe`), D-DIN (`spacex`) and Lyon Text (`notion` display) genuinely fall back.
5. **Author with the system's classes.** `doc-system.css` gives you `.page .eyebrow .lede .toc .section-head .panel .panel-title .callout--{take,tension,verified,risk,note} .maxim .table-wrap .chip--{met,new,open,gone} .fork .opt .rec .phase .stats .stat`, plus `.receipt .sources .rec-label .open-label`. A self-contained pack has its own vocabulary; see its pack file.
   - **A `.table-wrap` is already a card.** Never put one inside a `.panel`: that renders a card inside a card. Use `.panel` for prose and lists, `.table-wrap` on its own for tables. `check-artifact.sh` fails on the nesting.
   - **Nesting content costs you the spacing.** `.page > * + *` only matches direct children, so the moment content sits inside a wrapper (a tab panel, a column) the rhythm disappears. Put `.flow` on that wrapper.
   - **Hand-authored SVG uses `.diagram`**, with `.bx .bx-2 .zone` for shapes, `.ln .ah .ln-new .ah-new .ln-bad` for edges and arrowheads, `.f-{ok,warn,info,bad,accent,gone}` for semantic fills, `.t-{accent,ok,bad}` and `.sm` for labels. Every shape needs a class from this set: one that matches no rule renders **black**, and `check-artifact.sh` fails on it.
   - **Code blocks are `.code`** with `.code-head .code-title .code-tag--{now,new} .code-file`, and `.codepair` for two side by side. Write real source, not pseudo code, and run `scripts/highlight-ts.py <file>` over the page to bake highlighting into `<pre data-ts>` blocks: no highlighter library loads under the CSP, so colouring happens before publish and the page still reads with no JavaScript.
6. **Add motion only where it explains something.** `references/interaction.md` has the dependency-free reveal, count-up, tabs and tooltip. Never pull a CSS or JS framework CDN into a published artifact; a utility you want but don't have resolves to plain CSS inline (`px-4` becomes `padding-inline:1rem`).
7. **Gate it, last thing before publishing.** Run `scripts/check-prose.sh <file>` and `scripts/check-artifact.sh <file>`, fix every hit, and re-run. Edit nothing afterwards, or the gate result is stale. This is authoring, not the banned testing: no server, no browser.
8. **Publish only when the user asked for a shareable link by name**; the local file is the default deliverable. When they did ask, record the URL the tool returns: `artifact stamp <slug> --url <returned URL> --ds <key> --target b`, so a later session updates that artifact instead of minting a duplicate. Keep `title` and `favicon` stable across redeploys.
9. **Updating an artifact a previous chat published** (extending a guide, keeping its link): pass its URL as the `url` param, because without it a new session mints a **new** URL. Don't have the URL? `Artifact` with `action: "list"` finds it. Same-session redeploys just reuse the same file path.

## 8. Build for Target S (local showpiece)
1. **Start from `templates/showpiece.html`.** It carries the document skeleton, the light-default stamp and the toggle, the dependency-free reveal and count-up, a mermaid figure and a three.js hero; delete the hero when the subject is not spatial.
2. **Fill every `{{PLACEHOLDER}}`** or delete the block holding it.
3. **Inline the pack's stylesheets** at `{{INLINE_STYLESHEETS}}`. The template styles only against generic tokens, so it inherits whichever pack you picked.
4. **Add rich media from `references/rich-media.md`**: pinned versions, `try`/`catch` around every init, themed from the pack tokens, reduced motion honoured. Charts load `dataviz` first.
4b. **Reach for React when the page has real interactive state**: a simulator, a filterable table, anything where hand-rolled DOM string building would be the slow and bug-prone path. React 18 UMD plus `htm` gives JSX-like syntax with no build step; both pin cleanly. **React renders the interactive islands, never the prose**: the document body stays static HTML so the page still reads when a CDN is unreachable. Recipe in `references/interaction.md`.
5. **Harden per `showpiece.md`**: device pixel ratio capped at 2, loop paused when the tab is hidden, canvas sized to its container, `webglcontextlost` handled, no console errors in any state.
6. **Write to `<artifacts dir>/<slug>.html`** (`mkdir -p` first; §6 says how the directory resolves), or to an explicit path the user gives. Then `artifact stamp <slug> --target s --ds <key>`, since a local showpiece still needs to be findable by slug.
6b. **Add the review layer** with `artifact review <slug>`, so the page can be commented on. It carries its own threads, so refreshing it on a rebuild keeps every comment already made. Never paste the layer by hand and never edit it inside a page: the one copy lives at `assets/review-layer.html` and the command is what installs it.
7. **Gate it, last thing before delivering**: `scripts/check-prose.sh <file>` and `scripts/check-artifact.sh --target s <file>`. Both skip the review layer, so the page is judged on its own content. Edit nothing afterwards.
8. **Open it for the user, then hand over the absolute path.** Run `open <path>` as the last step so the artifact lands on their screen without them going looking for it, and print the path too. This is delivery, not verification: you still never inspect the rendered page, screenshot it, or ask whether it looks right.

## 9. Build for Target A (in-repo lab)
Use the target repo's own scaffold and components; the point of a lab is that it runs inside the real app. Compose with the repo's real tokens, port or mount its actual components for interactivity, and save in-repo, viewing through its dev server. A user pack may name a lab boilerplate for its own app; when it does, start there. Gate with `check-artifact.sh --target a`, which drops the CSP and document-skeleton checks.

## 10. Non-negotiables
- **Light default, both themes, one toggle.** Base `:root` carries light; dark is opt-in via `[data-theme="dark"]`. Fixed top-right icon-only button, `aria-label` naming the destination theme, visible `:focus-visible`. A `prefers-color-scheme` block is only safe while a higher-specificity `[data-theme="light"]` block outranks it.
- **The page reads with zero JavaScript.** Content is visible by default and enhanced after, never hidden by default and rescued by script. A `.reveal` hidden in base CSS is a blank page for anyone whose script did not run.
- **Say only what you can source.** Every load-bearing claim carries a `.receipt`; every judgement of yours carries `.rec-label`. See §5.
- **Human prose in body copy: read `references/prose-register.md` before writing any.** It carries the binding rules and few-shot slop-vs-human rewrites: spoken-style sentences, jargon glossed, no em dashes in any form, no math or logic symbols in prose, no "X, not Y" reflex. `scripts/check-prose.sh` enforces the mechanical part; inline `<code>` is the escape hatch when you must quote a banned glyph.
- **No walls of text: read `references/information-design.md` before writing the body.** Every major section carries an anchor visual chosen by the information's shape (chart per `dataviz`, mermaid diagram, decision table, pre-rendered KaTeX for math); captions state takeaways; the flip test passes. `check-prose.sh` fails a five-paragraph run or a page with no visual.
- **Charset.** A published page's wrapper owns `<head>`, and a raw multibyte char (`· ✓ …`) mojibakes under some servers. Use **HTML entities** (`&middot; &check; &hellip;`) for the non-ASCII glyphs the prose register still allows; `&mdash;` and math-symbol entities are banned in body copy outright. `&` in code becomes `&amp;`.
- **Fonts.** Prefer the pack's Google Fonts link (§7.4). When a family is licensed and you hold the files locally, `scripts/embed-fonts.sh <dir>` emits a base64 `@font-face` block; expensive, so reserve it for when fidelity genuinely matters and watch the 16MB page cap.
- **No hardcoded hex**: only the pack's vars. Adding a colour means adding a token.
- **No emoji in app-surface mockups**: inline SVG icons (Lucide) instead.
- **Diagrams and math.** Mermaid renders natively **only in a published Artifact page**; opened locally (`file://`) the raw code shows. If the file must also work locally, or carries many diagrams, **pre-render mermaid to static SVG** (headless Chrome) and embed as a data-URI `<img>`: zero runtime deps, no ID collisions, works in both contexts. Never leave unrendered mermaid inside a `display:none` pane (it renders at width 0); use `visibility:hidden` plus absolute positioning. KaTeX: pre-render at build time; its CDN is CSP-blocked.
- **Prove the behaviour, never judge the look.** Once a page carries controls, "it renders" is not the claim being made: the claim is that the controls do something. So check the mechanism, headlessly: the gate is clean, every script block parses, and the stage logic actually swaps what it says it swaps when driven with a stub. That is a receipt, and a page whose only interactive element throws on click is unfinished whatever the gate said. Taste stays the user's: no browser automation, no screenshots, no asking them to confirm it looks right. Finish by running `open <path>` so the file lands on their screen, then stop.
- **Motion is a default, not a decision.** Every artifact reveals its major blocks with the fade-in-up in `references/interaction.md`, staggered by a small per-block delay. Content stays visible with no JavaScript and reduced motion turns it off. Anything beyond that reveal still has to earn its place.
- **Every local artifact carries the review layer, and open comments are read before it is touched.** See §1b. Target B does not get it: the CSP blocks the sink, and a published page's threads cannot be read back from disk.
- **Keep in sync.** A user pack whose named source has moved gets its asset updated in the same pass.

## Files
| Path | What |
|---|---|
| `design-systems/REGISTRY.md` | the index: read this first, then the user registry, then one pack |
| `design-systems/*.md` | one pack per shipped system: identity, tokens, signature moves, do/don't, provenance |
| `~/.claude/mode/design-systems/` | user packs and their stylesheets, plus an optional user REGISTRY.md; a user key wins over a shipped one |
| `assets/doc-system.css` | brand-neutral document system; styles only against generic vars |
| `assets/themes.css` | every shipped token set, as `[data-ds]` blocks, light + dark |
| `assets/review-layer.html` | the comment layer, installed by `artifact review <slug>` and never pasted by hand |
| `references/artifact-shell.html` | Target-B scaffold: default-light stamp, toggle, receipts, sources |
| `references/grounding.md` | how to make the claims true, and what to do with one you cannot source |
| `references/interaction.md` | dependency-free reveal, count-up, tabs, tooltip, and the no-JS floor |
| `references/showpiece.md` | the canonical six-slot anatomy, the reachability gate, and how each medium breaks |
| `references/visual-system.md` | why a coherent page is coherent, reverse-engineered from the best artifact this skill has made |
| `references/rich-media.md` | three.js, gsap, live mermaid, KaTeX and charts; Target S only |
| `references/prose-register.md` | binding body-copy rules plus few-shot slop-vs-human rewrites |
| `references/information-design.md` | choose the visual by the information's shape; anchor-visual, flip-test and caption rules |
| `references/gallery.html` | all ten shipped shared-stylesheet systems in one page, switchable; open it to compare looks before picking |
| `templates/showpiece.html` | showpiece scaffold: skeleton, toggle, reveal, counters, mermaid, three.js hero |
| `templates/interactive.html` | the default scaffold: light stamp, thin topbar, hero with a data-driven 3D field, scroll chapters, an operable scenario stage, linked receipts and sources |
| `templates/dossier.html` | retired tabbed scaffold, kept for reading old artifacts built on it |
| `scripts/check-packs.sh` | asserts shipped pack shape, token coverage, and that no dark block silently inherits neutral's colours |
| `scripts/check-prose.sh` | fails an authored page on slop fingerprints (em dashes, math symbols, arrow chains) outside code blocks |
| `scripts/check-artifact.sh` | pre-publish gate: unfilled placeholders, CSP-blocked hosts, missing toggle, loose hex, no-JS blank page |
| `scripts/smoke-artifact.ts` | runs the page's own scripts against a stubbed DOM; fails on an unfilled host or a stray NaN |
| `scripts/embed-fonts.sh` | base64 `@font-face` block from a local font directory, for a family Google Fonts does not carry |
| `scripts/build-gallery.sh` | regenerates `gallery.html` from the real CSS, so it can never drift |
| `../../bin/artifact` | the CLI: list, resolve, open, stamp, review, comments, wait, and `ds` for pack lookup |
