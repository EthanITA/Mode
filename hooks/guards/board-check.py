import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed
if not armed():
    sys.exit(0)
from _transcript import CATEGORIES, FULL_LIST_OVER, already_zapped, board_from_transcript, board_full, category, dedupe_by_subject, describe, id_gap, last_touch_turn, mine, read_entries, restore_board, split_turns, store_board, turn_shape

# A task that ages this many turns without a board call has stopped describing reality.
STALE_TURNS = 3


def emit(claude_text, user_text):
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

    # The self-heal turn must not be audited again, or the board becomes an infinite loop.
    if data.get("stop_hook_active"):
        sys.exit(0)

    entries = read_entries(data.get("transcript_path"))
    if already_zapped(entries, "board-check"):
        sys.exit(0)
    turns = split_turns(entries)
    if not turns:
        sys.exit(0)

    stored = store_board(data.get("session_id"))
    replay = dedupe_by_subject(board_from_transcript(entries))
    # A wiped store is repaired in place — the transcript holds every create and update, so no rebuild turn.
    if not stored and replay:
        restore_board(data.get("session_id"), replay)
        emit(
            "The session store was wiped (a compact or resume drops it). The board has been restored from the "
            "transcript automatically — %d task(s), ids, statuses and receipts intact. No rebuild needed; carry on."
            % len(replay),
            "board-check: store wiped — board auto-restored (%d tasks)." % len(replay),
        )

    shape = turn_shape(turns[-1])
    # A turn that only read and answered has no board duty — nagging hygiene there is what made Q&A stretches hell.
    if not shape["substantial"] and not shape["board_calls"]:
        sys.exit(0)
    tasks = stored

    actionable = mine(tasks, turns)
    open_tasks = [t for t in actionable if t.get("status") in ("pending", "in_progress")]
    in_progress = [t for t in actionable if t.get("status") == "in_progress"]

    if shape["substantial"] and not tasks:
        if len(shape["written"]) >= 2:
            reason = "wrote %d files" % len(shape["written"])
        elif shape["delegated"]:
            reason = "delegated to %s" % ", ".join(sorted(set(shape["delegated"])))
        else:
            reason = "ran mutating shell commands"
        emit(
            "This turn %s but no task board exists. Open one now with TaskCreate: record what you just did — each "
            "finished piece created and marked completed as its receipt — and add pending or in_progress items only "
            "for work that genuinely remains. If nothing remains, receipts alone are the correct board: never invent "
            "filler, and never park a fake \"[USER] decide…\" item just to satisfy this check." % reason,
            "board-check: work happened with no board — recording receipts.",
        )

    if shape["substantial"] and not open_tasks and not shape["created"] and not shape["completed"] and not shape["question"]:
        emit(
            "Every task on the board is completed, yet this turn did work — the board is missing this turn's "
            "receipt. Record the work you just did: create it and mark it completed if it is done and verified, and "
            "add pending items only if something real is outstanding. A fully ticked board that matches reality "
            "means the topic is done — never invent filler, and a parked \"[USER] Decide to commit\" is the "
            "canonical filler, not a task.",
            "board-check: board is missing this turn's receipt — recording it.",
        )

    # A task in flight since an earlier turn already covers the work, so ticking late is not acting early.
    covered = any(last_touch_turn(turns, t) < len(turns) - 1 for t in in_progress)
    if shape["substantial"] and shape["created"] and shape["acted_first"] and not covered:
        emit(
            "You started working before the board went up: the first action came at call %d, the first board call "
            "at %d. The board states what you are about to do, so it goes up straight after the X/Y/Z read — "
            "otherwise it records what already happened." % (shape["first_action"] + 1, shape["first_board"] + 1),
            "board-check: acted before the board went up.",
        )

    if shape["substantial"] and not shape["board_calls"] and open_tasks:
        emit(
            "This turn changed things but never touched the board. Reconcile it now: mark completed anything you "
            "finished and verified, set the item you are on to in_progress, and add tasks for work that surfaced. "
            "Open items: %s" % "; ".join(describe(t) for t in open_tasks),
            "board-check: board went untouched during a work turn — reconciling.",
        )

    # Closing something out is proof the board is live.
    if shape["substantial"] and open_tasks and not in_progress and not shape["completed"] and not shape["question"]:
        emit(
            "You are doing work but no task is marked in_progress. Set the one you are actually on to in_progress so "
            "the board reflects reality. Pending: %s" % "; ".join(describe(t) for t in open_tasks),
            "board-check: work in flight with nothing marked in_progress.",
        )

    if (
        shape["substantial"]
        and shape["created_startable"]
        and not in_progress
        and not shape["completed"]
        and not shape["question"]
    ):
        emit(
            "You created tasks this turn but left them all pending. Mark the one you are starting as in_progress.",
            "board-check: tasks created but none started.",
        )

    # The id can only be checked here: TaskCreate assigns it after the subject is written.
    malformed = []
    for task in tasks:
        if not category(task):
            malformed.append("%s → needs %s" % (describe(task), " or ".join("[%s]" % c for c in CATEGORIES)))
        else:
            gap = id_gap(task)
            if gap:
                malformed.append("%s → %s" % (describe(task), gap))
    if malformed:
        emit(
            "These board subjects are not in standard form — every one reads \"#id [CATEGORY] subject\", the id "
            "padded to three columns so the ids line up, so that a bare \"#4\" resolves wherever it is quoted. "
            "Fix each with TaskUpdate: %s" % "; ".join(malformed),
            "board-check: %d task subject(s) off-standard — renaming." % len(malformed),
        )

    ages = {t["id"]: len(turns) - 1 - last_touch_turn(turns, t) for t in in_progress}
    stale = [t for t in in_progress if ages[t["id"]] >= STALE_TURNS]
    if stale:
        emit(
            "These tasks have been in_progress with no board update: %s. Reconcile each one — mark it completed if it "
            "is done and verified, split it if it grew, or leave it and say what it is blocked on."
            % "; ".join("%s (untouched %d turns)" % (describe(t), ages[t["id"]]) for t in stale),
            "board-check: %d stale in_progress task(s) — reconciling." % len(stale),
        )

    # Past the panel's truncation the rendered list is the only complete view the user gets of a clean board.
    if sum(t.get("status") != "completed" for t in tasks) > FULL_LIST_OVER:
        print(json.dumps({"systemMessage": board_full(tasks), "suppressOutput": True}))

except SystemExit:
    raise
except Exception:
    pass

sys.exit(0)
