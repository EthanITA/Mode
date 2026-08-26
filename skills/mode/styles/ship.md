---
name: ship
summary: Ship it properly. Readable, well named, grouped by domain, and our standard where the repo has none.
color: green
enter-when: ship this|ship it|get it out|ship mode|ready to ship
exit-when: manual
---

# Ship style

The change is going out, and going out is exactly why it has to read well. Shipped code is code somebody maintains, so every choice is judged by the next developer's cost to understand it: what autocomplete shows them, how big the file is they open, how many hops it takes from a call site to the behaviour.

## The inner compass

Follow the repo's standard when it has one worth the name. Most repos do not. They hold habits, drift, and whatever the last generated patch left behind, and a pile of precedent is not a standard. So judge the repo against the rules below, never the reverse. Where it has a real convention, match it. Where it has none, these rules apply as the house standard.

## Readability

- Readable, low-verbosity, simple. Prefer concise over defensive.
- No needless abstraction, wrapper or indirection. A layer whose only job is to exist costs a hop and buys nothing.
- Simplify for the consumer rather than for the line count: attack autocomplete noise, file size, prefix repetition and hidden hierarchy. Do not widen something private into an export no consumer asked for.

## Comments

- A comment says why, or it does not exist. The default is zero.
- Banned outright: file-header blurbs, docstrings restating a signature, comments narrating what the next line does, section banners, and ticket context that belongs in the commit message.
- Add one only when the logic is genuinely non-obvious, or the code deliberately diverges from what a reader expects for a reason it cannot express itself. One terse line.
- A file you sweep loses its redundant comments on the way through.

## Naming and grouping

- A name says what the thing is for. Renaming a wrong name in a file you are already changing is part of the work.
- Name the capability you own rather than the vendor you rent: `mail`, never the brand of the library sending it, so swapping the library never renames a call site.
- Code that changes together lives together. A shared prefix across several exports is a namespace asking to exist: collapse it behind one curated entry point with an explicit export list, never a wildcard re-export.
- A file that exists per variant is named after the variant's value, nested in a folder named for the concern.

## Types, where the language has them

- The exported surface gets explicit parameter and return types, because call-site hints are what the next developer actually reads. Inference is fine for locals.
- Nothing implicitly untyped. Prefer the language's "unknown plus narrowing" over its escape hatch.
- In TypeScript: `undefined` means "no value" and optionality is `?:`; `null` appears only where an external contract, such as a database column, demands it. Prefer string-literal unions, or a const object with a derived type, over enum constructs that emit runtime code.
- Three or more positional parameters is a smell: take one destructured options object and export its type.

## Reuse

- Inventory what exists before building. A component that almost fits gets extended in place, never forked and never re-implemented beside itself.
- When two libraries in one codebase do the same job, the one the healthiest code actively uses is the standard and the other is legacy.

## Refactor what you touch

- A file you touched that has outgrown what one person can hold gets split as part of the work, by domain, with real names. That is what shipping means here, and it needs no permission.
- The boundary is the file you touched. Never sweep the repo, and never half-migrate: when bringing a file current would balloon the diff, leave it whole and say so instead.

## Tests and docs

- Tests go where the change carries real risk: money paths, state machines, parsing, a security property. A lean file with few essential cases, folded into an existing test file when one fits.
- A change to documented behaviour updates the doc in the same change.

## Delivery

- Commit by logical group, separating behaviour from pure restructuring. One-line message in the `type(scope): description` shape, no body, no signature.
- Run what you shipped at least once for real before calling it shipped.

## It does not open any gate

A style modulates how the work is written. It never removes what a mode requires, and none of the rules above override an instruction {{USER}} actually gave.

## Standing reminder

- Ship means the next developer can work on it: readable, named, grouped by domain.
- The repo's habits are not a standard. Where it has no real one, this contract's rules apply.
- Comments say why or nothing; exported surfaces carry explicit types; reuse before building.
- Refactor a touched file that has outgrown itself, and never sweep beyond what you touched.
