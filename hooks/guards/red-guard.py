import json, os, re, sys
from _gate import armed
if not armed():
    sys.exit(0)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _shared import ask, flag, payload, run, sid

FLAG = "no-code-without-red"
AUTO = "auto"
WRITES = ("Write", "Edit", "NotebookEdit")

# Behaviour only: refusing prose and config would block the test's own scaffolding.
CODE = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".go", ".rs", ".rb",
        ".java", ".kt", ".kts", ".swift", ".php", ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".m",
        ".scala", ".ex", ".exs", ".clj", ".dart", ".lua", ".pl", ".sh", ".bash", ".zsh", ".ipynb"}
FOLDERS = {"test", "tests", "spec", "specs", "__tests__", "e2e", "it", "integration", "cypress",
           "features", "testing", "fixtures", "__mocks__"}
TESTISH = re.compile(r"(^|[._-])(test|tests|spec|specs)([._-]|$)|^conftest$")

DENIED = (
    "the '%s' mode holds one rule above all others: no implementation line exists before a test that "
    "was watched failing for the right reason. %s is implementation, and no failing run is on record "
    "since the last passing one, so this edit is refused."
)
FIX = (
    " Write the test, run the suite, and read the failure. Red means the assertion fired: an import "
    "error, a missing fixture or a typo is a broken test rather than a red one, and the recorder only "
    "counts a run it saw exit non-zero. Once that run has happened this edit goes through on its own. "
    "Editing the test itself is never refused, and `/mode off` ends the mode if the rule is wrong here."
)


def target(data):
    args = data.get("tool_input") or {}
    return str(args.get("file_path") or args.get("notebook_path") or "")


def implementation(path):
    """Whether this file is the kind the rule is about, which is code that is not itself a test."""
    if not path:
        return False
    stem, ext = os.path.splitext(os.path.basename(path))
    if ext.lower() not in CODE:
        return False
    parts = {p.lower() for p in path.split(os.sep)}
    return not (parts & FOLDERS) and not TESTISH.search(stem.lower())


def verdict(session, path):
    """The reason to deny, or "" to allow. Blind is not guilty: every unreadable input allows."""
    mode = ask("mode", "get", *sid(session))
    if not mode or mode == AUTO:
        return ""
    if not flag(ask("show", "mode", "--meta", *sid(session)), FLAG):
        return ""
    if not implementation(path):
        return ""
    code, _ = run("red", *sid(session))
    # Only a deliberate 1 means no red is standing; a crash leaves the guard blind, so it allows.
    if code != 1:
        return ""
    return DENIED % (mode, os.path.basename(path)) + FIX


try:
    data = payload()
    if data.get("tool_name") in WRITES:
        reason = verdict(data.get("session_id") or "", target(data))
        if reason:
            print(
                json.dumps(
                    {
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "permissionDecision": "deny",
                            "permissionDecisionReason": "red-guard — %s" % reason,
                        }
                    }
                )
            )
except Exception:
    pass

sys.exit(0)
