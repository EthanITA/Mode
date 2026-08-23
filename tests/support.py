"""Shared scaffolding for the three suites.

Every suite runs the real bin/mode against a temp tree of fixture contracts and a temp config
directory, so a test run never reads or writes the state a live conversation is holding.
"""

import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.realpath(__file__))
PLUGIN = os.path.dirname(HERE)
MODE_BIN = os.path.join(PLUGIN, "bin", "mode")
SKILL_DIR = os.path.join(PLUGIN, "skills", "mode")
MODES = os.path.join(SKILL_DIR, "modes")
STYLES = os.path.join(SKILL_DIR, "styles")
HOOKS = os.path.join(PLUGIN, "hooks")

COLORS = ("red", "green", "yellow", "blue", "magenta", "cyan", "grey")
EXITS = ("manual", "approved", "mr-opened")

ABSENT = None
# These keys are opt-in restrictions, so presence is the intent and an unknown value confirms it.
ON_SPELLINGS = ("true", "True", "TRUE", '"true"', "yes", "on", "y", "1", "maybe", "banana")
OFF_SPELLINGS = ("false", "False", "FALSE", '"false"', "no", "No", "off", "n", "0", "", "   ", ABSENT)


def flag_fixtures(*keys):
    """One contract per spelling of a boolean, each with its own trigger phrase.

    Passing both keys writes the same spelling into both, which is what lets one fixture set be
    read by the tool and by the hooks and their verdicts compared.
    """
    contracts, expected = {}, {}
    for i, value in enumerate(ON_SPELLINGS + OFF_SPELLINGS):
        stem = "flag%02d" % i
        shown = "absent" if value is ABSENT else "'%s'" % value
        declared = "" if value is ABSENT else "".join("%s: %s\n" % (k, value) for k in keys)
        contracts[stem] = ("---\nname: %s\nsummary: the flag written %s\ncolor: blue\n"
                           "enter-when: trigger%02d\nexit-when: manual\n%s---\n\n"
                           "Body.\n\n## Standing reminder\n\nHold the line.\n"
                           % (stem, shown, i, declared))
        expected[stem] = (shown, "trigger%02d" % i, i < len(ON_SPELLINGS))
    return contracts, expected

FAILURES = []
SKIPPED = []


def ok(name, condition, detail=""):
    print(("  PASS  " if condition else "  FAIL  ") + name + ("" if condition else "\n          %s" % detail))
    if not condition:
        FAILURES.append(name)


def skip(name, why):
    print("  SKIP  " + name + "\n          " + why)
    SKIPPED.append(name)


def section(title):
    print("\n" + title)


def report():
    if SKIPPED:
        print("\n%d skipped: %s" % (len(SKIPPED), ", ".join(SKIPPED)))
    print("\n%s" % ("ALL PASS" if not FAILURES else "FAILED %d: %s" % (len(FAILURES), ", ".join(FAILURES))))
    sys.exit(1 if FAILURES else 0)


def require_tool():
    """Nothing below can mean anything without the tool, so say that once rather than 90 times."""
    if os.path.exists(MODE_BIN):
        return
    print("  FAIL  bin/mode exists, which every assertion below reads through\n"
          "          %s is missing, so this suite can prove nothing" % MODE_BIN)
    print("\nFAILED 1: bin/mode exists")
    sys.exit(1)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


def fixture_root(tmp, name, modes=None, styles=None, skill=None):
    """A plugin tree holding a copy of the real tool and contracts nobody ships.

    Fixture names deliberately differ from the shipped ones, so a test cannot pass by reading
    the live folder when the tool ignores the root it was handed.
    """
    root = os.path.join(tmp, name)
    os.makedirs(os.path.join(root, "bin"), exist_ok=True)
    shutil.copy2(MODE_BIN, os.path.join(root, "bin", "mode"))
    os.chmod(os.path.join(root, "bin", "mode"), 0o755)
    for axis, contracts in (("modes", modes or {}), ("styles", styles or {})):
        os.makedirs(os.path.join(root, "skills", "mode", axis), exist_ok=True)
        for stem, text in contracts.items():
            write(os.path.join(root, "skills", "mode", axis, "%s.md" % stem), text)
    if skill is not None:
        write(os.path.join(root, "skills", "mode", "SKILL.md"), skill)
    return root


def env_for(root, config):
    env = dict(os.environ, CLAUDE_PLUGIN_ROOT=root, CLAUDE_CONFIG_DIR=config)
    for key in ("CLAUDE_CODE_SESSION_ID", "NOTES_MODES", "NOTES_DIR"):
        env.pop(key, None)
    return env


def run(root, config, *args):
    """bin/mode from the fixture root, so relative resolution and the env var agree.

    Session state keys on the first eight characters of the id, so two sessions alike that far
    share one slot. Real ids are UUIDs, but test ids are hand-written and collide easily.
    """
    tool = os.path.join(root, "bin", "mode")
    return subprocess.run([sys.executable, tool] + [str(a) for a in args],
                          capture_output=True, text=True, env=env_for(root, config))


def live(config, *args):
    """The shipped tool against the shipped contracts, for the checks that must see the real tree."""
    return subprocess.run([sys.executable, MODE_BIN] + [str(a) for a in args],
                          capture_output=True, text=True, env=env_for(PLUGIN, config))


def out(p):
    return p.stdout.strip()


def crashed(p):
    return "Traceback (most recent call last)" in p.stderr
