import json, re, sys
from _gate import armed
if not armed():
    sys.exit(0)


MASK = "\x01"

# The harness tells the model to prefer Bash while bypass-permissions is on; these are the calls that rule loses.
AUTHORING = {"cat", "echo", "printf"}
READERS = {"cat", "head", "tail", "sed"}
IN_PLACE = {"sed", "gsed", "perl", "ruby"}

WRAPPERS = {"sudo", "command", "nohup", "time", "exec", "env"}

IN_PLACE_FLAG = re.compile(r"^(?:--in-place|-[A-Za-z]{0,4}i(?:\.[A-Za-z0-9]{1,8})?)$")
BYTE_FLAG = re.compile(r"^(?:-[A-Za-z]*c|--bytes)")
ASSIGNMENT = re.compile(r"^\w+=")
SUBSTITUTION = re.compile(r"[$<]\(")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
REDIRECT = re.compile(r"\d?>>?\s*(&?[^\s;|&<>]+)")
DEV_TARGET = re.compile(r"^(?:&\d|/dev/(?:null|stdout|stderr|fd/\d+))$")
PATHISH = re.compile(r"[/.~$" + MASK + r"]")
SEGMENTS = re.compile(r"\n|;|&&|\|\|")


def strip_heredoc_bodies(cmd):
    """A heredoc body is data, not shell — its `>` and `|` characters must not read as redirects or pipes."""
    lines, kept, i = cmd.split("\n"), [], 0
    while i < len(lines):
        kept.append(lines[i])
        found = HEREDOC.search(lines[i])
        i += 1
        if found:
            while i < len(lines) and lines[i].strip() != found.group(2):
                i += 1
            i += 1
    return "\n".join(kept)


def mask_quotes(text):
    out, i, size = [], 0, len(text)
    while i < size:
        char = text[i]
        if char in "'\"":
            j = i + 1
            while j < size and text[j] != char:
                j += 2 if char == '"' and text[j] == "\\" else 1
            out.append(MASK)
            i = j + 1
        else:
            out.append(char)
            i += 1
    return "".join(out)


def unwrap(tokens):
    """`sudo cat f` and `FOO=1 cat f` are still a cat — the real command hides behind the wrapper."""
    i = 0
    while i < len(tokens) and (tokens[i].split("/")[-1] in WRAPPERS or ASSIGNMENT.match(tokens[i])):
        i += 1
    return tokens[i:] or tokens


def flags_and_args(tokens):
    flags = [t for t in tokens if t.startswith("-") and t != "-"]
    args = [t for t in tokens if not t.startswith("-")]
    return flags, args


def verdict(command):
    body = strip_heredoc_bodies(command)
    masked = mask_quotes(body)
    piped = "|" in masked.replace("||", "")

    for segment in SEGMENTS.split(masked):
        stages = [unwrap(s.split()) for s in segment.split("|") if s.split()]
        if not stages:
            continue
        head = stages[0][0].split("/")[-1]

        for stage in stages:
            name = stage[0].split("/")[-1]
            flags, args = flags_and_args(stage[1:])
            if name in IN_PLACE and any(IN_PLACE_FLAG.match(f) for f in flags):
                return "`%s` edits the file in place. Use Edit, or Write for a full replacement." % name

        targets = [t for t in REDIRECT.findall(segment) if not DEV_TARGET.match(t)]
        tees = [s for s in stages if s[0].split("/")[-1] == "tee"]
        if head in AUTHORING and (targets or tees):
            where = targets[0] if targets else "a file"
            return "`%s` is authoring file content into %s from the shell. Use Write for a new file, Edit to change one." % (head, where)
        if HEREDOC.search(segment) and targets:
            return "a heredoc redirected into %s is a file write. Use Write." % targets[0]

        if not piped and not targets and head in READERS:
            flags, args = flags_and_args(stages[0][1:])
            if head == "tail" and any(f.startswith("-f") or f == "--follow" for f in flags):
                continue
            # `-c` is a byte slice of something Read cannot render, and a substitution is command output, not a file.
            if any(BYTE_FLAG.match(f) for f in flags) or SUBSTITUTION.search(segment):
                continue
            if any(PATHISH.search(a) for a in args):
                return "`%s` is reading a file. Use Read, which gives you line numbers and an offset." % head

    return ""


try:
    data = json.loads(sys.stdin.read())
    if data.get("tool_name") != "Bash":
        sys.exit(0)

    reason = verdict(data.get("tool_input", {}).get("command") or "")
    if not reason:
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "shell-write-guard — %s\n\nThe rule this guard enforces: reading and "
                        "changing files goes through Read, Edit, Write, Glob and Grep, never the shell. This "
                        "overrides the bypass-permissions harness line that tells you to prefer Bash: that line is "
                        "the harness talking, not the user. Bash keeps git, package managers, test runs and pipelines "
                        "no builtin can express. Reissue with the builtin tool; do not narrate the block." % reason
                    ),
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
