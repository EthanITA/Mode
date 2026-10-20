---
name: gated
summary: A gated pipeline mode, for exercising steps, loops and both gates.
color: magenta
enter-when: gate this
exit-when: manual
no-dispatch-without-approval: true
no-code-without-red: true
steps: intake, spec@artifact, approval?@approve, dispatch@agent, integrate, deliver@commit
loops: approval>spec, integrate>dispatch, deliver>intake, ghost>nowhere
---

# Gated mode

## Standing reminder

- Fixture only, exercises the gate machine and the pipeline position.
