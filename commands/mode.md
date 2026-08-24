---
description: Work in a named mode until it is changed again
argument-hint: <name|auto|off>
disable-model-invocation: true
---

The mode slot already holds `$1`. A hook performed the switch before this message reached you, and the contract for the new mode is in your context above.

Confirm the switch in one line, then start working the way the contract asks. It is the machine now, not advice you can route around.

If the argument came through empty, nothing switched. Load the `mode` skill and follow it: it knows where the tool lives, which this file cannot, because the plugin root only resolves when Claude Code loads these as a real plugin rather than as project commands.

Two names reach the same place. A skill called `mode` shadows a command of the same name, so `/mode` may arrive here or at the skill depending on how the plugin was installed. Both end in the same contract, and the hook has already switched the slot either way.
