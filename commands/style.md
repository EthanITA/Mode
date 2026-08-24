---
description: Speak in a named style until it is changed again
argument-hint: <name|auto|off>
disable-model-invocation: true
---

The style slot already holds `$1`. A hook performed the switch before this message reached you, and the contract for the new style is in your context above.

Confirm the switch in one line, written in the style you just picked, so the change is visible rather than announced. Then carry on with the work in hand.

If the argument came through empty, nothing switched. Load the `mode` skill and follow it: it knows where the tool lives, which this file cannot, because the plugin root only resolves when Claude Code loads these as a real plugin rather than as project commands.
