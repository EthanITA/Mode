"""git-guard against a scratch repo holding one edit the session made and one it did not."""

import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from support import HOOKS, PLUGIN, ok, report, section

GUARD = os.path.join(HOOKS, "guards", "git-guard.py")


def sh(repo, *args):
    subprocess.run(["git", "-C", repo] + list(args), check=True, capture_output=True, text=True)


def scratch():
    repo = os.path.realpath(tempfile.mkdtemp())
    sh(repo, "init", "-q", "-b", "main")
    sh(repo, "config", "user.email", "t@example.com")
    sh(repo, "config", "user.name", "t")
    for name in ("theirs.txt", "mine.txt"):
        with open(os.path.join(repo, name), "w") as f:
            f.write("committed\n")
    sh(repo, "add", ".")
    sh(repo, "commit", "-q", "-m", "init")
    return repo


def edit(repo, name):
    with open(os.path.join(repo, name), "a") as f:
        f.write("uncommitted\n")


def transcript_editing(path):
    handle = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    handle.write(json.dumps({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "Edit", "input": {"file_path": path}}]}}) + "\n")
    handle.close()
    return handle.name


def fire(command, cwd, transcript):
    config = tempfile.mkdtemp()
    env = dict(os.environ, CLAUDE_PLUGIN_ROOT=PLUGIN, CLAUDE_CONFIG_DIR=config)
    payload = {"hook_event_name": "PreToolUse", "tool_name": "Bash", "cwd": cwd,
               "transcript_path": transcript, "tool_input": {"command": command}}
    done = subprocess.run([sys.executable, GUARD], input=json.dumps(payload), capture_output=True,
                          text=True, env=env)
    return done.stdout


section("git-guard: someone else's uncommitted edits")
repo = scratch()
edit(repo, "theirs.txt")
edit(repo, "mine.txt")
mine = transcript_editing(os.path.join(repo, "mine.txt"))

out = fire("git switch -c other", repo, mine)
ok("a switch that would carry someone else's edit is denied, naming the file",
   '"permissionDecision": "deny"' in out and "theirs.txt" in out and "mine.txt" not in out, out[:300])

out = fire("cd %s && git reset --hard HEAD" % repo, "/", mine)
ok("reset --hard is denied too, with the repo found through `cd`", '"permissionDecision": "deny"' in out, out[:300])

out = fire("git -C %s stash push -u -m parked" % repo, "/", mine)
ok("stashing, the safe way to park the edit, is allowed", not out.strip(), out[:300])

out = fire("git checkout -- mine.txt", repo, mine)
ok("checkout of a file only the session edited is allowed", not out.strip(), out[:300])

sh(repo, "checkout", "--", "theirs.txt")
out = fire("git -C %s reset --hard HEAD" % repo, "/", mine)
ok("with only the session's own edits left, reset --hard is allowed", not out.strip(), out[:300])

report()
