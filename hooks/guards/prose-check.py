import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _gate import armed
if not armed():
    sys.exit(0)

from _transcript import already_zapped, read_entries, split_turn_blocks

FENCED = re.compile(r"```.*?(?:```|\Z)", re.DOTALL)
INLINE = re.compile(r"`[^`\n]+`")
QUOTED = re.compile(r"^[ \t]*>.*$", re.MULTILINE)
# The X/Y/Z template mandates its label dash, so the label prefix (bare, bold or bulleted, matching
# xyz-check's accepted forms) is exempt but the line's content is not.
XYZ_PREFIX = re.compile(r"^([ \t]*(?:[-+][ \t]+)?(?:\*\*|__)?[XYZ](?:\*\*|__)?[ \t]*)[—–][ \t]*", re.MULTILINE)

BANNED = re.compile("[—⇒∩≥≤∴≠≈→]| – ")


def offending_lines(text):
    text = FENCED.sub("", text)
    text = QUOTED.sub("", text)
    text = INLINE.sub("", text)
    text = XYZ_PREFIX.sub(r"\1", text)
    return [line.strip() for line in text.split("\n") if BANNED.search(line)]


try:
    data = json.loads(sys.stdin.read())

    if data.get("stop_hook_active"):
        sys.exit(0)

    entries = read_entries(data.get("transcript_path"))
    blocks = split_turn_blocks(entries)
    reply = "\n".join(blocks[-1]) if blocks else ""
    if not reply.strip() or already_zapped(entries, "prose-check"):
        sys.exit(0)

    hits = offending_lines(reply)
    if hits:
        sample = "\n".join("  | %s" % line[:160] for line in hits[:4])
        extra = "\n  (+%d more lines)" % (len(hits) - 4) if len(hits) > 4 else ""
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "Stop",
                        "additionalContext": (
                            "Your reply carries AI-slop fingerprints banned by rules/prose.md (em dashes, "
                            "math/logic symbols or arrow chains in prose):\n%s%s\n"
                            "Post a follow-up that rewrites ONLY these lines in the human register: a comma, a "
                            "colon, parentheses or a second sentence instead of the dash; plain words instead of "
                            "symbols. Keep it short and do not restate the rest of the reply." % (sample, extra)
                        ),
                    },
                    "systemMessage": "⚡ prose-check: slop fingerprints in the reply (em dash / math symbols) — rewriting.",
                    "suppressOutput": True,
                }
            )
        )
except Exception:
    pass

sys.exit(0)
