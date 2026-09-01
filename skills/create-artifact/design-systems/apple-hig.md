# Apple HIG

**Kind:** public brand · **Selector:** `data-ds="apple-hig"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
Grouped-background layout: the page floor is a light grey (`#f2f2f7`) and content sits on **white cards** floating on it — the inverse of most web systems, and the fastest way to read as Apple. Rounded 12px continuous corners, `#007aff` system blue, heavy display weights with very tight tracking, and pure black as the dark floor.

## Tokens
| Role | Light | Dark |
|---|---|---|
| bg (grouped background) | `#f2f2f7` | `#000000` |
| surface / surface-2 | `#ffffff` · `#e5e5ea` | `#1c1c1e` · `#2c2c2e` |
| ink / muted / faint | `#000000` · `#6c6c70` · `#8e8e93` | `#ffffff` · `#aeaeb2` · `#8e8e93` |
| border / border-strong | `#d1d1d6` · `#c7c7cc` | `#38383a` · `#48484a` |
| accent (systemBlue) | `#007aff` | `#0a84ff` |
| ok / warn / bad | `#34c759` · `#ff9500` · `#ff3b30` | `#30d158` · `#ff9f0a` · `#ff453a` |
| radius | `12px` / `8px` | — |

**Type:** SF Pro via `-apple-system` — the one system in this set that renders its **real** typeface with no CDN, on any Apple device. Display weight 700, tracking `-0.022em`.

## Signature moves
- **Inset grouped lists.** A rounded white card holding a stack of rows separated by hairlines that start after the label gutter — Apple's most distinctive layout unit.
- **Large title.** A heavy, tightly-tracked heading pinned left at the top, well above the content.
- **Colour only for state and action.** The system palette is saturated; use it in small doses.

## Do / don't
- **Do** float white cards on the grey floor rather than drawing borders on a white page.
- **Do** keep the corner radius generous and consistent.
- **Don't** treat these hexes as a spec — see provenance.
- **Don't** mix in a non-system accent; the point of the palette is that it is Apple's.

## Provenance
**Apple deliberately does not publish guaranteed hex values** — system colours are adaptive tokens (`systemBlue`, `label`, `systemBackground`) that resolve against the trait environment, and their rendered values shift between OS versions. That finding, plus `#007aff` (light) / `#0a84ff` (dark) systemBlue, `#8e8e93` secondaryLabel, `#ffffff` systemBackground and `#f2f2f7` secondarySystemBackground, was confirmed this session. Every value here is therefore **community-measured, not an Apple spec** — good enough for an artifact, wrong for an implementation that must match the OS.
