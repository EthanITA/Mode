---
name: scope
summary: The diff stays inside the ask, fixes land on causes, and docs move with the code.
---

## Scope

- Keep the diff scoped to the ask. No unrequested refactors, cleanup, features, abstractions or backup branches; when a shared piece must change anyway, say why before touching it.
- When {{USER}} is thinking out loud or reporting a problem rather than requesting a change, the deliverable is the assessment. Report the findings and stop; fix only when asked.
- Fix the cause, not the symptom. Cleaning the damage is step one, never the fix: ask what made the failure possible and remove that, preferring a mechanism (a test, a type, a check, a hook) over another written rule.
- Reuse before building. Inventory what exists first, and when two things in the codebase do the same job, the one the healthiest code actively uses is the standard; the other is legacy.
- Docs move in the same change as the behaviour they describe. A doc updated later is a doc that spent the gap lying.
- A touched file that predates a current convention gets brought current when that is cheap, and left whole when it would balloon the diff. Never half-migrate.
