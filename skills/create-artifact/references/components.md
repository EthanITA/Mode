# The component kit

`assets/kit.html` is one block of CSS and one runtime, installed between `<!-- cx:start -->` and `<!-- cx:end -->` before `</head>`. `artifact new` puts it in every page it scaffolds and `artifact kit <slug>` refreshes it in a page that already has it, so never paste it by hand and never edit it inside a page. `references/components.html` runs every component below on real markup: open it to see them, copy from it to build.

## Pick by subject

The ground rules ask that the reader can do the subject's thing. Each of those maps onto the same figure engine, so one markup pattern covers all of them.

| The subject                     | Build it as                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Any page                        | A `cx-verdict` in the hero, so the answer comes first                                                                                 |
| A bug or incident               | A figure: a seg group of the real cases, a checkbox for the fix, a `cx-steps` list per case, a `data-cx-pick` verdict                 |
| A frontend change               | A figure: a seg group of the variants, one `data-cx-show` pane each holding the mockup                                                |
| A backend flow or state machine | A figure: a seg group or select of inputs, the hops as `cx-steps`, a pick for the first gate that stops it                            |
| Data, volume, blast radius      | `data-cx="table"` over the exported rows with facets on the columns that split them, `cx-bars` beside it                              |
| A comparison or decision        | A figure: ranges and numbers for the assumptions, named outputs for the math, bars that move with them, a pick for the recommendation |

## The contract

- Every class is `cx-*` and every hook is `data-cx*`. Never restyle a pack class, and treat the attribute names as public, because refreshing an old page depends on them.
- The opening state is authored HTML. Outputs carry the value the defaults produce, and the runtime recomputes them on load, so a mismatch shows up as a jump.
- With script off, blocks without `hidden` stack into the document. Give `hidden` only to the outcomes that contradict the default one, such as the other verdicts in a pick.
- Your own CSS on the page reads `--cx-*` tokens (`--cx-bg --cx-surface --cx-surface-2 --cx-ink --cx-muted --cx-faint --cx-border --cx-border-strong --cx-accent --cx-accent-ink --cx-accent-soft --cx-ok --cx-warn --cx-bad`, each status with a `-soft`, plus `--cx-radius --cx-radius-sm --cx-sans --cx-mono --cx-ease`). They resolve from the generic contract or a self-contained pack's own names, so the same page works under any pack.

## Layout, CSS only

| Class                                                 | What                                                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cx-topbar`                                           | fixed thin bar: a `<strong>` brand, the rail, and the pack's `.theme-toggle`                                                                                                                                  |
| `nav.cx-rail` with `data-cx="rail"`                   | the chapter index in the topbar, `aria-current` follows the chapter in view, hidden on narrow screens                                                                                                         |
| `cx-hero`                                             | hero band, a `<canvas>` child fills it behind the text                                                                                                                                                        |
| `cx-wrap`                                             | the 70rem content column                                                                                                                                                                                      |
| `cx-label`                                            | the micro-label type role, for every small uppercase label                                                                                                                                                    |
| `cx-lede`, `cx-accent`                                | the hero's sub line, and the accent-coloured half of a headline                                                                                                                                               |
| `cx-chapter`, `cx-chapter-head`, `cx-num`             | a scroll chapter with the id the rail links to, and its numbered head                                                                                                                                         |
| `cx-verdict` with `data-tone="ok\|warn\|bad\|accent"` | the headline answer band, accent when no tone, live inside a figure's pick                                                                                                                                    |
| `cx-bars` > `cx-bar` > `cx-track` > `cx-fill`         | a bar list: the fill's `style="--v:.42"` is its length from 0 to 1 and the value text follows it inside the track. Every bar is muted, and `data-tone="accent"` on a `cx-bar` marks the one the text is about |
| `details.cx-more`                                     | folded detail, a glossary entry or a question, stacked into one ruled list, with `data-tone="ok\|warn\|bad"` putting a status dot before the summary                                                          |

Bars carry no status colours, because a status needs a label beside it and the summary of a toned `cx-more` is that label. Scale `--v` so the longest bar is 1.

```html
<header class="cx-topbar">
  <strong>Brand</strong>
  <nav class="cx-rail" data-cx="rail" aria-label="Chapters">
    <ol>
      <li><a href="#ch-1">Short name</a></li>
    </ol>
  </nav>
  <button type="button" class="theme-toggle" data-cx="theme" aria-label="Switch to dark theme">
    (the two pack icons)
  </button>
</header>
<header class="cx-hero">
  <div class="cx-wrap">
    <span class="cx-label">Eyebrow</span>
    <h1>The claim,<br /><span class="cx-accent">with the tension in it.</span></h1>
    <p class="cx-lede">One or two sentences from the reader's side.</p>
    <p class="cx-verdict" data-tone="bad"><strong>The answer first.</strong> Why, in one line.</p>
  </div>
</header>
<section class="cx-chapter" id="ch-1">
  <div class="cx-wrap">
    <div class="cx-chapter-head reveal">
      <span class="cx-num">01</span>
      <h2>A heading that answers a question</h2>
    </div>
  </div>
</section>
```

## The figure

`<figure class="cx-figure" data-cx="figure">` holds a `cx-controls` bar, a `cx-body` and a `figcaption.cx-caption`. Each control is a variable, named once, and every expression inside the figure reads all of them. Wrap each control in `cx-control` with a `cx-label`, and put an input and its output side by side in a `cx-row`.

| Control                                                                                | Variable | Value                        |
| -------------------------------------------------------------------------------------- | -------- | ---------------------------- |
| `div.cx-seg[role=group][data-cx-name=x]` of `button[type=button][value][aria-pressed]` | `x`      | the pressed button's `value` |
| `input[type=range\|number][name=x]`                                                    | `x`      | the value                    |
| `select[name=x]`                                                                       | `x`      | the selected value           |
| `input[type=checkbox][name=x]`                                                         | `x`      | `true` or `false`            |
| `input[type=radio][name=x]`                                                            | `x`      | the checked one's value      |

A value that reads as a number becomes a number. Names must be JavaScript identifiers.

A seg group swaps one figure's state, so its panes hold a variant of the figure and never chapters of prose. That is §2's "no tab bars" kept by construction.

| Hook                   | Does                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `data-cx-expr="a * b"` | sets the element's text to the result. With `name="c"` on an `output`, `c` joins the scope for every other expression                  |
| `data-cx-format`       | `int`, `number:2`, `percent`, `percent:1`, `currency:EUR`, `currency:EUR:0`, `compact`, through Intl.NumberFormat in the page's `lang` |
| `data-cx-show="expr"`  | toggles `hidden` on the element                                                                                                        |
| `data-cx-pick`         | on a container: shows the first child whose `data-cx-when="expr"` holds, a child without one is the fallback                           |
| `data-cx-bar="expr"`   | on a `cx-fill`: sets `--v`, clamped to 0 to 1. Put an `output[data-cx-expr]` after it in the track for the value text                  |

Named outputs are computed first, in document order, then everything else, so a bar may sit before the value it reads. A named output reads only the named outputs above it, because a forward reference throws and keeps the authored value. An expression that throws or comes out as NaN or Infinity leaves the authored text in place and warns once in the console. Expressions are plain JavaScript run through `new Function`, which a local page allows and a published one blocks.

When a block is newly shown, its `li.cx-step` children step in one after another, and under reduced motion they appear at once. A `ol.cx-steps` list draws the hops, `data-state="ok|warn|bad"` marks each dot, and a `span.cx-out` under the hop's name holds what it returned.

```html
<figure class="cx-figure" data-cx="figure">
  <div class="cx-controls">
    <div class="cx-control">
      <span class="cx-label">Order</span>
      <div class="cx-seg" role="group" aria-label="Order" data-cx-name="order">
        <button type="button" value="buy" aria-pressed="true">Buy</button>
        <button type="button" value="sell" aria-pressed="false">Sell</button>
      </div>
    </div>
    <label class="cx-control"
      ><span class="cx-label">Fix</span>
      <span class="cx-row"><input type="checkbox" name="fixed" /> With the patch</span></label
    >
  </div>
  <div class="cx-body">
    <div data-cx-show="order == 'sell'">
      <p class="cx-label">Sell</p>
      <ol class="cx-steps">
        <li class="cx-step" data-state="ok"><strong>Gateway</strong><span class="cx-out">202 accepted</span></li>
        <li class="cx-step" data-state="bad" data-cx-show="!fixed">
          <strong>Ledger</strong><span class="cx-out">409 duplicate</span>
        </li>
      </ol>
    </div>
    <div data-cx-pick>
      <p class="cx-verdict" data-tone="bad" data-cx-when="order == 'sell' &amp;&amp; !fixed" hidden>
        The sell is booked twice.
      </p>
      <p class="cx-verdict" data-tone="ok">One booking per order.</p>
    </div>
  </div>
  <figcaption class="cx-caption">What the takeaway is, in one sentence.</figcaption>
</figure>
```

Write `&&` as `&amp;&amp;` and a comparison with `<` or `>` as `&lt;` or `&gt;` inside an attribute, so the gates parse the tag cleanly.

## The table

```html
<div class="cx-table">
  <table data-cx="table" data-cx-count="{n} of {total} orders">
    <caption>
      84 orders, 6 rejected
    </caption>
    <thead>
      <tr>
        <th>Order</th>
        <th data-cx-facet>Status</th>
        <th class="cx-n">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>A-17</td>
        <td>Rejected</td>
        <td class="cx-n" data-cx-value="1240.5">1,240.50</td>
      </tr>
    </tbody>
  </table>
</div>
```

The runtime puts a toolbar above the table: a search box, one chip group per `th[data-cx-facet]`, and a live count. Every header becomes a sort button, numeric when every cell in the column reads as a number, with `data-cx-value` giving the number for a formatted cell. `data-cx-count`, `data-cx-search` and `data-cx-all` translate the count, the search placeholder and the "All" chip. With script off the reader gets the whole table and no dead controls, so the caption carries the full count.

## What the runtime adds on its own

| Hook                                            | Does                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `data-cx="theme"` on the pack's `.theme-toggle` | flips `data-theme`, keeps the `aria-label` naming the destination, fires `themechange` on `window` so a canvas can recolour |
| `.reveal`                                       | the fade-in-up, using the pack's own `.js .reveal` rules, staggered among siblings                                          |
| `data-count="1240"`                             | counts up to the number already written in the element                                                                      |

The head script stamps `data-theme="light"` when the page has none and adds `.js` only when the observer that reveals blocks exists and reduced motion is off. If the reveal fails to start, `.js` comes off again, so a broken script never leaves the page blank.
