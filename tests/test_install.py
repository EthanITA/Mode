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
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    report()


if __name__ == "__main__":
    main()
