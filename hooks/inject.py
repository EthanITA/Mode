import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shared import ask, payload, sid

AXES = ("mode", "style")
# Not a contract but an empty slot with permission to fill itself, which is what the chooser acts on.
AUTO = "auto"

ENDED = (
    "The '%s' %s ended: %s. Its rules no longer apply. Say that it ended and why, then work the "
    "normal way until another one is set."
)

# Anchored, so a quoted "/approve x" changes nothing. One token, then whatever was typed after it.
COMMAND = re.compile(r"^/(\S+)((?:[ \t]+\S+)*)")
VERBS = ("mode", "style", "approve")
PREFIX = "mode"
# Not contract names, so they act on the axis of the command they were typed on.
SLOT_WORDS = ("off", "auto")
# A slash command can arrive as these tags rather than as the literal text that was typed.
TAGGED = re.compile(
    r"^\s*<command-name>\s*/(\S+)\s*</command-name>"
    r"(?:.*?<command-args>\s*(.*?)\s*</command-args>)?",
    re.S,
)


def typed(data):
    prompt = data.get("prompt")
    text = prompt.strip() if isinstance(prompt, str) else ""
    found = TAGGED.match(text)
    return "/%s %s" % (found.group(1), (found.group(2) or "").strip()) if found else text


def parse(message):
    found = COMMAND.match(message)
    if not found:
        return None
    parts = [p for p in found.group(1).split(":") if p]
    if not parts:
        return None
    namespaced = len(parts) > 1 and parts[0] == PREFIX
    if namespaced:
        parts = parts[1:]
    # Otherwise this is somebody else's slash command and claiming it would switch an unasked slot.
    if not namespaced and parts[0] not in VERBS:
        return None
    verb = parts[0] if parts[0] in VERBS else None
    return (verb or PREFIX), parts[(1 if verb else 0):] + found.group(2).split()


def obey(message, session):
    """The switch itself, so a slot changes because someone typed it rather than because the model felt
    like it. Answers which axes were set by hand, since the chooser must never overrule one."""
    parsed = parse(message)
    if not parsed:
        return set()
    verb, names = parsed
    if verb == "approve":
        # Read only from the typed message: anything an agent can reach could approve its own spec.
        if names:
            ask("approve", names[0], *sid(session))
        return set()

    done = set()
    for arg in names:
        # So /mode maintainer reaches the style slot instead of failing quietly against the mode one.
        axis = verb if arg in SLOT_WORDS else (ask("axis", arg) or verb)
        ask(axis, "set", arg, *sid(session))
        done.add(axis)
    return done


def expire(axis, session):
    """Retires a contract whose exit condition the tool reports met, and answers with the line saying so."""
    reason = ask(axis, "expired", *sid(session))
    if not reason:
        return ""
    name = ask(axis, "get", *sid(session))
    # exit puts a chosen slot back on auto, so the chooser below can refill it from this same message.
    ask(axis, "exit", *sid(session))
    return ENDED % (name, axis, reason.rstrip(". ")) if name else ""


def holding(axis, session):
    """What the slot holds, read off the chip, the same call the status line makes."""
    row = (ask(axis, "get", "--chip", *sid(session)) or "").split("\t")
    return row[0].strip()


def enter(axis, message, session):
    name = ask("choose", "--axis", axis, "--message", message, *sid(session))
    if name:
        # --chosen marks the slot as filled by the chooser, so an ended contract can return to auto.
        ask(axis, "set", name, "--chosen", *sid(session))


try:
    data = payload()
    session = data.get("session_id") or ""
    message = typed(data)

    # Judged before the switch, so an exit condition retires the contract the turn began in.
    blocks = [line for line in (expire(axis, session) for axis in AXES) if line]

    handled = obey(message, session)
    for axis in AXES:
        if axis not in handled and holding(axis, session) == AUTO:
            enter(axis, message, session)

    # One call, because bin/mode owns whether this prompt gets the whole contract or the reminder.
    announced = ask("announce", *sid(session))
    if announced:
        blocks.append(announced)

    if blocks:
        # additionalContext reaches the model only; the surface a person watches is the status-line chip.
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "UserPromptSubmit",
                        "additionalContext": "\n\n".join(blocks),
                    },
                    "suppressOutput": True,
                }
            )
        )
except Exception:
    pass

sys.exit(0)
