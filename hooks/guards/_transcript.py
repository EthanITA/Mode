import glob, json, os, re

WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
DELEGATE_TOOLS = {"Agent", "Task", "Workflow", "SendMessage"}
BOARD_TOOLS = {"TaskCreate", "TaskUpdate"}

MUTATING_SHELL = re.compile(
    r"\b(?:git\s+(?:commit|push|merge|rebase|reset|revert|cherry-pick|tag)"
    r"|rm\s|mv\s|mkdir\s|tee\s|truncate\s"
    r"|(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|publish)"
    r"|glab\s+mr|gh\s+(?:pr|issue|release))\b"
)

# Past this size the transcript costs more to parse than the nudge is worth.
MAX_TRANSCRIPT_BYTES = 24 * 1024 * 1024


def content_of(entry):
    msg = entry.get("message")
    return msg.get("content") if isinstance(msg, dict) else None


def is_tool_result(content):
    return isinstance(content, list) and any(
        isinstance(i, dict) and (i.get("type") == "tool_result" or "tool_use_id" in i) for i in content
    )


# Arrives in the user role but nobody typed it, so there is no request to read back.
INJECTED_TAGS = (
    "<local-command-stdout",
    "<local-command-stderr",
    "<bash-stdout",
    "<bash-stderr",
    "<system-reminder",
    "<task-notification",
    "<teammate-message",
    "<user-prompt-submit-hook",
)


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(i.get("text") or "" for i in content if isinstance(i, dict) and i.get("type") == "text")
    return ""


def is_injected(text):
    if text.startswith("[Request interrupted by user"):
        return True
    # Wrappers can ride behind a preamble line ("Another Claude session sent a message:").
    for line in text.split("\n")[:3]:
        if line.strip().startswith(INJECTED_TAGS):
            return True
    return False


def is_genuine_user(entry):
    if entry.get("type") != "user" or entry.get("isMeta") or entry.get("isCompactSummary") or entry.get("isSidechain"):
        return False
    content = content_of(entry)
    if is_tool_result(content):
        return False
    text = text_of(content).strip()
    return bool(text) and not text.startswith("<bash-input>") and not is_injected(text)


def read_entries(path):
    if not path or not os.path.exists(path) or os.path.getsize(path) > MAX_TRANSCRIPT_BYTES:
        return []
    entries = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except Exception:
                continue
    return entries


XYZ_LABELS = ("X", "Y", "Z")
# Horizontal whitespace only: \s would span the newline and let an empty "**X** —" match the next line's text.
XYZ = {
    label: re.compile(
        r"^[ \t]*(?:>[ \t]*)?(?:[-+][ \t]+)?(?:\*\*|__)?%s(?:\*\*|__)?[ \t]*[—–:-][ \t]*(\S[^\n]*)" % label,
        re.MULTILINE,
    )
    for label in XYZ_LABELS
}

PLACEHOLDERS = ("what i typed", "what i actually expect", "what that forces into existence")


HARNESS_ERROR = ("API Error", "Request timed out", "Request was aborted", "Credit balance is too low")


def is_reply(text):
    """A tool-only or interrupted turn produces no prose, and a harness error is not the agent speaking — asking
    either for a read demands the opening of a reply that was never made."""
    body = (text or "").strip()
    return bool(body) and not body.startswith(HARNESS_ERROR)


def reply_opening(blocks):
    """The first real prose block of a turn — what the reply visibly opens with. Later blocks are mid-turn
    narration; judging them would re-litigate a reply whose opening already passed or was already punished."""
    for block in blocks:
        if is_reply(block):
            return block.strip()
    return None


def xyz_gap(text):
    """Why a reply opening fails the X/Y/Z standard, or None if it passes. Layout is free — inline or heading
    style, blank lines or none — what is enforced is the substance: all three labels, X first, in order, and
    not the template's own placeholder lines pasted as if they were content."""
    body = text or ""
    found = {label: XYZ[label].search(body) for label in XYZ_LABELS}
    missing = [label for label in XYZ_LABELS if not found[label]]
    if missing:
        return "missing %s" % ", ".join(missing)

    # Measured from whichever label lands first, so a mis-ordered read is reported as mis-ordered, not misplaced.
    if body[: min(found[label].start() for label in XYZ_LABELS)].strip():
        return "not at the start — the read opens the reply, before anything else"

    lines = [body.count("\n", 0, found[label].start()) for label in XYZ_LABELS]
    if lines != sorted(lines):
        return "out of order — it must read X, then Y, then Z"

    contents = [re.sub(r"[\s*_:.!]+$", "", found[label].group(1)).lower() for label in XYZ_LABELS]
    if all(c in PLACEHOLDERS for c in contents) and lines[2] - lines[0] == 2:
        return "the template pasted verbatim — each line carries the actual content, not the label's definition"
    return None


def split_turn_blocks(entries):
    """The assistant's visible prose per turn, one string per text block, so the reply's opening block is
    addressable on its own."""
    turns, current = [], None
    for entry in entries:
        if is_genuine_user(entry):
            current = []
            turns.append(current)
            continue
        if current is None or entry.get("type") != "assistant" or entry.get("isSidechain"):
            continue
        content = content_of(entry)
        if isinstance(content, str):
            current.append(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
                    current.append(item["text"])
    return turns


def split_turn_texts(entries):
    return ["\n".join(blocks) for blocks in split_turn_blocks(entries)]


def turn_tail(entries):
    """What the final turn closes with — prose after its last tool call. A summary buried mid-body is
    narration the user skips, so only the trailing block counts."""
    tail = None
    for entry in entries:
        if is_genuine_user(entry):
            tail = []
            continue
        if tail is None or entry.get("type") != "assistant" or entry.get("isSidechain"):
            continue
        content = content_of(entry)
        items = content if isinstance(content, list) else [{"type": "text", "text": content}] if isinstance(content, str) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "tool_use":
                tail = []
            elif item.get("type") == "text" and is_reply(item.get("text") or ""):
                tail.append(item["text"])
    if not tail:
        return None
    joined = "\n".join(tail).strip()
    return joined or None


def already_zapped(entries, marker):
    """One zap per turn: the punishment is recorded in the transcript, so a later stop of the same turn — a
    task notification re-opens it — must not re-judge a violation that was already called out and repaired."""
    for entry in reversed(entries):
        if is_genuine_user(entry):
            return False
        att = entry.get("attachment") if entry.get("type") == "attachment" else None
        if att and att.get("type") == "hook_system_message" and marker in str(att.get("content", "")):
            return True
    return False


def split_turns(entries):
    """Each turn is the tool calls made after a genuine user message — mid-turn interjections ride inside
    tool_results, so they never split a turn in two."""
    turns, current = [], None
    for entry in entries:
        if is_genuine_user(entry):
            current = []
            turns.append(current)
            continue
        if current is None or entry.get("type") != "assistant" or entry.get("isSidechain"):
            continue
        content = content_of(entry)
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "tool_use" and item.get("name"):
                    current.append((item["name"], item.get("input") or {}))
    return turns


CREATED = re.compile(r"Task #(\d+) created successfully")


def board_from_transcript(entries):
    """The store is not the only record: every create and update is in the transcript, and TaskCreate's result
    carries the id the tool assigned. Replaying that survives a wipe, a resume and a fork."""
    # One chronological pass, not creates-then-updates: ids are reused after a wipe, so a stale update would
    # otherwise land on the new task holding that id.
    calls, tasks = {}, {}
    for entry in entries:
        content = content_of(entry)
        if not isinstance(content, list):
            continue
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "tool_use" and item.get("name") in BOARD_TOOLS:
                calls[item.get("id")] = (item["name"], item.get("input") or {})
                if item["name"] == "TaskUpdate":
                    args = item.get("input") or {}
                    task = tasks.get(str(args.get("taskId")))
                    if not task:
                        continue
                    if args.get("status") == "deleted":
                        tasks.pop(task["id"], None)
                        continue
                    for field in ("subject", "status", "owner"):
                        if args.get(field):
                            task[field] = args[field]
            elif item.get("type") == "tool_result":
                name, args = calls.pop(item.get("tool_use_id"), (None, None))
                if name != "TaskCreate":
                    continue
                body = item.get("content")
                if not isinstance(body, str):
                    body = " ".join(str(b.get("text", "")) for b in body or [] if isinstance(b, dict))
                found = CREATED.search(body or "")
                if found:
                    tasks[found.group(1)] = {
                        "id": found.group(1),
                        "subject": args.get("subject", ""),
                        "description": args.get("description", ""),
                        "status": "pending",
                        "owner": args.get("owner", ""),
                    }
    return [tasks[k] for k in sorted(tasks, key=int)]


def restore_board(session_id, tasks):
    """Write replayed tasks back into a wiped store. Ids are kept: the id counter survives a wipe (observed
    across resume and restore), so later creates continue above the restored ids and never collide."""
    board_dir = store_dir(session_id)
    os.makedirs(board_dir, exist_ok=True)
    for task in tasks:
        with open(os.path.join(board_dir, "%s.json" % task["id"]), "w") as f:
            json.dump(dict({"blocks": [], "blockedBy": []}, **task), f, indent=2)


def store_dir(session_id):
    return os.path.join(
        os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude"),
        "tasks",
        "session-%s" % (session_id or "")[:8],
    )


def store_task_path(session_id, task_id):
    return os.path.join(store_dir(session_id), "%s.json" % task_id)


def store_board(session_id):
    board_dir = store_dir(session_id)
    tasks = []
    for path in sorted(glob.glob(os.path.join(board_dir, "*.json")), key=lambda p: os.path.basename(p)):
        try:
            with open(path) as f:
                tasks.append(json.load(f))
        except Exception:
            continue
    return tasks


def dedupe_by_subject(tasks):
    """Each store wipe makes the rebuild re-create its receipts under fresh ids, so the replay holds one copy
    per generation — resurrecting them all compounds the board every wipe. Newest copy wins."""
    newest = {}
    for task in tasks:
        newest[re.sub(r"^\s*#\d+\s+", "", task.get("subject") or "")] = task
    return list(newest.values())


def load_board(session_id, entries=None):
    """Store first, transcript replay as fallback. Callers judging VISIBILITY must use store_board directly —
    the fallback answers "what did the board hold", and treating it as the board masks a store that the user
    cannot see (a compact or resume wipes the store while the transcript keeps the history)."""
    return store_board(session_id) or (board_from_transcript(entries) if entries else [])


def last_touch_turn(turns, task):
    # Matched by subject minus the id, which the subject only gains after creation.
    task_id = str(task.get("id"))
    subject = re.sub(r"^\s*#\d+\s+", "", task.get("subject") or "")
    for index in range(len(turns) - 1, -1, -1):
        for name, args in turns[index]:
            if name == "TaskUpdate" and str(args.get("taskId")) == task_id:
                return index
            if name == "TaskCreate" and re.sub(r"^\s*#\d+\s+", "", args.get("subject") or "") == subject:
                return index
    return -1


def turn_shape(turn):
    """What a single turn actually did, in the terms the operating loop cares about."""
    written = {args.get("file_path") for name, args in turn if name in WRITE_TOOLS}
    written.discard(None)
    shape = {
        "written": written,
        "delegated": [name for name, _ in turn if name in DELEGATE_TOOLS],
        "mutations": [
            args.get("command", "")
            for name, args in turn
            if name == "Bash" and MUTATING_SHELL.search(args.get("command", "") or "")
        ],
        "board_calls": [name for name, _ in turn if name in BOARD_TOOLS],
        "created": [name for name, _ in turn if name == "TaskCreate"],
        "created_startable": [
            args.get("subject", "")
            for name, args in turn
            if name == "TaskCreate" and category({"subject": args.get("subject", "")}) not in BLOCKED
        ],
        "completed": [args.get("taskId") for name, args in turn if name == "TaskUpdate" and args.get("status") == "completed"],
        "question": any(name == "AskUserQuestion" for name, _ in turn),
        "calls": len(turn),
    }
    actions = [i for i, (name, args) in enumerate(turn)
               if name in WRITE_TOOLS or name in DELEGATE_TOOLS
               or (name == "Bash" and MUTATING_SHELL.search(args.get("command", "") or ""))]
    boards = [i for i, (name, _) in enumerate(turn) if name in BOARD_TOOLS]
    shape["first_action"] = actions[0] if actions else -1
    shape["first_board"] = boards[0] if boards else -1
    shape["acted_first"] = bool(actions) and bool(boards) and actions[0] < boards[0]

    # One file, one edit is explicitly exempt — a board for a typo fix is ceremony, and crying wolf kills the signal.
    shape["substantial"] = (
        len(written) >= 2
        or bool(shape["delegated"])
        or bool(shape["mutations"])
        or (bool(written) and len(turn) >= 8)
    )
    return shape


def describe(task):
    return "#%s %s" % (task.get("id"), task.get("subject"))


def labeled(task):
    subject = task.get("subject") or ""
    return subject if ID_PREFIX.match(subject) else "#%s %s" % (task.get("id"), subject)


# The client panel truncates around this many items; past it, a rendered list is the only complete view.
FULL_LIST_OVER = 5


def board_full(tasks):
    open_tasks = [t for t in tasks if t.get("status") != "completed"]

    def key(task):
        return (0 if task.get("status") == "in_progress" else 1, {"AI": 0, "USER": 1, "WAIT": 2}[category(task) or "AI"])

    lines = ["Board: %d open" % len(open_tasks)]
    for task in sorted(open_tasks, key=key):
        lines.append("%s%s" % (labeled(task), " — in_progress" if task.get("status") == "in_progress" else ""))
    return "\n".join(lines)


# What it waits on, not who holds it: assignment already lives in owner, and encoding it twice hides a stall.
CATEGORIES = ("AI", "USER", "WAIT")
# Id optional: TaskCreate assigns it after the subject is written, so it is checked separately.
CATEGORY = re.compile(r"^\s*(?:#\d+\s+)?\[(%s)\]" % "|".join(CATEGORIES), re.IGNORECASE)
BLOCKED = ("USER", "WAIT")


ID_PREFIX = re.compile(r"^\s*#(\d+)\s+\[(?:%s)\]" % "|".join(CATEGORIES), re.IGNORECASE)

# Only the id column is padded — it is what the eye scans by. Three columns carries through #999.
ID_COLUMN = 3


def standard_prefix(name, task_id):
    return "%-*s [%s] " % (ID_COLUMN, "#%s" % task_id, name.upper())


def category(task):
    match = CATEGORY.match(task.get("subject") or "")
    return match.group(1).upper() if match else None


def id_gap(task):
    """Why a subject is not self-identifying, or None if it is. The id lives in the subject so that "#4 is yours"
    resolves wherever the subject is rendered — a bare id in prose sends the user hunting for what it refers to.
    TaskCreate assigns the id only after the fact, so this is checked at turn end rather than at creation."""
    subject = task.get("subject") or ""
    match = ID_PREFIX.match(subject)
    if not match:
        return "needs to open with #%s, before the category" % task.get("id")
    if match.group(1) != str(task.get("id")):
        return "carries #%s but its id is #%s" % (match.group(1), task.get("id"))
    expected = standard_prefix(category(task), task.get("id"))
    if not subject.startswith(expected):
        return "padding is off — it must read %r so the ids line up" % expected
    return None


def mine(tasks, turns):
    """Tasks the agent can move on its own. Anything waiting on the user or on a third party is on the board precisely
    so it stays open, and nudging to start or close it would make the board lie. The category prefix settles this
    outright; the owner heuristic below only covers boards written before the convention, where a task's status
    cannot reveal what it is waiting on (a stalled item sits in_progress too) so the best available signal is an
    owner the agent assigned and then drove itself."""
    tagged = [t for t in tasks if category(t)]
    if tagged:
        return [t for t in tasks if category(t) not in BLOCKED]

    owner_of, statuses = {}, {}
    for turn in turns:
        for name, args in turn:
            if name != "TaskUpdate":
                continue
            task_id = str(args.get("taskId"))
            if args.get("owner"):
                owner_of[task_id] = args["owner"]
            if args.get("status"):
                statuses.setdefault(task_id, set()).add(args["status"])

    self_owners = {
        owner_of[task_id]
        for task_id in owner_of
        if statuses.get(task_id, set()) & {"in_progress", "completed"}
    }
    return [t for t in tasks if not t.get("owner") or t.get("owner") in self_owners]
