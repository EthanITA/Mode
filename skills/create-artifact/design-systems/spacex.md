# SpaceX

**Kind:** public brand · **Selector:** `data-ds="spacex"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
Cinematic industrial: void black, one cooled white, no decorative colour. Photography does the drama on spacex.com; a document inherits the hull-stencil instead — D-DIN / DIN Alternate, positive tracking on display type, square corners, hairline borders, ghost buttons. The marketing site is dark-first. Light exists because the shop is white paper with black ink. Dark is the register that reads as SpaceX.

## Tokens
| Role | Light (shop) | Dark (marketing, the signature) |
|---|---|---|
| bg / surface / surface-2 | `#ffffff` · `#ffffff` · `#f0f0fa` | `#000000` · `#0a0a0a` · `#121214` |
| ink / muted / faint | `#000000` · `#5a5a5f` · `#545457` | `#f0f0fa` · `#a8a8b0` · `#545457` |
| border / border-strong | `#e0e0e8` · `#404040` | `#3a3a3f` · `#545457` |
| accent | `#000000` | `#f0f0fa` |
| radius | `0` | `0` |

**Type:** D-DIN / DIN Alternate, display weight 700, tracking `0.04em` (positive). D-DIN is CDN-blocked in a published artifact; DIN Alternate / Helvetica Neue keep the industrial geometry. Shadows are none in both themes.

Named vendor colours used as anchors: Void Black `#000000`, Star / Spectral White `#f0f0fa`, Dim Steel `#545457`, Dark Gunmetal `#404040`.

## Signature moves
- **No colour accent.** Black or star-white is the only action colour. Status greens and reds stay tiny.
- **Stencil voice on chrome.** Eyebrows, nav, chips: uppercase and tracked. Body copy stays sentence case so a study brief remains readable.
- **Ghost chrome.** 1px ink/star-white outline, transparent fill. Zero radius, zero shadow.

## Do / don't
- **Do** ship the showpiece in dark — the base theme still loads light per the house rule, and the toggle switches it. Say that dark is the intended register.
- **Do** keep the palette to black + `#f0f0fa`. Dim steel is supporting only.
- **Don't** add a rocket-red CTA, a sky-blue link, or a gradient. Colour on spacex.com is photography, not UI.
- **Don't** round the corners. The hull is square.

## Provenance
Void Black `#000000`, Star/Spectral White `#f0f0fa`, Dim Steel `#545457` and Dark Gunmetal `#404040` were read this session from published SpaceX design-system extractions (Refero Styles spacex pack; Open Design / design.md D-DIN tables) that document spacex.com. SpaceX publishes no token file. Light-theme shop ink `#000000` / mute `#5a5a5f` and hairline `#e0e0e8` come from the same reconstructions of the shop surface. Status colours and the dark surface ladder (`#0a0a0a` / `#121214`) are **derived** to sit on that black–white axis. Not vendor values.
