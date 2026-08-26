"""The shipped contracts, read straight off disk and judged against the front matter contract.

test_cli.py proves the tool behaves. This proves the ten files it reads are written correctly,
so it fails when somebody writes a contract wrong rather than when the tool breaks. The front
matter is parsed here independently of bin/mode, so a parser bug cannot make this suite pass.
"""

import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from support import COLORS, EXITS, MODES, PLUGIN, STYLES, live, ok, out, report, require_tool, section, skip

BUDGET = 4
SUMMARY_MAX = 120

EM = re.compile(r"—|–")
# A hyphen spaced on both sides splices a clause the way an em dash does; a list bullet does not.
SPLICE = re.compile(r"\S +- +\S")
STRUCTURE = re.compile(r"^\s*(---+|\|[\s|:-]+\|)\s*$")

PLACEHOLDER = re.compile(r"\{\{([A-Za-z0-9_]+)\}\}")
PATHISH = re.compile(r"(?:skills|hooks|bin|commands|tests|\.claude-plugin)/[A-Za-z0-9_./-]+")


def split_front_matter(text):
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            meta = {}
            for line in lines[1:i]:
                if ":" in line:
                    key, _, value = line.partition(":")
                    meta[key.strip()] = value.strip()
            return meta, "\n".join(lines[i + 1:])
    return {}, text


def standing_block(body):
    out_lines = []
    inside = False
    for line in body.splitlines():
        if line.strip().lower().startswith("## standing reminder"):
            inside = True
            continue
        if inside and line.startswith("## "):
            break
        if inside:
            out_lines.append(line)
    return [l for l in out_lines if l.strip()]


def prose_dashes(text):
    hits = []
    for line in text.splitlines():
        if STRUCTURE.match(line):
            continue
        if EM.search(line) or SPLICE.search(line):
            hits.append(line.strip())
    return hits


require_tool()

axes = {"mode": MODES, "style": STYLES}
loaded = {"mode": {}, "style": {}}

for axis, folder in axes.items():
    section("the %s folder" % axis)
    if not os.path.isdir(folder):
        ok("%s/ exists" % os.path.relpath(folder, PLUGIN), False,
           "%s is missing, so every check on this axis below is unrunnable" % folder)
        continue
    names = sorted(n for n in os.listdir(folder) if n.endswith(".md"))
    expected = 8 if folder.endswith("modes") else 5
    ok("%s/ holds %d contracts" % (os.path.relpath(folder, PLUGIN), expected),
       len(names) == expected, "found %d: %r" % (len(names), names))

    for filename in names:
        stem = filename[:-3]
        with open(os.path.join(folder, filename)) as f:
            text = f.read()
        meta, body = split_front_matter(text)
        loaded[axis][stem] = (meta, body, text)

        ok("%s: front matter parses" % filename, bool(meta),
           "unterminated fence, or no key: value lines, so the tool reads this contract as nameless")
        if not meta:
            continue

        ok("%s: name matches the filename stem" % filename, meta.get("name") == stem,
           "name is %r. The tool resolves a contract by filename, so the two disagreeing means "
           "`show` prints one name and `get` another." % meta.get("name"))

        summary = meta.get("summary", "")
        ok("%s: carries a one-line summary" % filename,
           bool(summary) and "\n" not in summary and len(summary) <= SUMMARY_MAX,
           "summary is %r (%d chars). It is what `list` prints and the chip shows, so past %d it "
           "wraps the status line." % (summary, len(summary), SUMMARY_MAX))

        colour = meta.get("color", "")
        ok("%s: declares a colour the chip can render" % filename, colour in COLORS,
           "color is %r, expected one of %s" % (colour, ", ".join(COLORS)))

        exit_when = meta.get("exit-when", "")
        ok("%s: exit-when is one of the three legal values" % filename, exit_when in EXITS,
           "exit-when is %r, expected one of %s. Anything else never fires, so the contract is "
           "held until it is turned off by hand." % (exit_when, ", ".join(EXITS)))

        # An alternative with an apostrophe misses both the bare spelling and a pasted curly one.
        quoted = [a for a in meta.get("enter-when", "").split("|") if "'" in a or "’" in a]
        ok("%s: no enter-when alternative contains an apostrophe" % filename, not quoted,
           "%r. It would match one of the three spellings a person types and miss the other two."
           % quoted)

        never = meta.get("enter-never")
        ok("%s: enter-never, if present, is the literal true" % filename,
           never is None or never == "true",
           "enter-never is %r. Only the literal true counts, so this contract is still being "
           "offered to the chooser." % never)

        block = standing_block(body)
        ok("%s: has a standing reminder" % filename, bool(block),
           "no ## Standing reminder section, so the hook has nothing to inject on later turns")
        ok("%s: the standing reminder is within its %d-line budget" % (filename, BUDGET),
           len(block) <= BUDGET,
           "%d lines. Two slots inject together, so anything over four here pushes the pair past "
           "the eight-line ceiling." % len(block))

        stray = sorted(set(PLACEHOLDER.findall(text)) - {"USER"})
        ok("%s: the only placeholder is USER" % filename, not stray,
           "found %r. The tool substitutes USER and nothing else, so these reach the model raw."
           % stray)

        missing = []
        for token in set(PATHISH.findall(text)):
            token = token.rstrip(".,;:)")
            if not os.path.exists(os.path.join(PLUGIN, token)):
                missing.append(token)
        ok("%s: every path it names exists in the repo" % filename, not missing,
           "%r. A contract pointing at a file that is not there sends the model looking for it."
           % sorted(missing))

        hits = prose_dashes(text)
        ok("%s: no em dash and no spaced clause dash" % filename, not hits,
           " // ".join(hits[:3]))

    taken = {}
    for stem, (meta, _, _) in loaded[axis].items():
        taken.setdefault(meta.get("color", ""), []).append(stem)
    clashes = {c: sorted(n) for c, n in taken.items() if len(n) > 1}
    ok("no two %s contracts share a colour" % axis, not clashes,
       "%r. Both chips render the same colour, so the pair stops being readable at a glance."
       % clashes)
    print("  taken: " + ", ".join("%s=%s" % (c, "+".join(sorted(n))) for c, n in sorted(taken.items())))
    print("  free:  " + ", ".join(sorted(set(COLORS) - set(taken))))

section("colours across the two axes")
# Seven colours over eleven contracts forces four collisions. Inlined rather than parsed out of the
# catalogue, which lives outside this repo and would not ship to a stranger.
RELATED = {
    ("autopilot", "socratic"), ("recon", "ship"), ("studio", "ship"), ("tdd", "ship"),
    ("tdd", "socratic"), ("autopilot", "edu"), ("autopilot", "plain"), ("copilot", "fast"),
    ("debug", "maintainer"), ("debug", "ship"), ("harden", "ship"), ("incident", "maintainer"),
    ("migrate", "ship"), ("refactor", "ship"), ("release", "ship"), ("review", "ship"),
    ("studio", "fast"), ("studio", "native"), ("tdd", "fast"),
    # edu wants the least text that does the job; prove wants the raw output pasted whole.
    ("prove", "edu"), ("prove", "ship"),
    # maintainer leaves the codebase better; tester is forbidden from touching it at all.
    ("tester", "maintainer"), ("tester", "ship"),
}

mode_colour = {s: m.get("color") for s, (m, _, _) in loaded["mode"].items()}
style_colour = {s: m.get("color") for s, (m, _, _) in loaded["style"].items()}
collisions = sorted((m, s) for m, mc in mode_colour.items()
                    for s, sc in style_colour.items() if mc and mc == sc)
for m, s in collisions:
    print("  %-10s + %-11s %s" % (m, s, mode_colour[m]))
ok("every shared colour falls on a pair the catalogue already calls related",
   all(pair in RELATED for pair in collisions),
   "%r. Two chips in the same colour read as one setting, so the pairs that share one have to be "
   "pairs whose combination is already meaningful."
   % [p for p in collisions if p not in RELATED])
# Seven modes take all seven colours, so every style now shares with one.
ok("every style shares a colour, since the modes have taken all seven",
   len(collisions) == len(style_colour),
   "%d collisions against %d styles. Fewer means an axis is wasting a free colour; more means a "
   "colour is repeated inside one axis, which the check above should already have caught."
   % (len(collisions), len(style_colour)))

section("flags that belong to one contract only")
gate = sorted(s for s, (m, _, _) in loaded["mode"].items()
              if m.get("no-dispatch-without-approval") == "true")
ok("no-dispatch-without-approval is on copilot and nothing else", gate == ["copilot"],
   "%r. On a mode nobody is watching this deadlocks: no approval can arrive, so nothing dispatches."
   % gate)
noimpl = sorted(s for s, (m, _, _) in loaded["mode"].items() if m.get("no-implement") == "true")
ok("no-implement is declared on at least copilot", "copilot" in noimpl, "declared on %r" % noimpl)
ok("neither modes-only flag appears on a style",
   not [s for s, (m, _, _) in loaded["style"].items()
        if m.get("no-implement") or m.get("no-dispatch-without-approval")],
   "a style declaring a modes-only flag reads as enforcement that never runs")

section("tdd ships without the gate behind it")
tdd = loaded["mode"].get("tdd")
if tdd is None:
    ok("modes/tdd.md exists", False, "the spec fixes five modes and names tdd as one of them")
else:
    text = tdd[2].lower()
    said = any(p in text for p in ("no hook", "not enforced", "no gate", "nothing enforces",
                                   "not yet enforced", "no enforcement", "does not enforce",
                                   "v2", "on your honour", "on your own"))
    ok("tdd says out loud that nothing enforces it", said,
       "no-code-without-red went to v2, so this contract has no hook behind it. Without the file "
       "saying so, a reader believes a gate is watching them and it is not.")

section("routing, through the real chooser against the real contracts")

ROUTING = [
    # The phrase the spec names: substring matching once sent this to the mode that spawns a team.
    ("the build fails on startup", "debug"),
    ("the implementation fails", "debug"),
    ("the test keeps failing", "debug"),
    ("a failure in the parser", "debug"),
    ("rebuild the index from scratch", ""),
]

with tempfile.TemporaryDirectory() as config:
    def chooses(axis, message, session):
        live(config, axis, "set", "auto", "--session", session)
        return out(live(config, "choose", "--axis", axis, "--message", message, "--session", session))

    for i, (phrase, want) in enumerate(ROUTING):
        got = chooses("mode", phrase, "route%02d" % i)
        ok("%r chooses %s" % (phrase, want or "nothing"), got == want, "chose %r" % got)

    got = chooses("mode", "the build fails on startup", "route-team")
    ok("a bug report never enters the mode that spawns a team", got != "copilot",
       "chose %r. Matching on a bare 'build' hands a failing build to a lead that will delegate it "
       "instead of to the mode that reproduces it." % got)

    got = chooses("style", "the build fails on startup", "route-style")
    ok("and a bug report picks no style either", got == "",
       "chose %r on the style axis, so the two folders are being matched against each other" % got)

report()
