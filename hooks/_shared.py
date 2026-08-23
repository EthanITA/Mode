import json
import os
import subprocess
import sys

# CLAUDE_PLUGIN_ROOT reaches the command string, not reliably the environment, hence the fallback.
ROOT = os.environ.get("CLAUDE_PLUGIN_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# bin/mode owns both slots, so a hook and the status line can never disagree about what is held.
MODE = os.path.join(ROOT, "bin", "mode")

CRASH = "Traceback (most recent call last)"
FALSE = {"false", "no", "off", "n", "0"}


def payload():
    """The hook's stdin as a dict, or an empty one when it is not readable JSON."""
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def sid(session):
    """The --session pair, or nothing when the payload carried no id, since the tool then reads the env."""
    return ["--session", session] if session else []


def run(*args):
    """The exit code and stdout of bin/mode. The code is None when the tool could not run or crashed,
    which a caller has to tell apart from the 1 it returns to mean a deliberate nothing."""
    try:
        done = subprocess.run([MODE] + list(args), capture_output=True, text=True, timeout=5)
    except Exception:
        return None, ""
    if CRASH in done.stderr:
        return None, ""
    return done.returncode, done.stdout.strip()


def ask(*args):
    """What bin/mode printed, or None when it failed, was absent, or had nothing to say."""
    code, out = run(*args)
    return (out or None) if code == 0 else None


def flag(meta, key):
    # Nobody writes an opt-in restriction meaning to leave it off, so only an explicit no reads as off.
    for line in (meta or "").splitlines():
        name, _, value = line.partition(":")
        if name.strip().lower() == key:
            value = value.strip().strip("\"'").lower()
            return bool(value) and value not in FALSE
    return False
