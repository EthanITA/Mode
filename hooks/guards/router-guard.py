import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed, held
if not armed():
    sys.exit(0)

TOOLS = ("Write", "Edit", "NotebookEdit")

# Both modes route work to somebody else, so each gets its own reason for the same denial.
REASONS = {
    "swarm": (
        "Swarm routes, it does not build, and %(name)s is a domain rather than a seam. Hand it to the "
        "owner who already holds those files, or hire one with a charter naming the working "
        "directory, the files it owns, the files it must not touch and how to report back. "
        "Writing it yourself is how the fleet becomes decoration and the parallelism becomes "
        "theatre. The board is yours to write through TaskCreate and TaskUpdate, which this "
        "never blocks. Genuinely a two-line seam between two finished domains? Say so and "
        "leave %(name)s to the owner of one of them. Target: %(path)s"
    ),
    "dispatcher": (
        "Dispatcher explores and dispatches, it never writes, and %(name)s is not yours to change. "
        "Put the change in the prompt for the session that owns that repo, and let that session "
        "write it. The board is yours through TaskCreate and TaskUpdate, which this never blocks. "
        "Target: %(path)s"
    ),
}

try:
    data = json.loads(sys.stdin.read())
    # agent_id is set only inside a subagent call; the router's own calls carry none and stay denied.
    if data.get("agent_id"):
        sys.exit(0)
    tool = data.get("tool_name") or ""
    mode = held("mode", data.get("session_id") or "") if tool in TOOLS else ""
    if mode not in REASONS:
        sys.exit(0)

    path = str((data.get("tool_input") or {}).get("file_path") or "the file")
    name = os.path.basename(path)
    reason = REASONS[mode] % {"name": name, "path": path}
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
