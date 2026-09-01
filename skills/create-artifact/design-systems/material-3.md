# Material 3 — Google

**Kind:** public brand · **Selector:** `data-ds="material-3"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
The M3 **baseline** scheme — the purple-seeded default every Material 3 app starts from. Tonally tinted neutrals (the greys are violet-cast, never true grey), generous 12px corners, and `#6750a4` primary. Surfaces stack by *tone*, not by shadow: `surface` → `surface-container` → `surface-container-high`.

## Tokens
| Role | Light | Dark |
|---|---|---|
| bg (surface) | `#fef7ff` (neutral98) | `#141218` (neutral6) |
| surface (container) | `#f3edf7` (neutral94) | `#211f26` (neutral12) |
| surface-2 (container-high) | `#ece6f0` (neutral92) | `#2b2930` (neutral17) |
| ink (on-surface) | `#1d1b20` (neutral10) | `#e6e0e9` (neutral90) |
| muted (on-surface-variant) | `#49454f` (nv30) | `#cac4d0` (nv80) |
| faint / border-strong (outline) | `#79747e` (nv50) | `#938f99` (nv60) |
| border (outline-variant) | `#cac4d0` (nv80) | `#49454f` (nv30) |
| accent (primary) | `#6750a4` (p40) | `#d0bcff` (p80) |
| accent-ink (on-primary) | `#ffffff` (p100) | `#381e72` (p20) |
| accent-soft (primary-container) | `#eaddff` (p90) | `#4f378b` (p30) |
| secondary / tertiary | `#625b71` · `#7d5260` | `#ccc2dc` · `#efb8c8` |
| bad (error) | `#b3261e` (e40) | `#f2b8b5` (e80) |
| radius | `12px` / `8px` | — |

**Type:** Roboto, on Google Fonts, so link it: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap">`. Display weight 500, tracking 0 (M3 does **not** tighten headline tracking; leaving `--tracking-tight` at 0 is deliberate).

## Signature moves
- **Tonal elevation, not drop shadows.** Raise a surface by moving it up the container ramp, not by adding a shadow.
- **Filled tonal buttons** — `--accent-soft` background with `--accent`-derived text is the M3 button that reads most "Material".
- **Full-round pills** for chips and FAB-like affordances.

## Do / don't
- **Do** keep the violet cast in the neutrals. Swapping them for true greys is the single fastest way to stop looking like M3.
- **Don't** use `--shadow` on cards; use `--surface-2`.
- **Don't** re-seed the palette by hand. If a different seed colour is wanted, say so — generating a correct M3 scheme needs the HCT tonal-palette algorithm, not eyeballed tints.

## Provenance
Role→tone mapping read this session from `material-components/material-web` `tokens/versions/v0_192/_md-sys-color.scss`; every hex read from `_md-ref-palette.scss` in the same repo. The 12px/8px corner values and the Roboto family are the documented M3 shape and type scales, stated from the spec but not re-read from source this session.
