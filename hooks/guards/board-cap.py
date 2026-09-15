import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed
if not armed():
    sys.exit(0)
from _transcript import category, store_board

# Three open USER items leave room for the work that can actually proceed.
CAP = 3

try:
    data = json.loads(sys.stdin.read())
    tool_name = data.get("tool_name")
    if tool_name not in ("TaskCreate", "TaskUpdate"):
        sys.exit(0)

    args = data.get("tool_input") or {}
    subject = args.get("subject")
    if not subject or category({"subject": subject}) != "USER":
        sys.exit(0)

    task_id = str(args.get("taskId")) if tool_name == "TaskUpdate" else ""
    open_users = 0
    for task in store_board(data.get("session_id")):
        if task_id and str(task.get("id")) == task_id:
            continue
        if task.get("status") in ("pending", "in_progress") and category(task) == "USER":
            open_users += 1

    if open_users >= CAP:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "There are already %d open USER items, and the cap is %d. Fold this work into an item "
                            "already open, or take the sensible default, proceed, and say so in the closing summary "
                            "instead of opening another USER item." % (open_users, CAP)
                        ),
                    }
                }
            )
        )
except Exception:
    pass

sys.exit(0)
