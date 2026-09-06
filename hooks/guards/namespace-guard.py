import json, os, re, sys
from _gate import armed
if not armed():
    sys.exit(0)


TYPED = {".ts", ".tsx", ".mts", ".cts", ".vue", ".js", ".jsx", ".mjs", ".cjs"}

STAR = re.compile(r"^\s*export\s+\*\s+(?:as\s+[\w$]+\s+)?from\b", re.M)
DECLARED = re.compile(
    r"^\s*export\s+(?:async\s+)?(?:const|let|var|function\*?|class|abstract\s+class|type|interface|enum)\s+([A-Za-z_$][\w$]*)",
    re.M,
)
PREFIX = re.compile(r"^([a-z]{4,})(?=[A-Z])")
# A verb names an action, not a domain: formatDate beside formatMoney is two formatters, not a Format namespace.
VERBS = {
    "create", "build", "make", "format", "parse", "render", "handle", "fetch", "load", "should", "with", "from",
    "into", "assert", "ensure", "resolve", "validate", "normalize", "serialize", "compute", "toggle", "update",
    "delete", "remove", "apply", "register", "define", "read", "write", "find", "list", "check", "watch",
}


def offenders(text):
    findings = []
    if STAR.search(text):
        findings.append("`export *` re-exports everything: the index is an allowlist, so name what leaves")
    groups = {}
    for name in DECLARED.findall(text):
        found = PREFIX.match(name)
        if found and found.group(1) not in VERBS:
            groups.setdefault(found.group(1), []).append(name)
    for prefix, names in groups.items():
        if len(names) < 2:
            continue
        rest = names[0][len(prefix):]
        findings.append(
            "%d exports share the prefix `%s` (%s): a shared prefix is a namespace asking to exist, `%s.%s()` behind one curated index"
            % (len(names), prefix, ", ".join(names), prefix.capitalize(), rest[:1].lower() + rest[1:])
        )
    return findings


try:
    data = json.loads(sys.stdin.read())
    path = data.get("tool_input", {}).get("file_path") or ""
    if os.path.splitext(path)[1].lower() not in TYPED:
        sys.exit(0)

    # The whole file, not the edit: a sibling added beside an existing export is the case that matters.
    with open(path) as handle:
        findings = offenders(handle.read())
    if not findings:
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": (
                        "namespace-guard on %s: %s\n\nThe rule this guard enforces: every top-level export is a tax "
                        "on every keystroke. A shared prefix is a namespace asking to exist: collapse it before the "
                        "second export, split the domain by concern behind one curated index.ts that names what it "
                        "exports (an allowlist, never `export *`), and name it after the capability you own, not the "
                        "vendor you rent. Stop before ceremony: a lone function needs none, two levels is the "
                        "ceiling.\n\nFix it now. Do not narrate the check itself; if you revise, say what changed in "
                        "a clause." % (os.path.basename(path), "; ".join(findings))
                    ),
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
