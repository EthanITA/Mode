import json, os, re, subprocess, sys, tempfile
from _gate import MODE, armed
from _git import git_calls
if not armed():
    sys.exit(0)

EDITS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
# Scratch space is where probes and helper scripts live, and none of it is a deliverable.
SCRATCH = tuple({os.path.realpath(p) + os.sep for p in (tempfile.gettempdir(), "/tmp")})
JOB_TMP = re.compile(r"/\.claude/jobs/[^/]+/tmp/")
MR_SHELL = re.compile(r"\b(?:glab\s+mr\s+create|gh\s+pr\s+create)\b")
PUBLISH_SHELL = re.compile(r"\b(?:(?:npm|pnpm|yarn|bun)\s+publish|publish:artifact)\b")
POST_SHELL = re.compile(r"\b(?:glab\s+mr\s+note|gh\s+(?:pr\s+(?:comment|review)|issue\s+(?:comment|create)))\b")
API_POST = re.compile(r"\b(?:glab|gh)\s+api\b.*\b(?:notes|discussions|comments)\b")
WRITES_BODY = re.compile(r"(?:-X\s*POST|--method\s+POST|--input\b|--field\b|--raw-field\b|\s-[fF]\s)")
STAMP_SHELL = re.compile(r"\bartifact\s+stamp\b")
POST_TOOL = re.compile(r"^mcp__.+__(?:send_message|reply|forward|addCommentToJiraIssue|createJiraIssue|"
                       r"createConfluencePage|createConfluenceFooterComment|createConfluenceInlineComment|"
                       r"create_note|create_issue_note|create_merge_request_note)$")
MR_TOOL = re.compile(r"^mcp__.+__create_(?:merge_request|pull_request)$")


def scratch(path):
    real = os.path.realpath(path)
    return real.startswith(SCRATCH) or bool(JOB_TMP.search(real))


def acts(data):
    """Each delivery act this call performs, with the directory whose project decides how it ships."""
    tool, args, cwd = data.get("tool_name") or "", data.get("tool_input") or {}, data.get("cwd") or os.getcwd()
    if tool in EDITS:
        path = str(args.get("file_path") or args.get("notebook_path") or "")
        if path and not scratch(path):
            yield ("artifact" if "/artifacts/" in path else "edit"), path
    elif tool == "Agent" and args.get("name") == "director":
        yield "director", cwd
    elif tool == "Bash":
        command = str(args.get("command") or "")
        for repo, sub, _ in git_calls(command, cwd):
            if sub in ("commit", "push"):
                yield sub, repo
        if MR_SHELL.search(command):
            yield "mr", cwd
        if PUBLISH_SHELL.search(command):
            yield "publish", cwd
        if POST_SHELL.search(command) or (API_POST.search(command) and WRITES_BODY.search(command)):
            yield "post", cwd
        if STAMP_SHELL.search(command):
            yield "artifact", cwd
    elif POST_TOOL.match(tool):
        yield "post", cwd
    elif MR_TOOL.match(tool):
        yield "mr", cwd


try:
    data = json.loads(sys.stdin.read())
    # The lead's north star binds the lead; a teammate works to its own charter.
    if data.get("agent_id"):
        sys.exit(0)
    session = data.get("session_id") or ""
    for verb, path in acts(data):
        done = subprocess.run([sys.executable, MODE, "deliverable", "check", verb, "--path", path]
                              + (["--session", session] if session else []),
                              capture_output=True, text=True, timeout=10)
        if done.returncode == 1 and done.stdout.strip():
            print(json.dumps({"hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": "deliverable-guard: " + done.stdout.strip(),
            }}))
            break
except Exception:
    pass

sys.exit(0)
