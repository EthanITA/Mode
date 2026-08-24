"""The hooks, fed the payloads Claude Code actually sends them.

Every hook runs against the shipped contracts and a temp config directory, so the state a live
conversation holds is never read or written. The one hook that writes into the repo, sync, runs
against a copy of the tree instead of the tree itself.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from support import (HOOKS, MODES, PLUGIN, crashed, flag_fixtures, live, ok, out, report,
                     require_tool, section, skip)

EVENTS = ("UserPromptSubmit", "SessionStart", "PostToolUse", "PreToolUse", "SessionEnd",
          "Stop", "SubagentStop", "PreCompact", "Notification")

HOME_PATH = re.compile(r"/Users/|/home/[a-z]|\$HOME|~/")


def hook_env(root, config):
    env = dict(os.environ, CLAUDE_PLUGIN_ROOT=root, CLAUDE_CONFIG_DIR=config)
    for key in ("CLAUDE_CODE_SESSION_ID", "NOTES_MODES", "NOTES_DIR"):
        env.pop(key, None)
    return env


def fire(script, payload, config, root=PLUGIN):
    path = os.path.join(root, "hooks", script)
    runner = ["bash", path] if script.endswith(".sh") else [sys.executable, path]
    body = payload if isinstance(payload, str) else json.dumps(payload)
    return subprocess.run(runner, input=body, capture_output=True, text=True, env=hook_env(root, config))


def prompt_payload(session, text=None):
    body = {"session_id": session, "hook_event_name": "UserPromptSubmit",
            "transcript_path": "/nonexistent.jsonl", "cwd": PLUGIN}
    if text is not None:
        body["prompt"] = text
    return body


def agent_payload(session):
    return {"session_id": session, "hook_event_name": "PreToolUse", "tool_name": "Agent",
            "cwd": PLUGIN,
            "tool_input": {"description": "build a thing", "prompt": "go",
                           "subagent_type": "general-purpose"}}


def context(p):
    return json.loads(p.stdout)["hookSpecificOutput"]["additionalContext"]


def decision(p):
    if not p.stdout.strip():
        return "", ""
    block = json.loads(p.stdout)["hookSpecificOutput"]
    return block.get("permissionDecision", ""), block.get("permissionDecisionReason", "")


require_tool()

# ------------------------------------------------------------------ the manifest

section("hooks/hooks.json")
manifest_path = os.path.join(HOOKS, "hooks.json")
manifest = None
if not os.path.exists(manifest_path):
    ok("hooks/hooks.json exists", False, "%s is missing, so no hook is registered at all" % manifest_path)
else:
    with open(manifest_path) as f:
        raw = f.read()
    try:
        manifest = json.loads(raw)
        ok("hooks.json parses as JSON", True)
    except ValueError as e:
        ok("hooks.json parses as JSON", False, "%s. Claude Code drops the whole plugin's hooks." % e)

    commands = re.findall(r'"command"\s*:\s*"((?:[^"\\]|\\.)*)"', raw)
    ok("every registered hook has a command string", bool(commands), "found none in %r" % raw[:200])

    homey = [c for c in commands if HOME_PATH.search(c)]
    ok("no command carries an absolute home path", not homey,
       "%r. The plugin runs from wherever it was installed, so a home path works on one machine "
       "and silently fails on every other." % homey)

    rooted = [c for c in commands if "${CLAUDE_PLUGIN_ROOT}" not in c]
    ok("every command is written through ${CLAUDE_PLUGIN_ROOT}", not rooted,
       "%r. Anything else resolves against the user's working directory." % rooted)

    missing = []
    for command in commands:
        for token in re.findall(r'\$\{CLAUDE_PLUGIN_ROOT\}/[A-Za-z0-9_./-]+', command):
            rel = token.replace("${CLAUDE_PLUGIN_ROOT}/", "")
            if not os.path.exists(os.path.join(PLUGIN, rel)):
                missing.append(rel)
    ok("every command points at a file that ships", not missing,
       "%r. The hook fails silently on every turn." % sorted(set(missing)))

    if isinstance(manifest, dict):
        declared = sorted(k for k in manifest.get("hooks", manifest) if isinstance(k, str))
        unknown = [e for e in declared if e not in EVENTS]
        ok("every event name is one Claude Code fires", not unknown,
           "%r. An unrecognised event registers nothing and reports nothing." % unknown)
        print("  registered: " + ", ".join(declared))

# ------------------------------------------------------------------ what the hooks answer

section("each hook against a realistic payload")

with tempfile.TemporaryDirectory() as tmp:
    config = os.path.join(tmp, "config")
    os.makedirs(config)

    def mode(session, *args):
        return live(config, "mode", *(list(args) + ["--session", session]))

    def style(session, *args):
        return live(config, "style", *(list(args) + ["--session", session]))

    present = {name: os.path.exists(os.path.join(HOOKS, name))
               for name in ("inject.py", "resume.py", "gate.py", "sync.sh", "_shared.py")}
    for name, there in sorted(present.items()):
        ok("hooks/%s ships" % name, there, "the spec lists it as part of this plugin")

    # -------------------------------------------------------------- inject

    if present["inject.py"]:
        section("inject.py, UserPromptSubmit")
        p = fire("inject.py", prompt_payload("h-quiet", "carry on"), config)
        ok("nothing held is silent, exit 0",
           p.returncode == 0 and not p.stdout.strip(),
           "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))

        mode("h-inject", "set", "copilot")
        p = fire("inject.py", prompt_payload("h-inject", "carry on"), config)
        good = p.returncode == 0 and p.stdout.strip()
        ok("a held mode emits one line of JSON, exit 0", bool(good),
           "rc=%s out=%r err=%r" % (p.returncode, p.stdout[:300], p.stderr[:300]))
        if good:
            body = json.loads(p.stdout)
            ok("the envelope names the event it answers",
               body["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit", repr(body)[:300])
            ok("and carries the contract as additionalContext",
               bool(body["hookSpecificOutput"].get("additionalContext")), repr(body)[:300])
            ok("with no placeholder left in what the model reads",
               "{{" not in context(p), repr(context(p))[:300])

        first = fire("inject.py", prompt_payload("h-edge", "one"), config)
        mode("h-edge", "set", "copilot")
        second = fire("inject.py", prompt_payload("h-edge", "two"), config)
        third = fire("inject.py", prompt_payload("h-edge", "three"), config)
        ok("the turn a mode is entered on carries more than the turn after it",
           len(context(second)) > len(context(third)) > 0,
           "entered=%d settled=%d. The full contract is either never sent or sent on every turn."
           % (len(context(second)), len(context(third))))

        section("/mode routes a name to the axis that owns it")
        # Distinct in the first eight characters, which is all the session key keeps.
        for s, label, typed, want_mode, want_style in (
            ("rt1", "both, mode first", "/mode tdd maintainer", "tdd", "maintainer"),
            ("rt2", "both, either order", "/mode maintainer tdd", "tdd", "maintainer"),
            ("rt3", "a style name alone", "/mode maintainer", "", "maintainer"),
            ("rt4", "a mode name alone", "/mode tdd", "tdd", ""),
            ("rt5", "an unknown name moves nothing", "/mode nonsense", "", ""),
        ):
            fire("inject.py", prompt_payload(s, typed), config)
            got = (out(mode(s, "get")), out(style(s, "get")))
            ok("%s: %s" % (label, typed), got == (want_mode, want_style),
               "got mode=%r style=%r, wanted %r and %r. A name typed on /mode has to reach its own "
               "slot, or it fails silently and reads as though it worked."
               % (got[0], got[1], want_mode, want_style))

        fire("inject.py", prompt_payload("h-route-off", "/mode copilot edu"), config)
        fire("inject.py", prompt_payload("h-route-off", "/mode off"), config)
        ok("/mode off empties the mode and leaves the style alone",
           (out(mode("h-route-off", "get")), out(style("h-route-off", "get"))) == ("", "edu"),
           "mode=%r style=%r. off belongs to the axis it was typed on, since it names no contract."
           % (out(mode("h-route-off", "get")), out(style("h-route-off", "get"))))

        section("inject.py switches the slot the human named")
        mode("h-switch", "set", "copilot")
        style("h-switch", "set", "edu")
        fire("inject.py", prompt_payload("h-switch", "/mode debug"), config)
        ok("/mode <name> moves the mode slot", out(mode("h-switch", "get")) == "debug",
           "mode is %r" % out(mode("h-switch", "get")))
        ok("and leaves the style exactly as it was", out(style("h-switch", "get")) == "edu",
           "style is %r. Naming one slot resets the other." % out(style("h-switch", "get")))

        fire("inject.py", prompt_payload("h-switch", "/style native"), config)
        ok("/style <name> moves the style slot", out(style("h-switch", "get")) == "native",
           "style is %r" % out(style("h-switch", "get")))
        ok("and leaves the mode exactly as it was", out(mode("h-switch", "get")) == "debug",
           "mode is %r" % out(mode("h-switch", "get")))

        fire("inject.py", prompt_payload("h-switch", "/mode off"), config)
        ok("/mode off empties only the mode",
           not out(mode("h-switch", "get")) and out(style("h-switch", "get")) == "native",
           "mode=%r style=%r" % (out(mode("h-switch", "get")), out(style("h-switch", "get"))))

        section("inject.py never breaks a turn")
        for label, payload in (("junk on stdin", "not json"), ("empty stdin", ""),
                               ("valid JSON with nothing in it", "{}")):
            p = fire("inject.py", payload, config)
            ok("%s exits 0 and says nothing" % label,
               p.returncode == 0 and not p.stdout.strip() and not p.stderr.strip(),
               "rc=%s out=%r err=%r" % (p.returncode, p.stdout[:200], p.stderr[:200]))

    # -------------------------------------------------------------- resume

    if present["resume.py"] and present["inject.py"]:
        section("resume.py, SessionStart")
        mode("h-resume", "set", "copilot")
        fire("inject.py", prompt_payload("h-resume", "one"), config)
        settled = context(fire("inject.py", prompt_payload("h-resume", "two"), config))
        r = fire("resume.py", {"session_id": "h-resume", "hook_event_name": "SessionStart",
                               "source": "resume", "cwd": PLUGIN}, config)
        after = context(fire("inject.py", prompt_payload("h-resume", "three"), config))
        ok("a resumed conversation is told the whole contract again",
           r.returncode == 0 and len(after) > len(settled),
           "rc=%s settled=%d after=%d. A resumed session runs on a reminder whose contract it was "
           "never shown." % (r.returncode, len(settled), len(after)))
        ok("and the mode itself survives the resume", out(mode("h-resume", "get")) == "copilot",
           "mode is %r" % out(mode("h-resume", "get")))

        r = fire("resume.py", "not json", config)
        ok("a malformed resume payload never breaks the session",
           r.returncode == 0 and not r.stdout.strip() and not r.stderr.strip(),
           "rc=%s err=%r" % (r.returncode, r.stderr[:200]))

    # -------------------------------------------------------------- gate

    if present["gate.py"]:
        section("gate.py, PreToolUse on Agent")
        p = fire("gate.py", agent_payload("h-gate-none"), config)
        ok("nothing held permits the dispatch", p.returncode == 0 and not p.stdout.strip(),
           "rc=%s out=%r" % (p.returncode, p.stdout[:200]))

        mode("h-gate", "set", "copilot")
        p = fire("gate.py", agent_payload("h-gate"), config)
        verdict, why = decision(p)
        ok("a mode carrying no-dispatch-without-approval denies with nothing approved",
           verdict == "deny",
           "verdict=%r out=%r. The gate is the only thing stopping a lead from dispatching six "
           "agents against a spec nobody read." % (verdict, p.stdout[:200]))
        ok("and the denial says which mode denied and how to clear it",
           "copilot" in why and "approve" in why.lower(), repr(why)[:300])
        ok("the denial is one line of JSON in the PreToolUse shape",
           p.stdout.count("\n") <= 1 and verdict == "deny"
           and json.loads(p.stdout)["hookSpecificOutput"]["hookEventName"] == "PreToolUse",
           repr(p.stdout)[:300])

        live(config, "approve", "some-spec", "--session", "h-gate")
        p = fire("gate.py", agent_payload("h-gate"), config)
        ok("an approval on record permits the dispatch",
           p.returncode == 0 and not p.stdout.strip(),
           "rc=%s denied with %r. An approval that does not open the gate deadlocks the mode: no "
           "second approval can arrive to clear it." % (p.returncode, decision(p)[1][:200]))

        mode("h-gate-free", "set", "debug")
        p = fire("gate.py", agent_payload("h-gate-free"), config)
        ok("a mode that does not declare the flag dispatches freely",
           p.returncode == 0 and not p.stdout.strip(), "denied with %r" % decision(p)[1][:200])

        mode("h-gate", "set", "copilot")
        payload = agent_payload("h-gate-tool")
        payload["tool_name"] = "Bash"
        mode("h-gate-tool", "set", "copilot")
        p = fire("gate.py", payload, config)
        ok("a tool other than Agent is never judged",
           p.returncode == 0 and not p.stdout.strip(), "denied with %r" % decision(p)[1][:200])

        for label, payload in (("junk on stdin", "not json"), ("empty stdin", ""),
                               ("valid JSON with no tool name", "{}")):
            p = fire("gate.py", payload, config)
            ok("%s never blocks work" % label,
               p.returncode == 0 and not p.stdout.strip() and not p.stderr.strip(),
               "rc=%s out=%r err=%r" % (p.returncode, p.stdout[:200], p.stderr[:200]))

        section("a gate that cannot read its inputs lets work through")
        # A crash exits 1, the same code approve uses for a deliberate no.
        BROKEN = "#!/usr/bin/env python3\nprint('noise')\nraise SystemExit(3)\n"
        CRASHING = "#!/usr/bin/env python3\nraise RuntimeError('state unreadable')\n"
        for label, body in (("bin/mode absent", None), ("bin/mode failing", BROKEN),
                            ("bin/mode crashing", CRASHING)):
            hurt = os.path.join(tmp, "hurt-%s" % label.split("/")[-1].replace(" ", "-"))
            shutil.copytree(PLUGIN, hurt, ignore=shutil.ignore_patterns(".git", "tests"))
            target = os.path.join(hurt, "bin", "mode")
            os.remove(target)
            if body is not None:
                with open(target, "w") as f:
                    f.write(body)
                os.chmod(target, 0o755)
            p = fire("gate.py", agent_payload("h-hurt"), config, root=hurt)
            ok("%s permits the dispatch rather than denying it" % label,
               p.returncode == 0 and not p.stdout.strip(),
               "rc=%s denied with %r. A gate that cannot read the mode must not invent a refusal."
               % (p.returncode, decision(p)[1][:200]))

        source = ""
        with open(os.path.join(HOOKS, "gate.py")) as f:
            source = f.read()
        wired = [n for n in ("copilot", "autopilot", "debug", "studio", "tdd") if n in source]
        ok("no contract name is wired into the gate", not wired,
           "%r. The flag decides, so a name in the code means an eleventh mode cannot use the gate."
           % wired)
        ok("the gate never asks approve for --any-mode", "any-mode" not in source,
           "the gate would accept a yes given under a different mode, which is the whole of what "
           "scoping an approval buys")

        section("every spelling of a flag, through both readers, compared")
        # One fixture set carrying both keys at the same spelling. bin/mode reads enter-never and
        # gate.py reads no-dispatch-without-approval, so the same file is judged by both layers.
        flags, wanted = flag_fixtures("enter-never", "no-dispatch-without-approval")
        gateroot = os.path.join(tmp, "gateroot")
        shutil.copytree(PLUGIN, gateroot, ignore=shutil.ignore_patterns(".git", "tests"))
        fixtures = os.path.join(gateroot, "skills", "mode", "modes")
        shutil.rmtree(fixtures)
        os.makedirs(fixtures)
        for stem, text in flags.items():
            with open(os.path.join(fixtures, "%s.md" % stem), "w") as f:
                f.write(text)
        gate_env = hook_env(gateroot, config)
        tool = os.path.join(gateroot, "bin", "mode")

        def tool_says(stem, trigger):
            """bin/mode's reader, seen through the chooser: armed means the contract is withheld."""
            session = "gf-%s" % stem
            for args in (["mode", "set", "auto"], ):
                subprocess.run([sys.executable, tool] + args + ["--session", session],
                               capture_output=True, text=True, env=gate_env)
            p = subprocess.run([sys.executable, tool, "choose", "--axis", "mode", "--message",
                                "%s please" % trigger, "--session", session],
                               capture_output=True, text=True, env=gate_env)
            return p.stdout.strip() == ""

        def gate_says(stem):
            """the hooks' reader, seen through the gate: armed means the dispatch is denied."""
            session = "gg-%s" % stem
            subprocess.run([sys.executable, tool, "mode", "set", stem, "--session", session],
                           capture_output=True, text=True, env=gate_env)
            p = fire("gate.py", agent_payload(session), config, root=gateroot)
            return decision(p)[0] == "deny"

        disagreed = []
        for stem in sorted(flags):
            shown, trigger, armed = wanted[stem]
            by_tool, by_gate = tool_says(stem, trigger), gate_says(stem)
            ok("a flag written %s is %s by both readers" % (shown, "on" if armed else "off"),
               by_tool == armed and by_gate == armed,
               "bin/mode read it as %s and gate.py as %s, expected %s. On when the key is present "
               "and not explicitly false: absent, empty, false, no, off, n and 0 are the whole of "
               "off, and everything else present is on."
               % ("on" if by_tool else "off", "on" if by_gate else "off", "on" if armed else "off"))
            if by_tool != by_gate:
                disagreed.append((shown, by_tool, by_gate))
        ok("the two readers never disagree with each other", not disagreed,
           "%r. One contract file behaving two ways depending on which layer reads it is the "
           "failure this whole section exists to catch." % disagreed)

    # -------------------------------------------------------------- the exit side

    if present["inject.py"]:
        section("an exit ends one slot and leaves the other")
        expiring = None
        for stem in sorted(os.listdir(MODES) if os.path.isdir(MODES) else []):
            if not stem.endswith(".md"):
                continue
            with open(os.path.join(MODES, stem)) as f:
                if re.search(r"^exit-when:\s*approved\s*$", f.read(), re.M):
                    expiring = stem[:-3]
                    break
        if expiring is None:
            skip("an approval ends the mode whose exit-when is approved",
                 "no shipped mode declares exit-when: approved, so this path has nothing to fire on")
        else:
            mode("h-exit", "set", expiring)
            style("h-exit", "set", "edu")
            fire("inject.py", prompt_payload("h-exit", "working"), config)
            live(config, "approve", "a-spec", "--session", "h-exit")
            p = fire("inject.py", prompt_payload("h-exit", "what next"), config)
            ok("an approval ends the %s mode, which declares exit-when: approved" % expiring,
               out(mode("h-exit", "get")) != expiring,
               "mode is still %r after the approval it was waiting on" % out(mode("h-exit", "get")))
            ok("and the turn is told the mode ended rather than it vanishing quietly",
               "ended" in p.stdout.lower() or expiring in p.stdout,
               repr(p.stdout)[:300])
            ok("and the style is exactly where it was",
               out(style("h-exit", "get")) == "edu",
               "style is %r. One slot expiring drops the other." % out(style("h-exit", "get")))

            mode("h-exit2", "set", "auto")
            style("h-exit2", "set", "edu")
            live(config, "mode", "set", expiring, "--chosen", "--session", "h-exit2")
            fire("inject.py", prompt_payload("h-exit2", "working"), config)
            live(config, "approve", "b-spec", "--session", "h-exit2")
            fire("inject.py", prompt_payload("h-exit2", "what next"), config)
            ok("a value a pattern chose returns the slot to auto, not to empty",
               out(mode("h-exit2", "get")) == "auto",
               "slot is %r. The chooser only fills a slot holding auto, so clearing to empty means "
               "this conversation gets one chosen mode and never another."
               % out(mode("h-exit2", "get")))

    # -------------------------------------------------------------- sync

    if present["sync.sh"]:
        section("sync.sh, PostToolUse")
        copy = os.path.join(tmp, "copy")
        shutil.copytree(PLUGIN, copy, ignore=shutil.ignore_patterns(".git"))
        before = {}
        for base, _, names in os.walk(os.path.join(PLUGIN, "skills")):
            for n in names:
                path = os.path.join(base, n)
                with open(path, "rb") as f:
                    before[path] = f.read()
        payload = {"session_id": "h-sync", "hook_event_name": "PostToolUse", "tool_name": "Write",
                   "cwd": copy,
                   "tool_input": {"file_path": os.path.join(copy, "skills", "mode", "modes", "debug.md")}}
        p = fire("sync.sh", payload, config, root=copy)
        ok("sync exits 0 and never breaks the turn that saved a contract",
           p.returncode == 0 and not crashed(p),
           "rc=%s out=%r err=%r" % (p.returncode, p.stdout[:200], p.stderr[:200]))
        touched = []
        for path, was in before.items():
            with open(path, "rb") as f:
                if f.read() != was:
                    touched.append(os.path.relpath(path, PLUGIN))
        ok("and it wrote against the copy, leaving the real tree alone", not touched,
           "%r. Running the suite edited another agent's files, so a test run is no longer safe."
           % touched)

        with open(os.path.join(copy, "skills", "mode", "SKILL.md")) as f:
            registry = f.read()
        ok("sync rewrote the copy's registry from both contract folders",
           "copilot" in registry and "edu" in registry,
           "%r. Saving a contract no longer refreshes what the skill lists." % registry[:400])

report()
