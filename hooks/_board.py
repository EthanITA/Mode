import json
import os

CAP = 6
TEXT_CAP = 60

LINE = ("Board changed in the sidecar: %s. Marco edited the board directly rather than saying it, so "
        "there is nothing to reply to — carry it into what you are doing.")


def _home():
    return os.path.join(os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude"), "board")


def _paths(session_id):
    key = (session_id or "")[:8]
    return os.path.join(_home(), "session-%s.json" % key), os.path.join(_home(), "session-%s.seen" % key)


def _clause(item):
    task = "#%s" % item.get("id")
    kind = item.get("kind")
    if kind == "added":
        text = (item.get("text") or "").strip()
        return '%s added "%s"' % (task, text[:TEXT_CAP - 1].rstrip() + "…" if len(text) > TEXT_CAP else text)
    if kind == "owner":
        return "%s reassigned to %s" % (task, item.get("owner") or "nobody")
    return "%s %s" % (task, kind)


def news_line(session_id):
    """What changed on the board since this session last looked, or "". Advances the cursor, so a delta lands once."""
    state, seen_path = _paths(session_id)
    try:
        with open(state) as fh:
            items = json.load(fh).get("news") or []
    except Exception:
        return ""

    try:
        seen = int(open(seen_path).read().strip())
    except Exception:
        seen = 0

    fresh = [one for one in items if isinstance(one, dict) and (one.get("seq") or 0) > seen]
    if not fresh:
        return ""

    # Cursor first: a delivery we cannot record is one the next tool call would repeat.
    try:
        os.makedirs(_home(), exist_ok=True)
        with open(seen_path, "w") as fh:
            fh.write(str(max(one.get("seq") or 0 for one in fresh)))
    except Exception:
        return ""

    shown = [_clause(one) for one in fresh[:CAP]]
    if len(fresh) > CAP:
        shown.append("and %d more" % (len(fresh) - CAP))
    return LINE % "; ".join(shown)
