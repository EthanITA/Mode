# Visual coherence: how a page holds together

Reverse-engineered from `~/Notes/tasks/spacex-2026-analysis/`, which is this skill's own output at its best. Every mechanism below is stated so it transfers to any pack. None of it is about black and white.

**The thesis.** Coherence does not come from styling each component to match the others. It comes from **removing the axes along which they could differ**. Decide once, globally, and every component inherits the decision for free. A page whose panels, tables, chips, callouts, figures and tooltips all agree, without anyone having matched them by hand, is a page where the axes were closed early.

## One geometric decision, propagated

That page sets `--radius: 0`, `--shadow: none`. What follows is not a style, it is an inevitability: with no corner radius and no elevation, **every surface can only be described by a 1px border**. Panels, table wrappers, chips, callouts, stat cells, figures, the tooltip and the theme toggle are then the same object at different sizes, and nobody had to coordinate them.

The transferable move is not "use zero radius". It is: **pick the one or two properties that define surface identity in your pack, fix them globally, and let every component express itself through the same small vocabulary.** A pack that leans on soft radii and warm shadows gets its coherence the same way, from the other end.

Corollary: the moment a component needs a second mechanism to look right (a shadow *and* a border *and* a tint), the axes have reopened and the page starts to drift.

## Colour reserved for meaning

The accent equals the ink. There is no brand colour anywhere on the surface, which means **every colour on the page is semantic**: success, warning, danger, info, and a directional up and down pair for numbers that moved.

The effect is leverage. On a page where nothing is coloured for decoration, one green number carries real signal. On a page where the header, the buttons and three panels are already brand-coloured, that same green is noise.

Even in a pack with a strong brand colour, the discipline holds: **spend brand colour on identity (one or two places), never on the body.** If a reader cannot tell your semantic red from your decorative accent at a glance, the semantic layer has been spent.

## The micro-label is a type role, not a component style

The single largest coherence win in that file, and the least obvious. Look at what these have in common:

| Element | Size | Tracking |
|---|---|---|
| `.eyebrow` | 11px | 0.22em |
| `.panel-title` | 10px | 0.20em |
| `.callout-label` | 9.5px | 0.20em |
| `.stat .label` | 9.5px | 0.18em |
| `th` | 9.5px | 0.16em |
| `.chip` | 9.5px | 0.14em |

Every small label on the page is the **same object**: around 9.5 to 11px, weight 700, uppercase, wide tracking, muted. It is not six component styles that happen to look similar. It is one type role reused, and it is why the page reads as one system even where the components are unrelated.

Define that role once for your pack and reach for it everywhere a label appears. Tracking loosens slightly as the label grows, which is correct: uppercase needs more tracking at small sizes, less at large.

## Two families, strict jobs, and tabular numerals

One family carries structure and language. One carries numbers and identifiers. Nothing crosses over.

The detail that makes a data-heavy page readable is `font-variant-numeric: tabular-nums`, applied to every number that sits in a column or updates in place: the ticker values, numeric table cells, stat values, tooltip figures. Without it, digits have different widths, columns wobble, and a live-updating number visibly jitters. It costs one line and it is the difference between a table and a spreadsheet screenshot.

Right-align numeric columns and give them the mono family. Left-align text. This is old typesetting, and it still decides whether a table can be scanned.

## Measure is set per content type, not once

Different content is read differently, so it gets different line lengths:

- Body paragraphs, 74ch. Read word by word.
- The lede, 68ch. Slightly shorter so it reads as an opening rather than a paragraph.
- Callout text, 70ch. Inset, so it needs its own bound.
- Captions, 82ch. Scanned rather than read, so they tolerate more.
- The pull-quote, 30ch. Declaimed, so it must break early and often.

A single global `max-width` on the container cannot do this. Set the measure on the element whose reading behaviour it governs.

## Visualisation gets its own token set

Charts are not styled ad hoc against the page tokens. They have named roles of their own: a chart surface, a grid colour, an axis colour, a track, and an **ordered series ramp**.

That ramp is the part worth stealing. Three steps from strong to faint, in one hue family, let a multi-series chart stay readable without spending colour on it, and it themes correctly in both light and dark because the roles are defined twice. Direction gets its own pair, up and down, kept distinct from success and danger even when the values look similar, because a falling price is not an error.

Load `dataviz` before writing chart code. This section is only the token architecture that lets a chart belong to the page.

## The hairline grid

A grid of stat cells uses `gap: 1px` over a container that has a border and a background. The gap reveals the container behind it as a one-pixel rule between cells. One border, no doubling, no `:last-child` exceptions, and it stays correct when the grid reflows at any breakpoint.

## Structure: name the views after the reader's questions

The navigation reads: Verdict, The listing, The float, The business, The numbers, Macro, The plan, Glossary. Not Overview, Analysis, Financials, Appendix.

**The tabs are the questions a reader would ask, in the order they would ask them**, and the first one is the answer rather than the setup. That single choice does more for readability than any amount of styling, because a reader who knows which question a section answers can skip straight to it.

The headline follows the same rule. "Insiders paid $6.48. You are asked to pay $141." is a claim with the tension inside it. A topic ("SpaceX IPO analysis") makes the reader do the work of discovering why they should care.

Other structural moves worth reusing:

- **The glossary is its own view**, so the narrative never stops to define a term and a reader who needs the definitions can get all of them at once.
- **Progressive disclosure through stacked `<details>`**, negatively margined so a run of them reads as one bordered list rather than a pile of boxes. Custom `+` and `−` markers, since the default triangle belongs to no design system.
- **Data holes filled at runtime.** The markup carries empty elements with ids and the script fills them from data, so the page is a template and the numbers have exactly one source. Nothing is typed twice and nothing can go stale in one place but not another.
- **Emphasis redefined.** Italic is replaced with a dotted underline, because the display family has no convincing italic and a dotted rule reads as "term of art" on a page full of them. Redefine `em` and `strong` to mean what your document actually needs.

## Restraint is not the absence of ambition

That page has essentially no animation. One tooltip fades at 0.1s, and a reduced-motion block sits at the bottom. It is still a showpiece, because the impressiveness lives in the density of real information, the quality of the typesetting and the fact that every number is sourced.

Keep this next to `showpiece.md`. A showpiece is a page where every decision was made deliberately. Sometimes that produces WebGL. Often it produces a page that simply refuses to waste the reader's attention.
