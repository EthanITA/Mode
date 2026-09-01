"""The comment round trip for an artifact: the seed block, the merge, and the local sink.

`bin/artifact` owns resolving and stamping; this owns everything the review layer writes.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BLOCK_RE = re.compile(r"<!-- rv:start -->.*?<!-- rv:end -->\n?", re.S)
SEED_RE = re.compile(r'(<script type="application/json" id="rv-seed">)(.*?)(</script>)', re.S)
PORT = 7391


def plugin_root() -> Path:
    # Resolved, not raw, so the plugin folders are found through a symlinked or shimmed bin.
    return Path(os.environ.get("MODE_PLUGIN_ROOT") or Path(__file__).resolve().parent.parent)


def config_home() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")) / "mode"


def config() -> dict:
    try:
        data = json.loads((config_home() / "config.json").read_text(errors="replace"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def layer_file() -> Path:
    return plugin_root() / "skills" / "create-artifact" / "assets" / "review-layer.html"


def user_label() -> str:
    return str(config().get("user") or "User")


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def read_doc(path: Path) -> dict:
    m = SEED_RE.search(path.read_text(errors="replace"))
    if not m:
        return {"v": 1, "slug": path.stem, "threads": []}
    try:
        doc = json.loads(m.group(2)) or {}
    except json.JSONDecodeError:
        doc = {}
    doc.setdefault("v", 1)
    doc.setdefault("slug", path.stem)
    doc.setdefault("threads", [])
    return doc


def write_doc(path: Path, doc: dict) -> None:
    text = path.read_text()
    if not SEED_RE.search(text):
        raise SystemExit(f"{path.name} carries no review layer. Run: artifact review {path.stem}")
    body = json.dumps(doc, ensure_ascii=False)
    path.write_text(SEED_RE.sub(lambda m: m.group(1) + body + m.group(3), text, count=1))


def merge(a: list[dict], b: list[dict]) -> list[dict]:
    """Newest `updated` wins per thread, replies unioned: both sides edit the same page offline."""
    out: dict[str, dict] = {}
    for t in list(a or []) + list(b or []):
        if not isinstance(t, dict) or not t.get("id"):
            continue
        prev = out.get(t["id"])
        if not prev:
            out[t["id"]] = {**t, "replies": list(t.get("replies") or [])}
            continue
        win = t if (t.get("updated") or "") >= (prev.get("updated") or "") else prev
        seen = {r["id"]: r for r in (prev.get("replies") or []) + (t.get("replies") or []) if r.get("id")}
        out[t["id"]] = {**win, "replies": sorted(seen.values(), key=lambda r: r.get("at") or "")}
    return sorted(out.values(), key=lambda t: t.get("at") or "")


def ingest(path: Path, incoming: dict) -> tuple[int, int]:
    doc = read_doc(path)
    before = len(doc["threads"])
    doc["threads"] = merge(doc["threads"], incoming.get("threads") or [])
    doc["updated"] = now()
    write_doc(path, doc)
    return len(doc["threads"]) - before, len(doc["threads"])


def install(path: Path, sink: str = "") -> str:
    """Inject or refresh the layer in place, carrying whatever threads the page already holds."""
    layer_src = layer_file()
    if not layer_src.is_file():
        raise SystemExit(f"no review layer at {layer_src}")
    kept = read_doc(path)["threads"] if SEED_RE.search(path.read_text(errors="replace")) else []
    doc = {"v": 1, "slug": path.stem, "sink": sink, "threads": kept}
    layer = SEED_RE.sub(lambda m: m.group(1) + json.dumps(doc, ensure_ascii=False) + m.group(3),
                        layer_src.read_text(), count=1)

    text = path.read_text()
    if BLOCK_RE.search(text):
        path.write_text(BLOCK_RE.sub(lambda _: layer, text, count=1))
        return "refreshed"
    if "</body>" not in text:
        raise SystemExit(f"{path.name} has no </body> to anchor the layer to")
    path.write_text(text.replace("</body>", layer + "</body>", 1))
    return "added"


def render(doc: dict, slug: str) -> str:
    threads = doc.get("threads") or []
    opens = [t for t in threads if t.get("status") != "resolved"]
    done = [t for t in threads if t.get("status") == "resolved"]
    lines = [f"{slug}  {len(opens)} open, {len(done)} resolved"]
    if not threads:
        lines.append("\nNo comments. Nothing is blocking you.")
        return "\n".join(lines)

    user = user_label()
    for t in threads:
        state = "resolved" if t.get("status") == "resolved" else "open"
        where = (t.get("anchor") or {}).get("label") or "the page"
        lines.append(f"\n#{t.get('n')}  {state:<8}  {where}")
        quote = (t.get("anchor") or {}).get("quote")
        if quote:
            lines.append(f"    quoting: {quote}")
        for m in [t] + list(t.get("replies") or []):
            who = "Claude" if m.get("by") == "claude" else user
            said = (m.get("body") or "").splitlines() or [""]
            lines.append(f"    {who}: {said[0]}")
            lines.extend(f"    {' ' * len(who)}  {rest}" for rest in said[1:])

    if opens:
        lines.append(f"\nAnswer one:   artifact comments {slug} --reply <n> \"...\"")
        lines.append(f"Close one:    artifact comments {slug} --resolve <n> \"what changed\"")
    return "\n".join(lines)


def find(doc: dict, n: int) -> dict:
    for t in doc.get("threads") or []:
        if str(t.get("n")) == str(n):
            return t
    raise SystemExit(f"no comment #{n} on this artifact")


def reply(path: Path, n: int, body: str, resolve: bool = False) -> dict:
    doc = read_doc(path)
    t = find(doc, n)
    if body:
        t.setdefault("replies", []).append(
            {"id": f"c{len(t.get('replies') or []) + 1}{n}", "by": "claude", "at": now(), "body": body})
    if resolve:
        t["status"] = "resolved"
        t["resolvedBy"] = "claude"
    t["updated"] = now()
    doc["updated"] = now()
    write_doc(path, doc)
    return t


def serve(path: Path, until: tuple[str, ...] = ("approve", "send"), timeout: int = 0) -> str:
    """Listen for the page. A file:// page cannot write to disk, but it can reach localhost."""
    got: dict = {}
    stop = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def cors(self, code: int = 200, body: bytes = b"ok"):
            self.send_response(code)
            # A file:// page sends Origin: null, so the wildcard is what makes the post land at all.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.cors()

        def do_GET(self):
            self.cors()

        def do_POST(self):
            size = int(self.headers.get("content-length") or 0)
            try:
                data = json.loads(self.rfile.read(size) or b"{}")
            except json.JSONDecodeError:
                return self.cors(400, b"bad json")
            self.cors()
            added, total = ingest(path, data)
            action = str(data.get("action") or "sync")
            print(f"{action}: {added} new, {total} total")
            if action in until:
                got.update(data)
                stop.set()

    server = HTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"listening on http://127.0.0.1:{PORT} for {path.name}")
    stop.wait(timeout or None)
    server.shutdown()
    return str(got.get("action") or "")
