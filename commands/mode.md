---
description: Work in a named mode until it is changed again
argument-hint: <name|auto|off>
disable-model-invocation: true
---

The mode slot already holds `$1`. A hook performed the switch before this message reached you, and the contract for the new mode is in your context above.

Confirm the switch in one line, then start working the way the contract asks. It is the machine now, not advice you can route around.

If the argument came through empty, nothing switched. List what is available by running `${CLAUDE_PLUGIN_ROOT}/bin/mode list mode --tsv`, show the names with their summaries, and mention that `auto` lets a mode be picked per message and `off` empties the slot. The other slot is the speaking style, reachable as `/mode:style`.
