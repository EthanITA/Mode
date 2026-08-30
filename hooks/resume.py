import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def remember_root(root):
    """A statusLine command never gets ${CLAUDE_PLUGIN_ROOT} expanded, so the path it needs is left here
    on every session start. Swallowed on failure: a stale status line beats a session that cannot open."""
    try:
        home = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
        pointer = os.path.join(home, "mode", "plugin-root")
        os.makedirs(os.path.dirname(pointer), exist_ok=True)
        with open(pointer, "w") as fh:
            fh.write(root + "\n")
    except Exception:
        pass


try:
    from _shared import ROOT, payload, run, sid

    remember_root(ROOT)
    data = payload()
    session = data.get("session_id") or ""
    # A resume or a compact drops the injected contract while the marker still says it was announced.
    run("clear", "--announced", *sid(session))
    # The first chance a pin gets. adopt fills only an untouched slot, so a resumed conversation
    # that already holds a contract walks past this untouched.
    run("adopt", "--path", data.get("cwd") or os.getcwd(), *sid(session))
except Exception:
    pass

sys.exit(0)
