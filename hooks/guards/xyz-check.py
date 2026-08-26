import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed, style_held
if not armed():
    sys.exit(0)

from _transcript import already_zapped, read_entries, reply_opening, split_turn_blocks, split_turns, turn_shape, turn_tail, xyz_gap

try:
    data = json.loads(sys.stdin.read())

    # The read is the xyz style's contract, so this fence only stands while that style is held.
    if style_held(data.get("session_id") or "") != "xyz":
        sys.exit(0)

    # The repair turn adds the read as a follow-up message; auditing it again would loop forever.
    if data.get("stop_hook_active"):
        sys.exit(0)

    entries = read_entries(data.get("transcript_path"))
    blocks = split_turn_blocks(entries)
    opening = reply_opening(blocks[-1]) if blocks else None
    if opening is None or already_zapped(entries, "xyz-check"):
        sys.exit(0)

    gap = xyz_gap(opening)
    if gap:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "Stop",
                        "additionalContext": (
                            "Your reply did not open with a valid X/Y/Z read (%s). Post the read now as your entire "
                            "follow-up — exactly three lines, each carrying real content: an \"X — \" line stating "
                            "what the user typed, a \"Y — \" line stating what they actually expect, a \"Z — \" line "
                            "stating what that forces into existence. Never write the label definitions themselves "
                            "as the content, do not restate your reply — the three filled lines, then stop." % gap
                        ),
                    },
                    "systemMessage": "⚡ xyz-check: reply had no X/Y/Z read (%s) — adding it." % gap,
                    "suppressOutput": True,
                }
            )
        )
        sys.exit(0)

    # The read repairs first; the summary is judged only on turns whose opening already stands.
    turns = split_turns(entries)
    shape = turn_shape(turns[-1]) if turns else None
    if shape and shape["substantial"] and not shape["question"] and not turn_tail(entries):
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "Stop",
                        "additionalContext": (
                            "This turn did work but its reply does not close with a summary — the execution body is "
                            "self-talk the user skips, so right now the turn says nothing to him. Post the closing block "
                            "now as your entire follow-up: a few self-contained lines stating what was done and what "
                            "still needs them. Never point back into the body — it is unread."
                        ),
                    },
                    "systemMessage": "⚡ xyz-check: work turn ended without a closing summary — adding it.",
                    "suppressOutput": True,
                }
            )
        )
except Exception:
    pass

sys.exit(0)
