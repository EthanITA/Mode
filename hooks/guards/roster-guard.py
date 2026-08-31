import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed, held
if not armed():
    sys.exit(0)
from _transcript import load_board, read_entries


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)


def owners(board):
    """Board items carrying a files list are the roster; everything else on the board is ordinary work."""
    out = []
    for task in board:
        meta = task.get("metadata") or {}
        files = meta.get("files")
        if isinstance(files, str):
            files = [f.strip() for f in files.split(",")]
        if files:
            out.append((task, meta.get("owner") or task.get("owner") or "", [f for f in files if f], meta))
    return out


try:
    data = json.loads(sys.stdin.read())
    if data.get("tool_name") != "Agent" or held("mode", data.get("session_id") or "") != "swarm":
        sys.exit(0)

    args = data.get("tool_input") or {}
    name = str(args.get("name") or "").strip()
    charter = str(args.get("prompt") or "")
    roster = owners(load_board(data.get("session_id"), read_entries(data.get("transcript_path"))))

    if not name:
        deny("Every owner is named, because the board is the roster and an owner nobody can name is an "
             "owner nobody can route to. Pass `name` on the Agent call.")

    mine = [r for r in roster if r[1] == name or (r[0].get("owner") or "") == name]
    if not mine:
        known = ", ".join(sorted({r[1] for r in roster if r[1]})) or "nobody yet"
        deny("%r is not on the board, so there is no record of what it owns and the file test cannot be "
             "applied. Create its board item first, carrying metadata {\"owner\": %r, \"files\": [...]} "
             "with the paths it holds, then spawn it. On the roster now: %s." % (name, name, known))

    task, _, files, meta = mine[0]

    clash = []
    for other, other_name, other_files, _ in roster:
        if other.get("id") == task.get("id") or str(other.get("status")) == "completed":
            continue
        for path in files:
            if path in other_files:
                clash.append((other_name or other.get("subject", "")[:40], path))
    if clash:
        lines = "\n".join("  %s also holds %s" % (who, path) for who, path in clash[:6])
        deny("Two owners would write the same file, which is the failure that ruins a fleet.\n%s\n"
             "They are one domain: merge them and let the survivor inherit it, or narrow the paths so "
             "the two sets do not touch." % lines)

    missing = [p for p in files if p not in charter]
    if missing:
        deny("The charter never names %s, so this agent starts cold without knowing what it owns. A "
             "charter carries the working directory, the files it owns by path, the files that are not "
             "its to touch, the contract it builds against and how to report back."
             % ", ".join(missing[:4]))

    notes = meta.get("notes")
    if notes and str(notes)[:60] not in charter:
        deny("This domain has notes from the owner before it, and the charter does not carry them, so "
             "the agent will re-derive what somebody already paid to learn. Splice them into the "
             "charter. Recorded on #%s: %s" % (task.get("id"), str(notes)[:400]))

    if "Domain notes" not in charter:
        deny("The charter has no handback for what this agent learns. Ask it to close its report with a "
             "`## Domain notes` section: the facts about these files that the next agent here would "
             "otherwise work out again. That handback is the only way knowledge reaches the roster, "
             "since the router never reads the code itself.")
except SystemExit:
    raise
except Exception:
    pass

sys.exit(0)
