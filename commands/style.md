---
description: Speak in a named style until it is changed again
argument-hint: <style> [mode] | auto | off
disable-model-invocation: true
---

The slots already hold what was typed. A hook performed the switch before this message reached you, and the contracts are in your context above.

A name goes to whichever axis owns it, so this command is not limited to the style slot. `/style tdd` fills the mode slot, because `tdd` is a mode and there is no style by that name, and `/style tdd maintainer` fills both in either order. Only `auto` and `off` belong to the axis of the command they were typed on, because neither names a contract.

So read what is in your context rather than assuming this set a style. Confirm what actually changed in one line, and where a style is now held, write that line in it, so the change is visible rather than announced. Then carry on with the work in hand.

If the argument came through empty, nothing switched. Load the `mode` skill and follow it: it knows where the tool lives, which this file cannot, because the plugin root only resolves when Claude Code loads these as a real plugin rather than as project commands.
