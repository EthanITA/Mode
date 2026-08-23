---
description: Speak in a named style until it is changed again
argument-hint: <name|auto|off>
disable-model-invocation: true
---

The style slot already holds `$1`. A hook performed the switch before this message reached you, and the contract for the new style is in your context above.

Confirm the switch in one line, written in the style you just picked, so the change is visible rather than announced. Then carry on with the work in hand.

If the argument came through empty, list what is available by running `${CLAUDE_PLUGIN_ROOT}/bin/mode list style --tsv` and show the names with their summaries. Nothing switched in that case.
