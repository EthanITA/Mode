import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed
if not armed():
    sys.exit(0)
from _deliver import DELIVERY_SHELL, verify
from _transcript import already_zapped, read_entries, split_turns, store_board


def zap(claude_text, user_text):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {"hookEventName": "Stop", "additionalContext": claude_text},
                "systemMessage": "⚡ %s" % user_text,
                "suppressOutput": True,
            }
        )
    )
    sys.exit(0)


try:
    data = json.loads(sys.stdin.read())
    if data.get("stop_hook_active"):
        sys.exit(0)
    entries = read_entries(data.get("transcript_path"))
    if already_zapped(entries, "board-done"):
        sys.exit(0)

    # The sweep audits only the "conversation is done" claim; a board with open items is still in flight.
    tasks = store_board(data.get("session_id"))
    if not tasks or any(t.get("status") != "completed" for t in tasks):
        sys.exit(0)

    turns = split_turns(entries)
    shipped = [
        args.get("command", "")
        for turn in turns
        for name, args in turn
        if name == "Bash" and DELIVERY_SHELL.search(args.get("command") or "")
    ]
    shipped += [name for turn in turns for name, _ in turn if name == "mcp__gitlab-moneyfarm__create_merge_request"]
    declared = [t for t in tasks if (t.get("metadata") or {}).get("done")]
    if not shipped and not declared:
        sys.exit(0)

    for task in declared:
        verdict, detail = verify((task.get("metadata") or {}).get("done"))
        # An "error" verdict is infrastructure, and the fence never blocks on a broken network.
        if verdict == "unmet":
            zap(
                "The board reads all-ticked — the conversation-done claim — but #%s's delivery receipt fails: %s. "
                "Re-open it with TaskUpdate (status in_progress) and finish the delivery, or correct the receipt."
                % (task.get("id"), detail),
                "board-done: board says done but #%s's receipt fails — re-opening." % task.get("id"),
            )

    if shipped and not declared:
        zap(
            "Delivery work ran this session (%s) but no board item declares a delivery receipt, so the all-ticked "
            "board asserts done without proof. Add the delivery item with its metadata.done receipt "
            "(mr-merged / pushed / published per the project's Definition of done), verify it, then tick."
            % "; ".join(sorted({c.strip()[:60] for c in shipped})[:3]),
            "board-done: delivery ran with no receipt on the board — adding it.",
        )
except SystemExit:
    raise
except Exception:
    pass

sys.exit(0)
