---
name: ship
summary: Ship it properly. Readable, named, grouped by domain, and everything a dependent needs travels with it.
color: green
enter-when: ship this|ship it|get it out|ready to ship|ship mode|public api|backwards compat|backward compat
exit-when: manual
---

# Ship style

The change is going out, which is exactly why it has to read well. Shipped code is maintained by somebody, so every choice is judged by the next developer's cost to understand it: what autocomplete shows, how big the file they open is, how many hops from a call site to the behaviour. And somebody not in this room will depend on it, so the change never travels alone: what describes it moves in the same diff, and what it breaks is named before it lands rather than discovered after.

Follow the repo's standard when it has one worth the name. Most hold habits, drift and whatever the last generated patch left, and a pile of precedent is not a standard, so judge the repo against these rules rather than the reverse: match a real convention, and where there is none these rules are the house standard.

## Writing it

- **Readable**: low-verbosity and simple, concise over defensive, with no abstraction, wrapper or indirection whose only job is to exist, since it costs a hop and buys nothing. Simplify for the consumer rather than the line count, attacking autocomplete noise, file size, prefix repetition and hidden hierarchy, and never widen something private into an export nobody asked for.
- **Comments** say why or do not exist, zero by default. File-header blurbs, docstrings restating a signature, comments narrating the next line, section banners and ticket context belonging in the commit are banned outright. Add one terse line only when the logic is genuinely non-obvious or deliberately diverges from what a reader expects for a reason the code cannot express, and a file you sweep loses its redundant comments.
- **Names** say what a thing is for, and renaming a wrong one in a file you are changing is part of the work. Name the capability you own, not the vendor you rent (`mail`, never the library's brand), so swapping the library renames no call site. Code that changes together lives together: a shared prefix across exports is a namespace asking to exist, collapsed behind one curated entry point with an explicit export list, never a wildcard re-export. A per-variant file is named after the variant's value, in a folder named for the concern.
- **Types**, where the language has them: explicit parameter and return types on the exported surface, since call-site hints are what the next developer reads, with inference fine for locals. Nothing implicitly untyped, and the language's "unknown plus narrowing" over its escape hatch. In TypeScript, `undefined` means no value and optionality is `?:`, with `null` only where an external contract such as a database column demands it, and string-literal unions or a const object with a derived type over runtime-emitting enums. Three or more positional parameters is a smell: take one destructured options object and export its type.
- **Reuse**: inventory what exists before building, extending a component that almost fits in place rather than forking or re-implementing it. When two libraries do the same job, the one the healthiest code uses is the standard and the other is legacy.
- **Refactor what you touch**: a touched file that outgrew what one person can hold is split by domain with real names as part of the work, needing no permission. The boundary is that file: never sweep the repo and never half-migrate, and when bringing a file current would balloon the diff, leave it whole and say so.

## What travels with the change

Each moves in the same diff as the code it describes, or it drifts, because a doc updated next week spent a week lying. Tests, when behaviour changed, a bug was fixed or the change carries real risk (money paths, state machines, parsing, a security property), or the bug comes back unnoticed. README and usage docs, when installing, configuring or calling the thing changed, or a newcomer follows them into an error. The API description, where kept, when a request shape, response shape or status code changed, or generated clients break unseen until integration. The changelog, where kept, for anything a user of the code would want to know, or every upgrade is a surprise. A migration note when a breaking change ships, or people stay on the old version.

Correct and short, both, since verbosity is a maintenance cost: a changelog entry is one line on what changed and who it affects, a README section explains the non-obvious and skips the rest, and the real command beats a description of it.

## No surprising side effects

A behaviour change nobody asked for is a defect even when the new behaviour is better, so name the blast radius out loud before shipping. Surprises live most often in a changed default value, the shape of an error, ordering somebody relied on, timing, and anything a caller could reach that is now gone or renamed. When one must change, keep the old path working and mark it deprecated with the version it goes away in, because deleting it in the same release turns a good change into an incident.

Watch for stale dependencies and published advisories, say what you found, and stop: a silent upgrade is an unreviewed change inside a diff about something else. Recommend instead, with what is out of date, what the advisory says, what the upgrade costs and how urgent it honestly is, and let the user pick. Even a vulnerability actively exploited in currently exposed code is said plainly and loudly, and then still asked.

Commit by logical group, separating behaviour from pure restructuring, each with a one-line `type(scope): description` message and no body or signature, and run what you shipped for real at least once before calling it shipped. A style changes how the work is written: it never removes what a mode requires, and nothing here overrides an instruction the user actually gave.

## Standing reminder

- Ship means the next developer can work on it: readable, named, grouped by domain, typed at its edges.
- The repo's habits are not a standard. Where it has no real one, this contract's rules apply.
- Tests, docs and the changelog move in the same diff as the code they describe.
- Name the blast radius out loud, deprecate rather than delete, and recommend a dependency bump rather than making it.
