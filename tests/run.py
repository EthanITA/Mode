#!/usr/bin/env python3
"""Run every suite and print one summary.

    python3 tests/run.py            all suites
    python3 tests/run.py cli hooks  only the named ones
"""

import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.realpath(__file__))

SUITES = (
    ("cli", "test_cli.py", "bin/mode against the fixed CLI surface, on fixture contracts"),
    ("contracts", "test_contracts.py", "the ten shipped contracts, and how real phrases route"),
    ("hooks", "test_hooks.py", "each hook against the payload Claude Code sends it"),
    ("install", "test_install.py", "install.sh against a fake config dir, including a node status line"),
)

COUNT = re.compile(r"^  (PASS|FAIL|SKIP)  ", re.M)


def main(argv):
    wanted = [a.lower() for a in argv[1:]]
    chosen = [s for s in SUITES if not wanted or s[0] in wanted]
    if not chosen:
        print("no suite matches %r. Known: %s" % (wanted, ", ".join(s[0] for s in SUITES)))
        return 2

    rows = []
    for key, filename, blurb in chosen:
        print("\n" + "=" * 78)
        print("%s  %s" % (key.upper(), blurb))
        print("=" * 78)
        done = subprocess.run([sys.executable, os.path.join(HERE, filename)],
                              capture_output=True, text=True)
        sys.stdout.write(done.stdout)
        if done.stderr.strip():
            sys.stdout.write("\n--- stderr ---\n" + done.stderr)
        tally = {"PASS": 0, "FAIL": 0, "SKIP": 0}
        for kind in COUNT.findall(done.stdout):
            tally[kind] += 1
        rows.append((key, tally, done.returncode))

    print("\n" + "=" * 78)
    print("SUMMARY")
    print("=" * 78)
    total = {"PASS": 0, "FAIL": 0, "SKIP": 0}
    for key, tally, code in rows:
        for kind in total:
            total[kind] += tally[kind]
        print("  %-10s %3d passed  %3d failed  %3d skipped   %s"
              % (key, tally["PASS"], tally["FAIL"], tally["SKIP"], "ok" if code == 0 else "FAILING"))
    print("  %-10s %3d passed  %3d failed  %3d skipped"
          % ("total", total["PASS"], total["FAIL"], total["SKIP"]))
    failing = [k for k, _, c in rows if c != 0]
    print("\n%s" % ("ALL SUITES PASS" if not failing else "FAILING SUITES: " + ", ".join(failing)))
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
