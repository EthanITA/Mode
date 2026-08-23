import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shared import ask, flag, payload, run, sid

FLAG = "no-dispatch-without-approval"
AUTO = "auto"

WAITING = (
    "the '%s' mode waits for a yes on a written spec before any teammate is spawned, and this mode has "
    "not been given one. A yes is scoped to the mode it was given under, so one recorded under a "
    "different mode does not carry over."
)
FIX = (
    " Write the spec, show it, and record the yes with `/mode:approve <slug>`, or `/approve <slug>` "
    "where the short form is installed. Until that lands, do the work here rather than dispatching it."
)


def verdict(session):
    """The reason to deny, or "" to allow. Every unreadable input allows: a gate that cannot see its
    inputs has not found a violation, it has only failed to look."""
    mode = ask("mode", "get", *sid(session))
    # auto holds no contract of its own, so it carries no flags to read.
    if not mode or mode == AUTO:
        return ""
    if not flag(ask("show", "mode", "--meta", *sid(session)), FLAG):
        return ""
    code, _ = run("approve", *sid(session))
    # Only a deliberate 1 means no approval; a crash or a missing tool leaves the gate blind, so it allows.
    if code != 1:
        return ""
    return WAITING % mode + FIX


try:
    data = payload()
    if data.get("tool_name") == "Agent":
        reason = verdict(data.get("session_id") or "")
        if reason:
            print(
                json.dumps(
                    {
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "permissionDecision": "deny",
                            "permissionDecisionReason": "mode gate: %s" % reason,
                        }
                    }
                )
            )
except Exception:
    pass

sys.exit(0)
