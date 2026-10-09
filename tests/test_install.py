"""install.sh against a fake config dir.

The live status line is `node /path/to/index.ts`. Taking the first existing file
on that command used to append a shell block to the Node binary.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from support import PLUGIN, ok, report, section

INSTALL = os.path.join(PLUGIN, "install.sh")
MARKER = "mode-plugin:chips"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.digest()


def run_install(config, *flags):
    return subprocess.run(
        [INSTALL, "--config-dir", config, "--no-aliases", "--yes", *flags],
        cwd=PLUGIN,
        capture_output=True,
        text=True,
    )


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


def write_settings(config, command):
    write(
        os.path.join(config, "settings.json"),
        json.dumps({"statusLine": {"type": "command", "command": command}}, indent=2) + "\n",
    )


def main():
    if not os.path.isfile(INSTALL):
        print("  FAIL  install.sh exists\n          %s is missing" % INSTALL)
        sys.exit(1)

    tmp = tempfile.mkdtemp(prefix="mode-install-")
    try:
        fake_node = os.path.join(tmp, "bin", "node")
        os.makedirs(os.path.dirname(fake_node), exist_ok=True)
        with open(fake_node, "wb") as f:
            f.write(b"\xcf\xfa\xed\xfe" + b"\0" * 64)
        os.chmod(fake_node, 0o755)
        script_ts = os.path.join(tmp, "status-line", "index.ts")
        write(script_ts, "#!/usr/bin/env node\nconsole.log('line')\n")
        node_before = sha(fake_node)
        ts_before = sha(script_ts)

        section("a node status line is left alone")
        config = os.path.join(tmp, "cfg-node")
        write_settings(config, "%s %s" % (fake_node, script_ts))
        p = run_install(config, "--insert-chips")
        ok("install.sh exits zero against a node status line",
           p.returncode == 0,
           "rc=%s err=%r" % (p.returncode, p.stderr[-400:]))
        ok("the node binary is byte-identical after --insert-chips",
           sha(fake_node) == node_before,
           "the installer wrote to the interpreter")
        ok("the TypeScript status line is byte-identical after --insert-chips",
           sha(script_ts) == ts_before,
           "a bash chips block does not belong in a .ts file")
        combined = p.stdout + p.stderr
        ok("the installer says it refused, rather than claiming it appended",
           "Refusing to edit" in combined or "not a shell script" in combined,
           "out=%r" % combined[-600:])

        section("a shell status line still gets the chips block")
        host = os.path.join(tmp, "line.sh")
        write(host, "#!/usr/bin/env bash\nprintf 'hello'\n")
        os.chmod(host, 0o755)
        config_sh = os.path.join(tmp, "cfg-sh")
        write_settings(config_sh, "bash %s" % host)
        p = run_install(config_sh, "--insert-chips")
        ok("install.sh exits zero against a bash status line",
           p.returncode == 0,
           "rc=%s err=%r" % (p.returncode, p.stderr[-400:]))
        with open(host) as f:
            body = f.read()
        ok("the chips marker lands in the shell script",
           MARKER in body,
           "body=%r" % body[-400:])
        ok("the original printf is still there",
           "printf 'hello'" in body,
           "the installer replaced the script instead of appending")

        section("--yes without --insert-chips never writes the host script")
        host2 = os.path.join(tmp, "untouched.sh")
        write(host2, "#!/usr/bin/env bash\nprintf 'keep'\n")
        before = sha(host2)
        config_yes = os.path.join(tmp, "cfg-yes")
        write_settings(config_yes, "bash %s" % host2)
        p = run_install(config_yes)
        ok("--yes alone leaves the host script unchanged",
           sha(host2) == before,
           "out=%r" % (p.stdout + p.stderr)[-500:])

        section("the status line renders the chips with no jq anywhere on PATH")
        # /usr/bin carries jq on recent macOS, so the PATH is built from links to exactly what runs.
        tools = os.path.join(tmp, "tools")
        os.makedirs(tools)
        os.symlink(shutil.which("node"), os.path.join(tools, "node"))
        os.symlink(sys.executable, os.path.join(tools, "python3"))
        bare = {"PATH": tools + ":/bin", "HOME": os.environ["HOME"]}
        ok("the test PATH really has no jq", not shutil.which("jq", path=bare["PATH"]), bare["PATH"])

        config_fresh = os.path.join(tmp, "cfg-fresh")
        p = run_install(config_fresh)
        line = os.path.join(config_fresh, "mode", "statusline.sh")
        ok("a fresh install writes the status line script", p.returncode == 0 and os.path.isfile(line),
           "rc=%s err=%r" % (p.returncode, p.stderr[-400:]))
        subprocess.run([os.path.join(PLUGIN, "bin", "mode"), "mode", "set", "debug", "--session", "inst-1"],
                       env=dict(os.environ, CLAUDE_CONFIG_DIR=config_fresh), capture_output=True)
        p = subprocess.run(["/bin/bash", line], input=json.dumps({"session_id": "inst-1"}),
                           env=dict(bare, CLAUDE_CONFIG_DIR=config_fresh), capture_output=True, text=True)
        ok("it reads the session from the JSON on stdin and prints the held mode",
           "debug" in p.stdout, "out=%r err=%r" % (p.stdout, p.stderr[-300:]))

        fake = os.path.join(tmp, "installed", "mode")
        write(os.path.join(fake, "bin", "mode"), "#!/bin/sh\necho from-manifest\n")
        os.chmod(os.path.join(fake, "bin", "mode"), 0o755)
        write(os.path.join(config_fresh, "plugins", "installed_plugins.json"),
              json.dumps({"plugins": {"mode@local": [{"installPath": fake}]}}))
        p = subprocess.run(["/bin/bash", os.path.join(config_fresh, "mode", "chips.sh"), "inst-1"],
                           env=dict(bare, CLAUDE_CONFIG_DIR=config_fresh), capture_output=True, text=True)
        ok("chips.sh finds the plugin through installed_plugins.json with node",
           p.stdout.strip() == "from-manifest", "out=%r err=%r" % (p.stdout, p.stderr[-300:]))

        section("a node older than the LTS stops the install up front")
        old_node = os.path.join(tmp, "old-node")
        write(os.path.join(old_node, "node"), "#!/bin/sh\necho 20.11.1\n")
        os.chmod(os.path.join(old_node, "node"), 0o755)
        p = subprocess.run([INSTALL, "--config-dir", os.path.join(tmp, "cfg-old"), "--no-aliases", "--yes"],
                           cwd=PLUGIN, capture_output=True, text=True,
                           env=dict(os.environ, PATH=old_node + ":/usr/bin:/bin"))
        ok("install.sh refuses and names the version it found",
           p.returncode == 1 and "Node 24 or newer" in p.stderr and "20.11.1" in p.stderr,
           "rc=%s err=%r" % (p.returncode, p.stderr[-400:]))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    report()


if __name__ == "__main__":
    main()
