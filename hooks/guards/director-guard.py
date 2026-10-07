import json, os, re, sys
from _gate import armed
from _git import git_calls
if not armed():
    sys.exit(0)

DIRECTOR = "director"
# A teammate's id carries its name, and a second spawn under the same name gains a counter.
TEAMMATE_ID = re.compile(r"^a(.+?)(?:-\d+)?-[0-9a-f]+$")
GIT_WRITES = {"add", "am", "apply", "checkout", "cherry-pick", "clean", "commit", "merge", "mv", "pull", "push",
              "rebase", "reset", "restore", "revert", "rm", "stash", "switch", "tag", "worktree"}
GIT_READS_OF_WRITE_VERBS = {("stash", "list"), ("stash", "show")}
BRANCH_WRITES = {"-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-f", "--force", "-u",
                 "--set-upstream-to", "--unset-upstream", "--edit-description"}


def writes(sub, rest):
    if sub == "branch":
        # A bare first argument creates a branch, while flags alone only list them.
        return bool(rest) and (not rest[0].startswith("-") or any(arg in BRANCH_WRITES for arg in rest))
    return sub in GIT_WRITES and (sub, (rest or [""])[0]) not in GIT_READS_OF_WRITE_VERBS

REASONS = {
    "write": "The director reviews and decides, and never writes. Put the change in your verdict and the lead makes it.",
    "agent": "The director never spawns agents. Check it yourself with Read and Bash, or ask the lead in your verdict.",
    "board": "The board is the lead's. Put the item in your reply and the lead boards it.",
    "git": "`git %s` changes the repo, and the director never does. Read-only git such as status, diff, log and "
           "show stays yours.",
}


def agent_name(data):
    """The name the agent was spawned under, read from the meta file Claude Code keeps beside the transcript."""
    agent = str(data.get("agent_id") or "")
    if not agent:
        return ""
    base = os.path.splitext(str(data.get("transcript_path") or ""))[0]
    try:
        with open(os.path.join(base, "subagents", "agent-%s.meta.json" % agent)) as f:
            return str(json.load(f).get("name") or "")
    except (OSError, ValueError):
        found = TEAMMATE_ID.match(agent)
        return found.group(1) if found else ""


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "director-guard: " + reason,
    }}))
    sys.exit(0)


try:
    data = json.loads(sys.stdin.read())
    if agent_name(data) != DIRECTOR:
        sys.exit(0)
    tool = data.get("tool_name") or ""
    if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        deny(REASONS["write"])
    if tool == "Agent":
        deny(REASONS["agent"])
    if tool in ("TaskCreate", "TaskUpdate"):
        deny(REASONS["board"])
    if tool == "Bash":
        command = (data.get("tool_input") or {}).get("command") or ""
        for _, sub, rest in git_calls(command, data.get("cwd") or os.getcwd()):
            if writes(sub, rest):
                deny(REASONS["git"] % sub)
except SystemExit:
    raise
except Exception:
    pass

sys.exit(0)
