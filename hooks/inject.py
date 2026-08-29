import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shared import ask, payload, run, sid

AXES = ("mode", "style")
# Not a contract but an empty slot with permission to fill itself, which is what the chooser acts on.
AUTO = "auto"

ENDED = (
    "The '%s' %s ended: %s. Its rules no longer apply. Say that it ended and why, then work the "
    "normal way until another one is set."
)

# Claude Code redraws the status line off the model's own reply, which a turn ending here never writes.
LAGGING = "The status line redraws on your next message, so it still shows the chips from before this switch."

# Anchored, so a quoted "/approve x" changes nothing. One token, then whatever was typed after it.
COMMAND = re.compile(r"^/(\S+)((?:[ \t]+\S+)*)")
# Two commands in one prompt stay two: read as one, the later became a bogus argument and vanished.
CHUNK = re.compile(r"/\S+(?:[ \t]+(?!/)\S+)*")
VERBS = ("mode", "style", "approve")
PREFIX = "mode"
# Not contract names, so they act on the axis of the command they were typed on.
SLOT_WORDS = ("off", "auto")
# A plugin command leads with <command-message>, so anchoring on <command-name> missed it entirely.
NAME_TAG = re.compile(r"<command-name>\s*/?([^<]*?)\s*</command-name>")
MSG_TAG = re.compile(r"<command-message>\s*/?([^<]*?)\s*</command-message>")
ARGS_TAG = re.compile(r"<command-args>\s*(.*?)\s*</command-args>", re.S)
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def typed(data):
    prompt = data.get("prompt")
    text = prompt.strip() if isinstance(prompt, str) else ""
    # command-name carries the slash form everywhere seen; command-message is the fallback.
    found = NAME_TAG.search(text) or MSG_TAG.search(text)
    if found:
        args = ARGS_TAG.search(text)
        return "/%s %s" % (found.group(1).strip(), args.group(1).strip() if args else "")
    return text


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
    return (verb or PREFIX), parts[(1 if verb else 0):], found.group(2).split()


def obey(message, session):
    """The switch itself, so a slot changes because someone typed it rather than because the model felt
    like it. Answers which axes were set by hand, since the chooser must never overrule one, plus what
    the message still asks for once the switch is taken out of it, and which axes were named bare."""
    done, bare, spare = set(), [], []
    end = 0
    for found in CHUNK.finditer(message):
        spare.append(message[end:found.start()])
        end = found.end()
        parsed = parse(found.group(0))
        if not parsed:
            spare.append(found.group(0))
            continue
        verb, named, words = parsed
        if verb == "approve":
            # Read only from the typed message: anything an agent can reach could approve its own spec.
            if named + words:
                ask("approve", (named + words)[0], *sid(session))
            spare.extend((named + words)[1:])
            continue
        if not named and not words:
            bare.append(verb if verb in AXES else PREFIX)
            continue

        for index, arg in enumerate(named + words):
            owner = ask("axis", arg)
            # So /mode maintainer reaches the style slot instead of failing quietly against the mode one.
            axis = verb if arg in SLOT_WORDS else (owner or verb)
            known = bool(owner) or arg in SLOT_WORDS
            # The first name per axis wins, so names can arrive in any order and a duplicate is noise.
            if axis not in done:
                code, _ = run(axis, "set", arg, *sid(session))
                if code == 0:
                    done.add(axis)
                    known = True
            # A word the tool cannot place is the ask, not an argument, so the turn still owes an answer.
            if not known and index >= len(named):
                spare.append(arg)
    spare.append(message[end:])
    return done, bare, " ".join(spare).strip()


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


def settled(bare, session):
    """What a person reads when the turn ends in the hook: the choices for an axis named with nothing
    after it, otherwise the same chips the status line shows with each held contract's line under them."""
    listed = [ask("list", axis, *sid(session)) for axis in bare]
    if any(listed):
        return "\n\n".join(block for block in listed if block)
    rows = (row.split("\t") for row in (ask("list", "--tsv", *sid(session)) or "").splitlines())
    held = ["%s: %s" % (row[1], row[2]) for row in rows if len(row) > 3 and row[3] == "active"]
    chips = ANSI.sub("", ask("chips", *sid(session)) or "")
    return "\n".join([chips] + held + ["", LAGGING]).strip()


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

    handled, bare, spare = obey(message, session)

    # Leaving rules and announce uncalled is the point: the contract still lands on the first real ask.
    if not blocks and not spare and (handled or bare):
        print(
            json.dumps(
                {
                    "decision": "block",
                    "reason": settled(bare, session),
                    "hookSpecificOutput": {
                        "hookEventName": "UserPromptSubmit",
                        "suppressOriginalPrompt": True,
                    },
                }
            )
        )
        sys.exit(0)

    for axis in AXES:
        if axis not in handled and holding(axis, session) == AUTO:
            enter(axis, message, session)

    # Once per conversation each: base rules on the first prompt, scoped ones when their trigger shows.
    told = ask("rules", "--message", message, *sid(session))
    if told:
        blocks.insert(0, told)

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
