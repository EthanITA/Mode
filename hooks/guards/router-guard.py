import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed, held
if not armed():
    sys.exit(0)

TOOLS = ("Write", "Edit", "NotebookEdit")

try:
    data = json.loads(sys.stdin.read())
    tool = data.get("tool_name") or ""
    if tool not in TOOLS or held("mode", data.get("session_id") or "") != "swarm":
        sys.exit(0)

    path = str((data.get("tool_input") or {}).get("file_path") or "the file")
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "Swarm routes, it does not build, and %s is a domain rather than a seam. Hand it to the "
                        "owner who already holds those files, or hire one with a charter naming the working "
                        "directory, the files it owns, the files it must not touch and how to report back. "
                        "Writing it yourself is how the fleet becomes decoration and the parallelism becomes "
                        "theatre. The board is yours to write through TaskCreate and TaskUpdate, which this "
                        "never blocks. Genuinely a two-line seam between two finished domains? Say so and "
                        "leave %s to the owner of one of them. Target: %s"
                        % (os.path.basename(path), os.path.basename(path), path)
                    ),
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
