import json, os, re, subprocess, sys
from _gate import armed, config, held
from _git import git_calls
from _transcript import WRITE_TOOLS, content_of, read_entries
if not armed():
    sys.exit(0)

DEFAULT_LINES = 30
REPLY = 'teammate_id="director"'
ALL_TRACKED = re.compile(r"^-[a-zA-Z]*a[a-zA-Z]*$")
# The options of `git commit` that take the next token as their value rather than as a path.
VALUED = {"-m", "--message", "-F", "--file", "-C", "--reuse-message", "-c", "--reedit-message", "--author",
          "--date", "--fixup", "--squash", "-t", "--template", "--cleanup", "--trailer", "-S", "--gpg-sign"}
VALUED_CLUSTER = re.compile(r"^-[a-zA-Z]*[mFCct]$")
HATCH = ("A commit of %d changed lines or fewer goes through, and `\"disarm\": [\"pair-guard\"]` in "
         "~/.claude/mode/config.json turns this off.")


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "pair-guard: " + reason,
    }}))
    sys.exit(0)


def pathspecs(rest):
    """The paths a commit names, which it records from the working tree whatever the index holds."""
    if "--" in rest:
        return rest[rest.index("--") + 1:]
    paths, skip = [], False
    for arg in rest:
        if skip:
            skip = False
        elif arg in VALUED or VALUED_CLUSTER.match(arg):
            skip = True
        elif not arg.startswith("-"):
            paths.append(arg)
    return paths


def changed_lines(repo, rest):
    paths = pathspecs(rest)
    if "--all" in rest or any(ALL_TRACKED.match(arg) for arg in rest):
        args = ["diff", "HEAD", "--numstat"]
    elif paths:
        args = ["diff", "HEAD", "--numstat", "--"] + paths
    else:
        args = ["diff", "--cached", "--numstat"]
    done = subprocess.run(["git", "-C", repo] + args, capture_output=True, text=True, timeout=10)
    total = 0
    for line in done.stdout.splitlines():
        added, deleted = (line.split("\t") + ["", ""])[:2]
        # A binary file reports "-" for both, and it still counts as a change somebody should see.
        total += int(added) if added.isdigit() else 1
        total += int(deleted) if deleted.isdigit() else 0
    return total


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, list):
        for item in node:
            yield from strings(item)
    elif isinstance(node, dict):
        for value in node.values():
            yield from strings(value)


def review(entries):
    """Whether a director exists, and whether it answered after the lead's last edit."""
    spawned, last_edit, last_reply = False, -1, -1
    for index, entry in enumerate(entries):
        if entry.get("isSidechain"):
            continue
        content = content_of(entry)
        if entry.get("type") == "assistant" and isinstance(content, list):
            for item in content:
                if not isinstance(item, dict) or item.get("type") != "tool_use":
                    continue
                if item.get("name") in WRITE_TOOLS:
                    last_edit = index
                if item.get("name") == "Agent" and (item.get("input") or {}).get("name") == "director":
                    spawned = True
        # A reply lands as its own message between turns, or inside a tool result when it arrives mid-turn.
        elif entry.get("type") == "user" and any(REPLY in text for text in strings(content)):
            last_reply = index
    return spawned, last_reply > last_edit


try:
    data = json.loads(sys.stdin.read())
    if data.get("tool_name") != "Bash" or data.get("agent_id"):
        sys.exit(0)
    command = (data.get("tool_input") or {}).get("command") or ""
    commits = [(repo, rest) for repo, sub, rest in git_calls(command, data.get("cwd") or os.getcwd()) if sub == "commit"]
    if not commits or held("mode", data.get("session_id") or "") != "pair":
        sys.exit(0)

    limit = int(config().get("review-lines", DEFAULT_LINES))
    size = max(changed_lines(repo, rest) for repo, rest in commits)
    entries = read_entries(data.get("transcript_path"))
    if size <= limit or not entries:
        sys.exit(0)

    spawned, seen = review(entries)
    if seen:
        sys.exit(0)
    if not spawned:
        deny(("This commit records %d changed lines and no director has seen any of it. Spawn one with `Agent`, "
              "`name` set to `director`, send it the diff, and commit after its verdict. " + HATCH) % (size, limit))
    deny(("This commit records %d changed lines and you edited after the director last answered, so it has not "
          "seen what you are committing. Send it the diff with `SendMessage` and commit after its verdict. "
          + HATCH) % (size, limit))
except SystemExit:
    raise
except Exception:
    pass

sys.exit(0)
