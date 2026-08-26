import json, os, re, sys
from _gate import armed
if not armed():
    sys.exit(0)


TELLS = [
    ("dated entry", re.compile(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}")),
    ("clock time", re.compile(r"\b[0-2]?[0-9]:[0-5][0-9]\b")),
    ("commit hash", re.compile(r"`(?=[0-9a-f]{7,40}`)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}`")),
    ("verification claim", re.compile(r"\((?:verified|audited|reproduced|tested|confirmed)\b|\b(?:verified|audited|reproduced|last verified)\s+(?:on |in )?20[0-9]{2}", re.I)),
    ("exit code", re.compile(r"\bexits? [=0-9]|exit=[0-9]")),
    ("point-in-time phrasing", re.compile(r"\b(?:as of|currently|right now|at the moment|for now, )\b", re.I)),
    ("scratch path", re.compile(r"/private/tmp/|/var/folders/")),
    ("merge request ref", re.compile(r"![0-9]{1,5}\b")),
    ("session id", re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-")),
]

BULLET = re.compile(r"^\s*(?:[-*+]\s+|\d+\.\s+)")
# A single long rule is fine; several bullets at once is a dump.
MAX_BULLETS = 3
MAX_CHARS = 1600

STOPWORDS = {"the", "a", "an", "and", "or", "to", "of", "in", "is", "it", "that", "this", "for", "on", "not", "be", "as", "with", "you", "i", "my", "me"}
# Overlap against the smaller line: Jaccard sinks exactly when a reworded duplicate is worst.
NEAR_DUPLICATE = 0.65


def tokens(line):
    words = re.findall(r"[a-z0-9]+", line.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 2}


def near_duplicate(added_lines, file_lines):
    """The old message asked the agent to check for an existing copy of the rule and never checked itself — which
    is the 'a prompt is not a mechanism' trap. A duplicated rule is still present in the file, so comparing each
    added line against every other line finds it without needing the pre-write version."""
    best = None
    added_set = {l.strip() for l in added_lines}
    for line in added_lines:
        mine = tokens(line)
        if len(mine) < 5:
            continue
        for other in file_lines:
            trimmed = other.strip()
            # An Edit anchors on existing text, so a line the file merely extends is context, not a new rule.
            if trimmed in added_set or len(trimmed) < 20 or trimmed.startswith(line.strip()):
                continue
            theirs = tokens(other)
            if not theirs:
                continue
            score = len(mine & theirs) / min(len(mine), len(theirs))
            if score >= NEAR_DUPLICATE and (best is None or score > best[0]):
                best = (score, line.strip(), other.strip())
    return best


try:
    data = json.loads(sys.stdin.read())
    path = data.get("tool_input", {}).get("file_path") or ""
    name = os.path.basename(path)
    if not (name in ("CLAUDE.md", "preferences.md") or re.search(r"/\.claude/rules/[^/]+\.md$", path)):
        sys.exit(0)

    added = data.get("tool_input", {}).get("content") or data.get("tool_input", {}).get("new_string") or ""
    if not added.strip():
        sys.exit(0)

    findings = []
    for label, pattern in TELLS:
        hits = pattern.findall(added)
        if hits:
            findings.append("%dx %s (%s)" % (len(hits), label, ", ".join(repr(str(h))[:24] for h in hits[:2])))

    added_lines = [l for l in added.split("\n") if l.strip()]

    # A Write's size measures the file's job, not the addition — PostToolUse cannot see the previous version.
    if data.get("tool_name") != "Write":
        bullets = [l for l in added_lines if BULLET.match(l)]
        if len(bullets) > MAX_BULLETS:
            findings.append("%d new bullets in one edit — a rule is a line, not a list" % len(bullets))
        if len(added) >= MAX_CHARS:
            findings.append("%d chars in one edit" % len(added))

    try:
        with open(path) as f:
            file_lines = [l for l in f.read().split("\n") if l.strip()]
    except Exception:
        file_lines = []

    duplicate = near_duplicate(added_lines, file_lines)
    if duplicate:
        findings.append(
            "%d%% overlap with a rule already in the file — %r already says %r"
            % (round(duplicate[0] * 100), duplicate[1][:70], duplicate[2][:70])
        )

    if not findings:
        sys.exit(0)

    advice = (
        "Consolidate instead of appending a second copy — and if a rule is already there and still did not bind, "
        "the fix is a mechanism, not another sentence."
        if duplicate
        else "A durable file holds only what changes future behaviour. For every line you just added: would a "
        "future session act differently because of it? If not, it belonged in the reply. Never durable: "
        "verification receipts, exit codes, dated inventories, commit hashes, incident logs, one-off decisions."
    )

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": (
                        "memory-guard on %s (%d lines) — %s\n\n%s\n\nCut it down now. Do not narrate the check "
                        "itself; if you revise, say what changed in a clause."
                        % (name, len(file_lines), "; ".join(findings), advice)
                    ),
                }
            }
        )
    )
except Exception:
    pass

sys.exit(0)
