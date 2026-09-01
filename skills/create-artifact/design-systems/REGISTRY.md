# Design-system registry

Read **this file only** to resolve the design system. Then read **one** pack, the one you picked. Never load all of them.

## The house default

| Key | Whose | Look in one line | Stylesheet |
|---|---|---|---|
| `neutral` | nobody, brand-free | Warm off-white, one indigo, considered but unbranded | `doc-system.css` + `themes.css` |

## Public brand systems

Every public pack inlines `assets/doc-system.css` then `assets/themes.css`.

| Key | Brand | Look in one line | Grounding |
|---|---|---|---|
| `primer` | GitHub | Functional and dense; 6px corners, borders not shadows, `#0969da` blue | vendor CSS, verbatim |
| `material-3` | Google | Baseline M3: violet-cast neutrals, tonal elevation, 12px corners | vendor palette + role map |
| `carbon` | IBM | Swiss and square: zero radius, no shadows, IBM Blue 60 | vendor colour package |
| `linear` | Linear | Near-achromatic, very tight tracking, one lavender accent, `#010102` dark | site extraction + derived |
| `geist` | Vercel | Absolute monochrome plus one blue; pure black dark mode | partial vendor + derived |
| `stripe` | Stripe | Cool-white canvas, deep navy ink, one indigo, lots of air | brand values + derived |
| `notion` | Notion | Document-first: warm brown-black ink, 4px corners, serif headings | brand values + reconstruction |
| `apple-hig` | Apple | White cards on a grey floor, 12px corners, SF Pro, system blue | community-measured |
| `spacex` | SpaceX | Void black, star-white `#f0f0fa`, D-DIN stencil, zero radius, no colour accent | site extraction + derived |

**Unsure which one the user wants?** `references/gallery.html` renders all ten shared-stylesheet systems in one switchable page. Open it rather than describing them from memory.

**"Grounding" is load-bearing.** `vendor` means every hex was read from the vendor's own published token file. `derived` / `reconstruction` means the accent and a few anchors are real and the rest was built to fit. Each pack's `## Provenance` section says exactly which is which; quote it if the user asks how faithful a pack is.

## User packs

Your own design systems live in `~/.claude/mode/design-systems/` (under `CLAUDE_CONFIG_DIR` when that is set), the same extension layer that holds user modes, styles and rules. A plugin update never touches that directory.

- Resolution order is shipped first, then the user directory, and a user pack sharing a shipped key **wins**, exactly as user contracts do.
- `artifact ds` lists every resolvable key with the file that answers for it; `artifact ds <key>` prints the winning pack file.
- If `~/.claude/mode/design-systems/REGISTRY.md` exists, read it straight after this file: it lists the user's keys and any context rules for inferring them (a directory or a topic that implies a pack without the user naming it).
- A user pack may be **self-contained**: one stylesheet of its own instead of `doc-system.css` + `themes.css`. Its pack file says which, and whether `data-ds` applies or the stylesheet scopes on `data-theme` alone.

## How to use a pack

1. Resolve the key (see the skill's §3).
2. Read the pack file `artifact ds <key>` points at, and nothing else from these folders.
3. Inline the stylesheets that pack names, in order.
4. Add the Google Fonts link the pack gives, when it gives one: that host is the only external one the published-artifact CSP allows.
5. Stamp the root: `<html data-ds="<key>" data-theme="light">`. A self-contained pack may ignore `data-ds`; its file says so.

## Adding a pack

Your own pack goes in `~/.claude/mode/design-systems/`; a contribution to the shipped set goes here. Either way:

1. Ground it. Find the vendor's published token file. The npm dist CSS on unpkg (`https://unpkg.com/<pkg>/dist/...`) is usually the shortest path to literal hex values, and the marketing docs page usually is not (it renders client-side and fetches as an empty shell).
2. For a shipped pack, add a `:root[data-ds="<key>"]` block and its `[data-theme="dark"]` twin to `assets/themes.css`, defining at minimum: `--bg --surface --surface-2 --ink --muted --faint --border --border-strong --accent --accent-ink --accent-soft --ok --warn --bad --info` and their `-soft` pairs. Use literal vendor hexes where you read them; use `color-mix` for tints you did not. A user pack ships the same blocks in its own CSS file beside the pack instead.
3. Copy any pack's `.md` as the template. The required sections are `## Identity`, `## Tokens`, `## Do / don't`, `## Provenance`, and a `**Kind:**` line. `scripts/check-packs.sh` enforces exactly this for the shipped set.
4. Add a row above (or to your user REGISTRY.md).
5. Run `bash scripts/check-packs.sh`.
