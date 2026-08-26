import json, os, re, sys
from _gate import armed
if not armed():
    sys.exit(0)


TYPED = {".ts", ".tsx", ".mts", ".cts", ".vue", ".js", ".jsx", ".mjs", ".cjs"}

# The rule exempts external contracts, and these are where they live.
EXTERNAL_PATH = re.compile(r"(^|/)(drizzle|migrations?|generated|__generated__)/|\.(gen|generated|d)\.ts$|schema\.ts$")
EXTERNAL_LINE = re.compile(r"external contract", re.IGNORECASE)

STRINGS = re.compile(r"""`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'""")
COMMENT = re.compile(r"//.*$|/\*.*?\*/", re.DOTALL | re.MULTILINE)

CHECKS = [
    (
        re.compile(r"\bref\s*<[^>]*\|\s*null[^>]*>"),
        "nullable ref — `ref<T>()` is already `T | undefined`, so `ref<T | null>(null)` adds a second empty value",
    ),
    (
        re.compile(r"\?\s*:\s*[^;,\n=]*\|\s*(?:null|undefined)\b"),
        "`?:` already means optional — `?: T | null` and `?: T | undefined` say it twice",
    ),
    (
        re.compile(r"^\s*(?:readonly\s+)?[A-Za-z_$][\w$]*\s*:\s*[^;,\n=()]*\|\s*undefined\b", re.MULTILINE),
        "optionality is `?:` and nothing else — `quantity?: number`, never `quantity: number | undefined`",
    ),
    (
        re.compile(r"\|\s*null\b|\bnull\s*\|"),
        "a type you author should not union `null` — `undefined` is the absent value",
    ),
    (
        re.compile(r"(?:[!=]==?\s*(?:null|undefined)\b)|(?:\b(?:null|undefined)\s*[!=]==?)"),
        "absence is `!x` / `!!x` / `Boolean(x)`, never a comparison — needing `0` or `\"\"` to survive means the field wants a real default",
    ),
]


def offenders(added):
    findings = []
    for number, raw in enumerate(added.split("\n"), 1):
        if EXTERNAL_LINE.search(raw):
            continue
        line = STRINGS.sub('""', COMMENT.sub("", raw))
        for pattern, message in CHECKS:
            if pattern.search(line):
                findings.append("line %d %r → %s" % (number, raw.strip()[:70], message))
                break
    return findings


try:
    data = json.loads(sys.stdin.read())
    path = data.get("tool_input", {}).get("file_path") or ""
    if os.path.splitext(path)[1].lower() not in TYPED or EXTERNAL_PATH.search(path):
        sys.exit(0)

    added = data.get("tool_input", {}).get("content") or data.get("tool_input", {}).get("new_string") or ""
    findings = offenders(added)
    if not findings:
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": (
                        "null-guard on %s — %s\n\nThe rule this guard enforces: `undefined`, not "
                        "`null`, for \"no value\" — return types, refs, optional fields. A helper you author "
                        "returning `Promise<T | null>` is wrong; return `Promise<T | undefined>`. Optionality is "
                        "`?:` and nothing else. Never test absence by comparison.\n\n`null` is allowed only where an "
                        "external contract demands it — DB columns, foreign JSON, drizzle inserts. If that is the "
                        "case here, say so on the line with an `external contract` comment; otherwise fix it now. "
                        "Do not narrate the check itself; if you revise, say what changed in a clause."
                        % (os.path.basename(path), "; ".join(findings))
                    ),
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
