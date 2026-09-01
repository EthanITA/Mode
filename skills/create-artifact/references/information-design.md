# Information design: no walls of text

A generated document narrates everything in prose. A human author shows first and tells second: numbers become a chart, comparisons become a table, flows become a diagram, formulas become typeset math. The failure runs in both directions, and both read machine-made: prose that should have been a figure, and figures that carry no information (decoration).

## Choose the form by the shape of the information

| Information shape | Form | How in this stack |
|---|---|---|
| Process, flow, lifecycle, handshake | Flowchart or sequence diagram | Mermaid, native in published artifacts; many diagrams or local viewing means pre-rendered SVG per SKILL §7 |
| System structure, topology, boundaries | Block diagram | Mermaid, or hand SVG with the `artifact-diagramming` skill |
| Few items compared on few axes | Table | The pack's `.table-wrap` classes |
| Trend, distribution, share, magnitude over time | Chart | Inline SVG per the `dataviz` skill, loaded before the first chart line |
| Formula, relationship, cost model | Typeset math | KaTeX pre-rendered at build time (its CDN is CSP-blocked, SKILL §7); never ASCII math in a sentence |
| Decision logic, branching rules | Decision table | Input columns, one row per rule, an outcome column; never nested prose conditionals |
| KPI, headline magnitude | Stat tiles | `.stats .stat` per `dataviz` |
| Chronology, plan, phases | Timeline | Mermaid timeline or gantt |

## Rules

1. **Anchor every major section.** At least one non-prose element (figure, table, chart, equation, callout) a reader can grasp without the surrounding text.
2. **Flip test.** Leafing through headings and figures alone must tell the story. If it does not, the figures illustrate the wrong things.
3. **Assertion captions.** A caption states the takeaway ("Latency doubles past 100 concurrent sessions"), not the topic ("Latency chart").
4. **Maximum text run.** Never more than four consecutive paragraphs without a structural break. A longer run has structure buried in it; lift the structure into its visual form.
5. **Information, not decoration.** A figure must replace prose. Two numbers earn a sentence or a stat pair, never a pie chart. Decorative infographics are the machine tell in the opposite direction.
6. **Math is typeset.** Any expression past one inline variable gets real math rendering, each symbol glossed at first use, units carried. This is where the symbols banned from prose belong.
7. **More than three numbers in a paragraph** become a table or a chart.

## Before and after

**Narrated numbers, should be a chart**
- ❌ Resolution succeeded in 82% of cases, fell back to the portfolio link in 11%, and produced no link in 7%.
- ✅ A three-bar chart or stat row carries the numbers; the prose keeps only the takeaway: "Nine answers in ten carry a direct link."

**Prose conditionals, should be a decision table**
- ❌ If the source is holdings and the wrapper is execution-only, link it; otherwise, if exactly one wrapper is eligible, use it; otherwise, if the query named one...
- ✅ A decision table: input columns, one row per rule, outcome column. Seven rules become seven scannable rows.

**ASCII math in a sentence, should be a display equation**
- ❌ eligible = availableIn ∩ customerWrappers, written inline in a paragraph.
- ✅ A pre-rendered KaTeX display equation, with each symbol glossed underneath in plain words.

## Mechanical check

`scripts/check-prose.sh` also gates structure: it fails a run of more than four consecutive paragraph blocks with no structural break, and a document with no visual element at all.
