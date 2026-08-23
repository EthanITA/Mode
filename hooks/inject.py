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

# Anchored, so a quoted "/approve x" changes nothing; the prefix is optional since only /mode runs bare.
COMMAND = re.compile(r"^/(?:mode:)?(mode|style|approve)\b[ \t]*(\S*)")
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


def obey(message, session):
    """The switch itself, so a slot changes because someone typed it rather than because the model felt
    like it. Answers which axes were set by hand, since the chooser must never overrule one."""
    found = COMMAND.match(message)
    if not found:
        return set()
    verb, arg = found.group(1), found.group(2)
    if verb == "approve":
        # Read only from the typed message: anything an agent can reach could approve its own spec.
        if arg:
            ask("approve", arg, *sid(session))
        return set()
    if not arg:
        return set()
    # Failure is the answer for an unknown name: nothing switches and the skill lists the real ones.
    ask(verb, "set", arg, *sid(session))
    return {verb}


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
