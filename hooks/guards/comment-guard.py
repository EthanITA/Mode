import json, os, re, sys
from _gate import armed
if not armed():
    sys.exit(0)


SLASH = {".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".go", ".rs", ".java", ".swift", ".kt", ".c", ".h", ".cpp"}
HASH = {".py", ".sh", ".bash", ".zsh", ".rb"}

# A WHY that needs more than this has stopped being a note and become prose.
MAX_BLOCK_LINES = 2
MAX_WORDS = 28
# Two short notes is the WHY exemption; a third is a habit.
QUIET_BLOCKS = 2

# Directives and deprecation markers are not prose.
EXEMPT = re.compile(
    r"eslint-|@ts-|prettier-ignore|noqa|type:\s*ignore|pylint:|flake8:|shellcheck|biome-ignore|DEPRECATED|^#!",
    re.IGNORECASE,
)

STRINGS = re.compile(r"""https?://[^\s"'`]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`""")


def blocks_in(text, marker):
    """Consecutive comment-only lines collapse into one block, because that is the unit a reader meets: three
    stacked // lines are one paragraph to skim, not three findings."""
    found, current = [], []
    for raw in text.split("\n"):
        line = STRINGS.sub("", raw).strip()
        is_comment = line.startswith(marker) or (marker == "//" and line.startswith("/*"))
        if is_comment and not EXEMPT.search(line):
            current.append(raw.strip())
        elif current:
            found.append(current)
            current = []
    if current:
        found.append(current)
    return found


MARKER = re.compile(r"^\s*(?://+|#+|/\*+|\*+)\s*")


def verdicts(blocks, header, whole_file):
    out = []
    if header:
        out.append("it opens with a file-header comment — banned outright")
    for block in blocks:
        words = len(" ".join(MARKER.sub("", line) for line in block).split())
        if len(block) > MAX_BLOCK_LINES:
            out.append("%d-line comment %r — a WHY fits in one line, two at most" % (len(block), block[0][:60]))
        elif words > MAX_WORDS:
            out.append("%d-word comment %r — say it shorter or not at all" % (words, block[0][:60]))
    # Density counts on an Edit, which appends; a Write's total says nothing about restraint.
    if not whole_file and len(blocks) > QUIET_BLOCKS:
        out.append("%d separate comments in one edit — the default is zero" % len(blocks))
    return out


try:
    data = json.loads(sys.stdin.read())
    path = data.get("tool_input", {}).get("file_path") or ""
    extension = os.path.splitext(path)[1].lower()
    marker = "//" if extension in SLASH else "#" if extension in HASH else None
    if not marker:
        sys.exit(0)

    added = data.get("tool_input", {}).get("content") or data.get("tool_input", {}).get("new_string") or ""
    if not added.strip():
        sys.exit(0)

    blocks = blocks_in(added, marker)
    if not blocks:
        sys.exit(0)

    # A header sits before any code, so only the first real line counts.
    whole_file = data.get("tool_name") == "Write"
    header = False
    if whole_file:
        opening = [l.strip() for l in added.split("\n") if l.strip() and not l.startswith("#!")]
        header = bool(opening) and (opening[0].startswith(marker) or opening[0].startswith("/*")) and not EXEMPT.search(opening[0])

    findings = verdicts(blocks, header, whole_file)
    if not findings:
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": (
                        "comment-guard on %s — %s\n\nThe rule this guard enforces: comment WHY, "
                        "never WHAT, and say it in one line. Default is zero comments. Banned outright: file-header "
                        "blurbs, usage blocks, docstrings restating the signature, and anything describing what the "
                        "code does.\n\nA comment survives only if the logic is genuinely non-obvious, or the code "
                        "deliberately diverges from expectation for a specific reason — a hidden constraint, a "
                        "linked workaround, a rejected alternative. Even then it earns one line.\n\nCut what fails "
                        "that test now. Do not narrate the check itself; if you revise, say what changed in a clause."
                        % (os.path.basename(path), "; ".join(findings))
                    ),
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
