import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed
if not armed():
    sys.exit(0)
from _deliver import DELIVERY_SUBJECT, MODE, required_kind, verify
from _transcript import load_board, read_entries


def out(payload):
    print(json.dumps(payload))
    sys.exit(0)


def block(reason):
    if MODE == "deny":
        out(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    out({"systemMessage": "⚡ board-deliver (warn): %s" % reason, "suppressOutput": True})


try:
    data = json.loads(sys.stdin.read())
    args = data.get("tool_input") or {}
    if data.get("tool_name") != "TaskUpdate" or args.get("status") != "completed":
        sys.exit(0)

    task_id = str(args.get("taskId"))
    entries = read_entries(data.get("transcript_path"))
    task = next((t for t in load_board(data.get("session_id"), entries) if str(t.get("id")) == task_id), None)
    if not task:
        sys.exit(0)

    # The call's own metadata wins: a receipt may arrive in the same update that ticks.
    done = (args.get("metadata") or {}).get("done") or (task.get("metadata") or {}).get("done")
    subject = args.get("subject") or task.get("subject") or ""
    if not done:
        if DELIVERY_SUBJECT.search(subject):
            block(
                "#%s reads as a delivery item but declares no receipt — put {done: {kind: mr-merged|pushed|published, …}} "
                "in its metadata so the bar is checkable against the project's Definition of done, then tick." % task_id
            )
        sys.exit(0)

    demanded = required_kind(done.get("repo"), done.get("project"), done.get("url"), data.get("cwd"))
    if demanded and done.get("kind") != demanded:
        block(
            "#%s declares receipt kind %r but this tree's Definition of done demands %r."
            % (task_id, done.get("kind"), demanded)
        )

    verdict, detail = verify(done)
    if verdict == "unmet":
        block("#%s: the done bar is not met — %s. The delivery item stays open." % (task_id, detail))
    if verdict == "error":
        out(
            {
                "systemMessage": "⚡ board-deliver: #%s receipt unverifiable (%s) — allowing, verify by hand."
                % (task_id, detail),
                "suppressOutput": True,
            }
        )
except SystemExit:
    raise
except Exception:
    pass

sys.exit(0)
