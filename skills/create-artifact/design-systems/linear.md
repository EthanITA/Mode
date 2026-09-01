# Linear

**Kind:** public brand · **Selector:** `data-ds="linear"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
The reference "modern software" look: near-achromatic, extremely tight tracking, and **one** lavender-blue accent (`#5e6ad2`) used sparingly. Linear is a dark-first system — the light theme exists and is clean, but the recognisable Linear is the `#010102` floor with a four-step charcoal surface ladder.

## Tokens
| Role | Light | Dark (the signature) |
|---|---|---|
| bg | `#ffffff` | `#010102` |
| surface | `#fbfbfb` | `#0f1011` |
| surface-2 | `#f4f5f8` | `#18191a` |
| ink / muted / faint | `#08090a` · `#62666d` · `#8a8f98` | `#f7f8f8` · `#8a8f98` · `#62666d` |
| border / border-strong | `#e6e6e6` · `#d0d1d3` | `#23252a` · `#313337` |
| accent | `#5e6ad2` | `#828fff` (hover/raised variant) |
| radius | `8px` / `6px` | — |
| measure | `720px` | — |

**Type:** Inter (variable), display weight 600, **tracking `-0.022em`** — the tight tracking is as much a Linear tell as the accent. Inter is on Google Fonts, so link it: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">`.

## Signature moves
- **Accent scarcity.** One accent element per section — the mark, a focus ring, or a single CTA. A second one breaks the spell.
- **The surface ladder.** Cards sit one step above the floor, hovered/lifted elements one more. Never two adjacent panels on the same step.
- **Hairline borders over shadows** in dark mode; shadows disappear against `#010102` anyway.

## Do / don't
- **Do** ship it in dark if the artifact is a showpiece — but the base theme still loads light per the house rule, and the toggle switches it. Say in your summary that dark is the intended register.
- **Do** keep headings tight and short. Linear's voice is clipped.
- **Don't** use colour to categorise. Linear does that with typography and position.

## Provenance
Accent `#5e6ad2`, hover `#828fff`, dark floor `#010102` and the surface ladder `#0f1011 / #141516 / #18191a / #191a1b` come from published extractions of linear.app's own stylesheet, read this session. Linear publishes no token file, so the borders, the light-theme greys and the status colours are **derived** to fit the ladder — they are a faithful reconstruction, not vendor values.
