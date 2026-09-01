# Carbon — IBM

**Kind:** public brand · **Selector:** `data-ds="carbon"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
Swiss, engineered, unapologetically square. **Zero border radius** everywhere, no shadows at all, a strict grey ramp, and IBM Blue 60 (`#0f62fe`) as the only interactive colour. Light theme is the **White** theme (white page, `#f4f4f4` layers); dark is **Gray 100** (`#161616` page, layers *lightening* as they rise — the inverse of most systems).

## Tokens
| Role | White theme | Gray 100 theme |
|---|---|---|
| bg / surface | `#ffffff` · `#ffffff` | `#161616` (gray100) · `#262626` (gray90) |
| surface-2 (layer-02) | `#f4f4f4` (gray10) | `#393939` (gray80) |
| ink (text-primary) | `#161616` (gray100) | `#f4f4f4` (gray10) |
| muted (text-secondary) | `#525252` (gray70) | `#c6c6c6` (gray30) |
| faint (text-helper) | `#6f6f6f` (gray60) | `#8d8d8d` (gray50) |
| border (subtle) | `#e0e0e0` (gray20) | `#393939` (gray80) |
| border-strong | `#8d8d8d` (gray50) | `#6f6f6f` (gray60) |
| accent (interactive) | `#0f62fe` (blue60) | `#4589ff` (blue50) |
| ok / warn / bad | `#198038` · `#f1c21b` · `#da1e28` | `#24a148` · `#f1c21b` · `#fa4d56` |
| radius | `0` | `0` |

**Type:** IBM Plex Sans / IBM Plex Mono, both on Google Fonts, so link them rather than falling back: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">`. Plex carries most of Carbon character, so the Helvetica fallback is a real loss. Display weight 600, tracking 0.

## Signature moves
- **The 2x Grid.** Carbon lays out on a strict column grid with hard gutters — align panels to it and let edges touch rather than floating cards in whitespace.
- **Layering, not elevation.** A raised surface changes its grey step; `--shadow` is set to `none` in this pack on purpose.
- **Blue 60 and nothing else** for interaction. Status colours are for status only.

## Do / don't
- **Do** keep `--radius: 0`. A rounded Carbon artifact is not a Carbon artifact.
- **Do** let the type sit tight to the grid — Carbon is comfortable with dense, left-aligned blocks.
- **Don't** add a shadow, a gradient, or a soft tint background. Carbon has none.
- **Don't** centre body text or use a pull-quote flourish; `.maxim` is off-register here.

## Provenance
Full grey ramp and every accent hex read this session from the vendor package `@carbon/colors@11.32.0/lib/index.js` on unpkg. Theme role assignments (which grey is `layer-01`, `text-secondary`, `border-subtle`) follow Carbon's documented White / Gray 100 layering, cross-checked against carbondesignsystem.com. The `-soft` tints are `color-mix` derivations — Carbon's own blue10/red10 tint tokens were not read this session.
