import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _shared import payload, run, sid

# Only the mode axis: a mode is a pipeline and a style has no steps, so a style ledger would only grow.
AXIS = "mode"

TESTS = re.compile(
    r"\b(pytest|jest|vitest|rspec|phpunit|tox|nose2|"
    r"(go|cargo|mvn|gradle|swift|dotnet)\s+test|"
    r"(npm|yarn|pnpm|bun|deno)\s+(run\s+)?test|"
    r"tests?/run\.py|make\s+(test|check))\b"
)
COMMIT = re.compile(r"\bgit\s+(commit|cherry-pick)\b")


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
        return "artifact" if not failed and "/artifacts/" in path and path.endswith(".html") else ""
    if tool == "Bash":
        command = str(args.get("command") or "")
        if COMMIT.search(command):
            return "" if failed else "commit"
        if TESTS.search(command):
            # A suite that went red is its own event, which is what a red-first pipeline waits on.
            return "test-fail" if failed else "test"
    return ""


try:
    data = payload()
    token = observed(data)
    if token:
        run(AXIS, "done", token, *sid(data.get("session_id") or ""))
except Exception:
    pass

sys.exit(0)
