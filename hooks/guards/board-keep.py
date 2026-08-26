import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed
if not armed():
    sys.exit(0)
from _transcript import load_board, read_entries

try:
    data = json.loads(sys.stdin.read())
    args = data.get("tool_input") or {}
    if data.get("tool_name") != "TaskUpdate" or args.get("status") != "deleted":
        sys.exit(0)

    task_id = str(args.get("taskId"))
    entries = read_entries(data.get("transcript_path"))
    target = next((t for t in load_board(data.get("session_id"), entries) if str(t.get("id")) == task_id), None)
    if not target or target.get("status") != "completed":
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "#%s is completed, and a completed task is the receipt that the work happened — it stays on "
                        "the board. Dropping a pending item that stopped mattering is fine; erasing a finished one "
                        "rewrites the record. Subject: %r" % (task_id, (target.get("subject") or "")[:80])
                    ),
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
