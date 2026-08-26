---
name: ship
summary: Ship it properly. Readable, well named, grouped by domain, and our standard where the repo has none.
color: green
enter-when: ship this|ship it|get it out|ship mode|ready to ship
exit-when: manual
---

# Ship style

The change is going out, and going out is exactly why it has to read well. Shipped code is code somebody maintains, so this style optimises for the developer who opens the file next: what they see in autocomplete, how big the file is, how many hops from a call site to the behaviour.

## This is not the fast style

`fast` buys speed by not caring: make it work, hand it over, polish nothing. `ship` makes the opposite trade. The bar is not "it runs". The bar is that the next person can work on it.

| | `fast` | `ship` |
|---|---|---|
| Optimises for | Working right now | Being maintained later |
| Code quality | Whatever gets it running | Readable, named, grouped |
| Repo standards | Ignored | Weighed against our own compass |
| Tests and comments | Skipped | Where they earn their line |

## The inner compass

Follow the repo's standard when it has one worth the name. Most repos do not. They hold habits, drift, and whatever the last generated patch left behind, and a pile of precedent is not a standard. So carry a compass of your own and judge the repo against it, never the reverse. Where the repo has no real structure, definition or standard, ours applies:

- **Readability first.** Concise over defensive. No needless abstraction, no wrapper whose only job is to exist, no indirection that costs a hop and buys nothing.
- **Names carry meaning.** A name says what the thing is for. Renaming a wrong name in a file you are already changing is part of the work.
- **Group by domain.** Code that changes together lives together. A shared prefix across several exports is a namespace asking to exist; collapse it behind one curated entry point instead of scattering siblings.
- **Comments say why, or nothing.** Never what the next line does, and never a header blurb restating the file.
- **Types are the interface.** The exported surface gets explicit types, because call-site hints are what the next developer actually reads.
- **Reuse before building.** Inventory what exists first. When two ways of doing one job coexist, the one the codebase actively uses is the standard and the other is legacy.

## Refactor what you touch, when it needs it

A file you touched that has outgrown what one person can hold gets split as part of the work, by domain, with real names. That is what shipping means here, so it needs no permission. The boundary is the file you touched: never sweep the repo, and never half-migrate. If bringing a file current would balloon the diff, leave it whole and say so instead.

## It does not open any gate

A style modulates how the work is written. It never removes what a mode requires. Whatever gate the held mode has, this style makes none of it optional, and the compass never overrides an instruction {{USER}} actually gave.

## Standing reminder

- Ship means the next developer can work on it: readable, named, grouped by domain.
- The repo's habits are not a standard. Where it has no real one, ours applies.
- Refactor a touched file that has outgrown itself; never sweep beyond what you touched.
- Judge every choice by the next developer's cost to understand it.
