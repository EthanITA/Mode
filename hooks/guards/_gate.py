import json
import os
import subprocess
import sys

HOME = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
MODE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "bin", "mode")


def config() -> dict:
    try:
        return json.loads(open(os.path.join(HOME, "mode", "config.json")).read())
    except Exception:
        return {}


def armed() -> bool:
    """Guards are on unless the config explicitly says off, matching the plugin's flag philosophy."""
    settings = config()
    value = str(settings.get("guards", "")).strip().strip("\"'").lower()
    if value in ("false", "no", "off", "n", "0"):
        return False
    # The running guard's file stem, so `disarm` names guards without each one passing its own name.
    return os.path.splitext(os.path.basename(sys.argv[0]))[0] not in settings.get("disarm", [])


def held(axis: str, session: str) -> str:
    try:
        done = subprocess.run([sys.executable, MODE, axis, "get", "--session", session],
                              capture_output=True, text=True, timeout=5)
        return done.stdout.strip() if done.returncode == 0 else ""
    except Exception:
        return ""


def style_held(session: str) -> str:
    return held("style", session)
