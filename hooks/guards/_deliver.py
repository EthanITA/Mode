import json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import config

# Subjects that claim shipment must carry a checkable receipt even before metadata exists.
DELIVERY_SUBJECT = re.compile(
    r"\b(?:push(?:ed)?|merged?|mr\s*!?\d+|deploy(?:ed)?|publish(?:ed)?|release[ds]?)\b", re.IGNORECASE
)

# Narrower than MUTATING_SHELL: only commands that put work in front of someone else.
DELIVERY_SHELL = re.compile(r"\b(?:git\s+push|glab\s+mr\s+(?:create|merge)|gh\s+pr\s+(?:create|merge)|publish:artifact)\b")

# Any MCP server's merge-request or pull-request creator, whichever forge the user is on.
DELIVERY_TOOL = re.compile(r"^mcp__.+__(?:create|merge)_(?:merge_request|pull_request)$")

# Ships empty: only the user knows which tree owes which receipt.
REQUIRED_KIND = tuple(
    (str(tree).lower(), str(kind))
    for tree, kind in (config().get("delivery") or [])
)

MODE = os.environ.get("DELIVER_MODE") or "warn"  # flip to "deny" once a warn-mode week stays quiet


def run(cmd, timeout=30):
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except Exception as exc:
        return -1, "", str(exc)


def required_kind(*hints):
    for hint in hints:
        if not hint:
            continue
        lowered = str(hint).lower()
        for tree, kind in REQUIRED_KIND:
            if tree in lowered:
                return kind
    return None


def verify(done):
    """→ (verdict, detail): "met", "unmet" (the bar genuinely fails, a bad declaration included), or
    "error" (infrastructure — callers fail open so the fence never blocks on a broken network)."""
    kind = (done or {}).get("kind")
    if kind == "mr-merged":
        return verify_mr(done)
    if kind == "pushed":
        return verify_pushed(done)
    if kind == "published":
        return verify_published(done)
    return "unmet", "unknown receipt kind %r — use mr-merged, pushed or published" % kind


def verify_mr(done):
    project, iid = done.get("project"), done.get("iid")
    if not project or not iid:
        return "unmet", "mr-merged needs project and iid in metadata.done"
    glab = os.environ.get("DELIVER_GLAB", "glab")
    code, out, err = run([glab, "mr", "view", str(iid), "-R", str(project), "--output", "json"])
    if code != 0:
        return "error", (err or out or "glab failed")[:200]
    try:
        state = json.loads(out).get("state")
    except Exception:
        return "error", "glab printed non-JSON"
    return ("met", "") if state == "merged" else ("unmet", "MR !%s state is %r, not merged" % (iid, state))


def verify_pushed(done):
    repo = os.path.expanduser(done.get("repo") or "")
    code, _, _ = run(["git", "-C", repo, "rev-parse", "--is-inside-work-tree"], timeout=10)
    if code != 0:
        return "unmet", "repo %r is not a git work tree" % repo
    branch = done.get("branch")
    if not branch:
        code, branch, err = run(["git", "-C", repo, "rev-parse", "--abbrev-ref", "HEAD"])
        if code != 0:
            return "error", err[:200]
    code, upstream, _ = run(["git", "-C", repo, "rev-parse", "--abbrev-ref", "%s@{upstream}" % branch])
    if code != 0:
        return "unmet", "branch %r has no upstream — it was never pushed" % branch
    # Fetch first so "0 ahead" is measured against the real remote, not a stale local ref.
    code, _, err = run(["git", "-C", repo, "fetch", "-q"], timeout=60)
    if code != 0:
        return "error", "fetch failed: %s" % err[:200]
    code, out, err = run(["git", "-C", repo, "rev-list", "--count", "%s..%s" % (upstream, branch)])
    if code != 0:
        return "error", err[:200]
    return ("met", "") if out == "0" else ("unmet", "%s commit(s) on %s not on %s" % (out, branch, upstream))


def verify_published(done):
    url = done.get("url") or ""
    if not url.startswith("https://"):
        return "unmet", "published needs an https url in metadata.done"
    curl = os.environ.get("DELIVER_CURL", "curl")
    code, out, err = run([curl, "-s", "-o", os.devnull, "-w", "%{http_code}", url])
    if code != 0:
        return "error", (err or "curl failed")[:200]
    if out != "200":
        return "unmet", "%s answered %s" % (url, out)
    repo = os.path.expanduser(done.get("repo") or "")
    if repo:
        code, out, err = run(["git", "-C", repo, "status", "--porcelain", done.get("topic") or "."])
        if code != 0:
            return "error", err[:200]
        if out:
            return "unmet", "durable copy has uncommitted changes in %r" % repo
    return "met", ""
