# Stripe

**Kind:** public brand · **Selector:** `data-ds="stripe"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
A cool-white canvas (`#f6f9fc`) with deep navy ink (`#0a2540`) and one confident indigo (`#635bff`). Almost no chrome: no borders where whitespace will do, no shadows where a tint will do. The register is *financial instrument* — precise, calm, and generous with space. Light-mode-native; the dark theme here is an extrapolation.

## Tokens
| Role | Light | Dark (extrapolated) |
|---|---|---|
| bg / surface / surface-2 | `#f6f9fc` · `#ffffff` · `#f0f4f8` | `#0a2540` · `#10314f` · `#163a5c` |
| ink / muted / faint | `#0a2540` · `#425466` · `#8898aa` | `#f6f9fc` · `#a3b4c6` · `#7d94ab` |
| border / border-strong | `#e3e8ee` · `#cfd7df` | `#1d4368` · `#2d5a86` |
| accent | `#635bff` | `#8f89ff` |
| radius | `8px` / `4px` | — |

**Type:** Söhne (`sohne-var` on Stripe's own site), display weight 600, tracking `-0.02em` tightening as size grows. Not obtainable in a published artifact — the Helvetica Neue fallback holds the proportions. Stripe sets even 56px display type at a *light* weight; resist bolding headlines.

## Signature moves
- **Whitespace as the separator.** Prefer air between sections over a rule or a card border.
- **One indigo.** It is the link, the button and the icon stroke — nothing else is coloured.
- **Navy, not black.** Every "black" on a Stripe surface is `#0a2540`. This is the single most identifying token.
- **Gradients exist** on Stripe marketing (cyan→indigo diagonal bands) but are a hero device only; one per page, or none.

## Do / don't
- **Do** let the page breathe — bump `.page` padding rather than filling space.
- **Do** keep body copy at `#425466`, not at full ink; Stripe's text hierarchy is soft.
- **Don't** use pure black or pure grey anywhere.
- **Don't** default to the dark theme for a Stripe-styled artifact; it is a reconstruction, not a real Stripe surface.

## Provenance
`#635bff`, `#0a2540` and `#f6f9fc` are Stripe's long-published brand colours, confirmed this session across multiple design-system extractions; `#425466` and `#8898aa` are the widely-documented text greys from Stripe's own site. Note the ambiguity found while grounding: current stripe.com uses **`#533afd`** as its site indigo while the brand mark remains `#635bff` — this pack uses `#635bff` as the more recognisable of the two. Stripe's internal system (Sail) is not public, so the dark theme and all status colours are **derived**.
