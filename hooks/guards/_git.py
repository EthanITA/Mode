import os, re, shlex

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
