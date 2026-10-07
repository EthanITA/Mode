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


PAIR = os.path.join(HOOKS, "guards", "pair-guard.py")
EDIT = {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Edit", "input": {"file_path": "/x"}}]}}
SPAWN = {"type": "assistant", "message": {"content": [
    {"type": "tool_use", "name": "Agent", "input": {"name": "director", "prompt": "review"}}]}}
REPLY = {"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "t1", "content": [
    {"type": "text", "text": '<teammate-message teammate_id="director">Go.</teammate-message>'}]}]}}


def transcript_of(*entries):
    handle = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    handle.write("".join(json.dumps(e) + "\n" for e in entries))
    handle.close()
    return handle.name


def commit_fire(repo, transcript, held="pair", command="git commit -m wip"):
    config = tempfile.mkdtemp()
    env = dict(os.environ, CLAUDE_PLUGIN_ROOT=PLUGIN, CLAUDE_CONFIG_DIR=config)
    subprocess.run([sys.executable, os.path.join(PLUGIN, "bin", "mode"), "mode", "set", held, "--session", "pg"],
                   capture_output=True, env=env)
    payload = {"hook_event_name": "PreToolUse", "tool_name": "Bash", "session_id": "pg", "cwd": repo,
               "transcript_path": transcript, "tool_input": {"command": command}}
    return subprocess.run([sys.executable, PAIR], input=json.dumps(payload), capture_output=True,
                          text=True, env=env).stdout


section("pair-guard: a big commit waits for the director")
repo = scratch()
with open(os.path.join(repo, "big.txt"), "w") as f:
    f.write("line\n" * 40)
sh(repo, "add", "big.txt")

out = commit_fire(repo, transcript_of(EDIT))
ok("forty staged lines with no director at all are denied, saying to spawn one",
   '"deny"' in out and "no director" in out, out[:300])

out = commit_fire(repo, transcript_of(SPAWN, REPLY, EDIT))
ok("an edit after the director's last answer is denied too", '"deny"' in out and "edited after" in out, out[:300])

out = commit_fire(repo, transcript_of(SPAWN, EDIT, REPLY))
ok("once the director has answered after the last edit, the commit goes", not out.strip(), out[:300])

out = commit_fire(repo, transcript_of(EDIT), held="ic")
ok("outside pair it says nothing", not out.strip(), out[:300])

sh(repo, "reset", "-q")
with open(os.path.join(repo, "mine.txt"), "a") as f:
    f.write("unstaged\n" * 40)
out = commit_fire(repo, transcript_of(EDIT), command="git commit -m wip")
ok("only what the commit records counts, so an empty index commits freely", not out.strip(), out[:300])

out = commit_fire(repo, transcript_of(EDIT), command="git commit -am wip")
ok("while -a counts the tracked edits it would take", '"deny"' in out, out[:300])

out = commit_fire(repo, transcript_of(EDIT), command="git commit -m wip mine.txt")
ok("and so does a path named after the message, which commits its working tree", '"deny"' in out, out[:300])

report()
