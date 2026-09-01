# Notion

**Kind:** public brand · **Selector:** `data-ds="notion"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
The document-first look: white page, **warm** near-black ink (`#37352f` — brown-cast, never `#000`), warm grey second surface (`#f7f6f3`), tiny 4px radii and a single cyan-blue (`#2eaadc`) for links. Almost no borders. The character comes from the warmth of the neutrals and from serif display type against a sans body.

## Tokens
| Role | Light | Dark |
|---|---|---|
| bg / surface / surface-2 | `#ffffff` · `#ffffff` · `#f7f6f3` | `#191919` · `#202020` · `#2f2f2f` |
| ink / muted / faint | `#37352f` · `#787774` · `#9b9a97` | `#d4d4d4` · `#9b9b9b` · `#7f7f7f` |
| border / border-strong | `#e9e9e7` · `#dfdedc` | `#2f2f2f` · `#454545` |
| accent | `#2eaadc` | `#529cca` |
| ok / warn / bad | `#448361` · `#cb912f` · `#d44c47` | `#4f9768` · `#c29343` · `#d9730d` |
| radius | `4px` / `3px` | — |
| measure | `720px` | — |

**Type:** Lyon Text (serif) for display, Inter for body. Lyon is licensed and genuinely unobtainable, so `--display` keeps its Georgia-led serif fallback; Inter is on Google Fonts and should be linked: `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">`. Display weight 600, tracking `-0.01em`.

## Signature moves
- **Serif headings on a sans body.** Turning this off is what makes a Notion imitation read as generic.
- **Warm neutrals.** Every grey has a brown cast; a cool grey immediately breaks it.
- **Desaturated block colours.** Notion's coloured callouts are pale washes behind normal-weight text, never saturated banners — the `--*-soft` tints here are tuned for that.
- **Content blocks, not cards.** Sections separate by spacing and a small icon, not by a bordered panel.

## Do / don't
- **Do** use `.callout` heavily — it is the native Notion idiom.
- **Do** keep the radius tiny. 4px is the whole corner language.
- **Don't** use shadows or a coloured hero band.
- **Don't** reach for emoji in a work-facing artifact even though Notion itself does; that is a product affordance, not a document one.

## Provenance
`#37352f` (body ink), `#ffffff`, `#e3e2de` and the `#2eaadc` accent are Notion's documented brand values, confirmed this session. Notion publishes no design-system token file, so the neutral ladder, the dark theme and the status colours are a **reconstruction** of the product surface, not vendor values.
