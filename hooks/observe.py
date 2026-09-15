import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _board import news_line
from _shared import ROOT, payload, run, sid

# Only the mode axis: a mode is a pipeline and a style has no steps, so a style ledger would only grow.
AXIS = "mode"

TESTS = re.compile(
    r"\b(pytest|jest|vitest|rspec|phpunit|tox|nose2|"
    r"(go|cargo|mvn|gradle|swift|dotnet)\s+test|"
    r"(npm|yarn|pnpm|bun|deno)\s+(run\s+)?test|"
    r"tests?/run\.py|make\s+(test|check))\b"
)
COMMIT = re.compile(r"\bgit\s+(commit|cherry-pick)\b")
# Only at the top of the folder: a .md one level down is a page's build brief, not an artifact.
ARTIFACT_MD = re.compile(r"/artifacts/[^/]+\.md$")


def observed(data):
    """The step event a tool call just satisfied, read off the call rather than off a claim."""
    tool = data.get("tool_name") or ""
    args = data.get("tool_input") or {}
    failed = data.get("hook_event_name") == "PostToolUseFailure"
    if tool == "AskUserQuestion":
        return "" if failed else "question"
    if tool == "Agent":
        return "" if failed else "agent"
    if tool == "Artifact":
        return "" if failed else "artifact"
    if tool in ("Write", "Edit", "NotebookEdit"):
        path = str(args.get("file_path") or "")
        made = "/artifacts/" in path and (path.endswith(".html") or ARTIFACT_MD.search(path))
        return "artifact" if not failed and made else ""
    if tool == "Bash":
        command = str(args.get("command") or "")
        if COMMIT.search(command):
            return "" if failed else "commit"
        if TESTS.search(command):
            # A suite that went red is its own event, which is what a red-first pipeline waits on.
            return "test-fail" if failed else "test"
    return ""


def record_document(data):
    # bin/artifact is the one writer of a conversation's list, as bin/mode is of its slots.
    path = str((data.get("tool_input") or {}).get("file_path") or "")
    session = data.get("session_id") or ""
    if data.get("hook_event_name") != "PostToolUse" or data.get("tool_name") not in ("Write", "Edit"):
        return
    if not path.endswith(".md") or not session:
        return
    subprocess.run([sys.executable, os.path.join(ROOT, "bin", "artifact"), "touch", path],
                   env=dict(os.environ, CLAUDE_CODE_SESSION_ID=session), capture_output=True, timeout=5)


try:
    data = payload()
    token = observed(data)
    if token:
        run(AXIS, "done", token, *sid(data.get("session_id") or ""))
    record_document(data)

    # Only on the success event: a failed call already owes the model an error, not a board aside.
    if data.get("hook_event_name") == "PostToolUse":
        board = news_line(data.get("session_id") or "")
        if board:
            print(json.dumps({
                "hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": board},
                "suppressOutput": True,
            }))
except Exception:
    pass

sys.exit(0)
