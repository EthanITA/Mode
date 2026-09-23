import json, os, re, shlex, subprocess, sys
from _gate import armed
from _transcript import WRITE_TOOLS, content_of, read_entries
if not armed():
    sys.exit(0)


SEGMENTS = re.compile(r"\n|;|&&|\|\||\|")
ASSIGNMENT = re.compile(r"^\w+=")
WRAPPERS = {"sudo", "command", "nohup", "time", "exec", "env"}


def git_calls(command, base):
    """Each git invocation with the directory it runs in, following `cd` and `-C` the way the shell would."""
    where, calls = base, []
    for segment in SEGMENTS.split(command):
        try:
            tokens = shlex.split(segment)
        except ValueError:
            continue
        while tokens and (tokens[0] in WRAPPERS or ASSIGNMENT.match(tokens[0])):
            tokens = tokens[1:]
        if not tokens:
            continue
        if tokens[0] == "cd" and len(tokens) > 1:
            where = os.path.join(where, os.path.expanduser(tokens[1]))
            continue
        if tokens[0].split("/")[-1] != "git":
            continue
        args, here = tokens[1:], where
        while args and args[0].startswith("-"):
            if args[0] in ("-C", "-c") and len(args) > 1:
                if args[0] == "-C":
                    here = os.path.join(here, os.path.expanduser(args[1]))
                args = args[2:]
            else:
                args = args[1:]
        if args:
            calls.append((here, args[0], args[1:]))
    return calls


def risky(sub, rest):
    return sub in ("switch", "checkout") or (sub == "reset" and "--hard" in rest)


def git(repo, *args):
    done = subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True, timeout=10)
    return done.stdout if done.returncode == 0 else None


def owned(transcript):
    paths = set()
    for entry in read_entries(transcript):
        content = content_of(entry)
        for item in content if isinstance(content, list) else []:
            if isinstance(item, dict) and item.get("type") == "tool_use" and item.get("name") in WRITE_TOOLS:
                path = (item.get("input") or {}).get("file_path")
                if path:
                    paths.add(os.path.realpath(path))
    return paths


def foreign(repo, rest, mine):
    top = (git(repo, "rev-parse", "--show-toplevel") or "").strip()
    changed = git(repo, "diff", "--name-only", "HEAD") if top else None
    if not changed:
        return []
    paths = [os.path.realpath(os.path.join(top, p)) for p in changed.split("\n") if p]
    # `checkout -- file` only touches the files it names, so edits elsewhere are not at stake.
    if "--" in rest:
        named = {os.path.realpath(os.path.join(repo, p)) for p in rest[rest.index("--") + 1:]}
        paths = [p for p in paths if p in named]
    return [os.path.relpath(p, top) for p in paths if p not in mine]


try:
    data = json.loads(sys.stdin.read())
    if data.get("tool_name") != "Bash":
        sys.exit(0)

    command = data.get("tool_input", {}).get("command") or ""
    calls = [c for c in git_calls(command, data.get("cwd") or os.getcwd()) if risky(c[1], c[2])]
    if not calls:
        sys.exit(0)

    mine = owned(data.get("transcript_path"))
    for repo, sub, rest in calls:
        theirs = foreign(repo, rest, mine)
        if not theirs:
            continue
        shown = ", ".join(theirs[:5]) + (" and %d more" % (len(theirs) - 5) if len(theirs) > 5 else "")
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "git-guard — `git %s` in %s would carry or discard uncommitted changes this session "
                            "did not make: %s.\n\nThe rule this guard enforces: a checkout can hold someone "
                            "else's work in progress. `git switch` and `git checkout` carry it onto another "
                            "branch, and `git reset --hard` or `git checkout -- <file>` destroy it. Park it first "
                            "with `git stash push -u -m \"<whose work, why parked>\"` and pop it back when you are "
                            "done, or ask the user. Do not narrate the block." % (sub, repo, shown)
                        ),
                    }
                }
            )
        )
        break
except Exception:
    pass

sys.exit(0)
