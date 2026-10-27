# The brief path

A brief is a one-screen `.md` the reader scans and comments on in the sidecar: a plan, a brief, a task, a catch-up. It is first an alignment check, so it draws the structure and lets the reader put a comment on the block that is wrong. Build it in minutes and load nothing else: no html reference, no design system, and no `check-artifact` pass, since a `.md` has none.

## Shape

| Part                        | What it carries                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `# Title`                   | the subject and the page's job, "Sidecar task board, the plan"                                                                                                       |
| Opening, one to three lines | what the page is for, where the decisions behind it live, what to comment on, and what the edge colours mean when the diagrams use them                              |
| `##` sections               | one topic each, a sentence or two of context, then its diagram, table or card. The sidecar starts a commentable section at every `##`, so a comment lands on a topic |
| The last section            | each call you took or gap you filled, one sentence apiece, under a heading like "Decisions I took, yours to overrule" or "Where I filled a gap, say if wrong"        |

The first screen carries the read: the title, the opening and the first diagram tell the whole story, and every section below expands one part of it. Prose keeps only what a diagram cannot carry, such as the pain, a constraint, a decision or a gap, in short paragraphs.

## Draw it

Pick the form by the information's shape. The sidecar renders only the headers below, and any other, such as `pie`, `gantt`, `timeline` or `mindmap`, fails and shows its raw source.

| The information                            | Form                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Roles, ownership, who talks to whom        | `flowchart TD`, one node per role as `[Name<br/>what it owns]`, one edge per relationship, `subgraph` for a group |
| An experience, a flow, phases, build order | `flowchart LR`, each edge label saying what moves along it                                                        |
| A lifecycle                                | `stateDiagram-v2`, every transition labelled with its trigger                                                     |
| A handshake between parties                | `sequenceDiagram`, with `participant X as Name`                                                                   |
| A data model or a set of types             | `erDiagram` or `classDiagram`                                                                                     |
| Numbers across a few categories            | `xychart-beta` with `bar` or `line`                                                                               |
| A few items compared on a few axes         | a markdown table                                                                                                  |
| A terminal or other text screen            | a `text` fence, drawn the way it looks                                                                            |

When some edges need the reader and the rest run on their own, colour them and say so once in the opening: `linkStyle default stroke:#7c3aed` for the ones that run alone, then `linkStyle 0,2 stroke:#d1344b,stroke-width:2px` for the reader's. It works in flowcharts and state diagrams, and the indexes count edges from 0 in the order they are written, so recount after moving one.

## A plan is one card per ask

The opening diagram draws the whole experience with the piece that carries each step, then each ask is a `### N. Name` card holding a two-column table, so the reader judges every ask on the same rows:

|           |                                                                                         |
| --------- | --------------------------------------------------------------------------------------- |
| Problem   | what is missing today                                                                   |
| Pain      | what that costs the reader                                                              |
| Impact    | what changes once it ships, with the number when there is one                           |
| Solution  | what gets built                                                                         |
| Mechanism | what it builds on, citing the `path:line` it reads or the link to the ticket or message |
| Model     | the model it runs on, or none                                                           |

## A task is a brief with four parts

A task the sidecar lists on its board opens with one line saying where it came from, then `## Problem`, `## Pain point`, `## Solution` and `## Impact`, and it is stamped with `--project`, `--state` and `--lead` as well as its title.

## Ship it

1. Write `<artifacts dir>/<slug>.md`. Pick a slug no page holds, because a `.md` beside an `.html` of the same slug lists as that page's brief.
2. `artifact stamp <slug> --title "<title>"` writes the metadata block at the top. A task adds `--project <lane> --state <state> --lead "<the running conversation's title>"`.
3. `artifact review <slug>` adds the empty comment block the sidecar fills.
4. Reply with the absolute path and what the page settles, in a line or two, and stop. The reader reads and comments in the sidecar, so the chat never walks through the page.
