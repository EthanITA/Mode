# Geist — Vercel

**Kind:** public brand · **Selector:** `data-ds="geist"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
Absolute monochrome with one blue. Pure `#ffffff` or pure `#000000` as the floor, a flat grey ramp, `#171717` ink, and `#0070f3` reserved for links and one action. No warmth, no tint, no texture — the whole personality is contrast, tight tracking and the Geist typeface.

## Tokens
| Role | Light | Dark |
|---|---|---|
| bg / surface / surface-2 | `#ffffff` · `#ffffff` · `#f7f7f7` | `#000000` · `#0a0a0a` · `#171717` |
| ink / muted / faint | `#171717` · `#666666` · `#8f8f8f` | `#ededed` · `#a1a1a1` · `#737373` |
| border / border-strong | `#eaeaea` · `#d4d4d4` | `#333333` · `#4d4d4d` |
| accent | `#0070f3` | `#3291ff` |
| radius | `8px` / `6px` | — |

**Type:** Geist Sans / Geist Mono, display weight 600, tracking `-0.02em`. Both are on Google Fonts, so link them: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600&display=swap">`.

## How the Geist scale works
Geist numbers every scale 100–1000 and the number *is* the intent: **100–300** backgrounds (default / hover / active), **400–600** borders, **700–800** solid high-contrast fills, **900** secondary text, **1000** primary text. When you need a value this pack doesn't define, pick by intent on that ladder rather than inventing a tint.

## Signature moves
- **Pure black in dark mode**, not charcoal — with `#0a0a0a` cards a hair above it.
- **Borders do all the work.** Shadows are near-absent; a 1px `#eaeaea` is the entire card treatment.
- **Mono for metadata** — versions, hashes, regions, timings.

## Do / don't
- **Do** keep the palette achromatic. One blue, and only where something is clickable.
- **Don't** soften the corners past 8px or add a coloured hero.
- **Don't** introduce a second accent for status; Geist tolerates red/amber/green only as small state dots.

## Provenance
The scale semantics (100–1000 intent ladder), the ten scale names and the step assignments were read this session from vercel.com/geist/colors. The hexes `#f7f7f7` (gray-100), `#404040` (gray-700), `#0a0a0a` (gray-950), `#171717` (ink) and `#0070f3` (blue) come from published Geist extractions read this session; the remaining greys and all status colours are **derived** to sit correctly on that ladder. Vercel publishes the scale structure but not a flat token file.
