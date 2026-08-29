"""bin/mode against the CLI surface the spec fixes, exercised through fixture contracts.

Nothing here reads the shipped modes or styles. The fixtures carry names no contract in this
repo uses, so a test that passes is a test the tool actually answered.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from support import (COLORS, crashed, fixture_root, flag_fixtures, live, ok, out, report,
                     require_tool, run, section, skip, write)

LEAD = """---
name: lead
summary: Lead the topic and delegate every domain
color: magenta
no-implement: true
no-dispatch-without-approval: true
exit-when: manual
---

Decompose the topic, then hand each domain to a teammate.

Nothing in this paragraph belongs to the standing block.

## Standing reminder

You lead. You do not implement.
Every domain goes to a teammate.

## After the reminder

Never part of the standing block.
"""

BUGFIX = """---
name: bugfix
summary: Chase the fault to its cause
color: yellow
enter-when: not working|it fails|fail
exit-when: approved
---

Reproduce it before touching anything.

## Standing reminder

Reproduce first. Diagnose second. Fix last.
"""

SHIPPER = """---
name: shipper
summary: Get the branch merged
color: green
enter-when: ship it|open the mr
exit-when: mr-opened
---

Open the merge request.

## Standing reminder

The branch is not done until the merge request is open.
"""

HUSH = """---
name: hush
summary: Only ever entered by hand
color: grey
enter-when: hush now
enter-never: true
exit-when: manual
---

Say nothing unasked.

## Standing reminder

Speak only when spoken to.
"""

CLASH = """---
name: clash
summary: Answers to the same phrase as bugfix
color: red
enter-when: it fails
exit-when: manual
---

Two contracts, one phrase, no winner.

## Standing reminder

Nobody should ever be reading this.
"""

MAKER = """---
name: maker
summary: Build the thing that was asked for
color: blue
enter-when: build the
exit-when: manual
---

Build it.

## Standing reminder

Build what was asked for and stop there.
"""

# A v2 key the tool does not know, and two flags written in the shapes that must count as off.
FUTURE = """---
name: future
summary: Carries keys a later release will add
color: cyan
requires: red-test
enter-when: refactor everything
enter-never: True
no-implement: yes
exit-when: manual
---

A contract from a release that has not happened.

## Standing reminder

Ignore the keys you do not know.
"""

TEACH = """---
name: teach
summary: Explain the mental model before the change
color: cyan
exit-when: manual
---

Teach the thing rather than only doing it.

## Standing reminder

Explain the model to {{USER}} before the change.
Name the trade-off, then recommend one.
"""

BRISK = """---
name: brisk
summary: Answer and stop
color: blue
enter-when: just the answer|be brief
exit-when: manual
---

Short sentences. No preamble.

## Standing reminder

Answer first. Cut every recap.
"""

FORMAL = """---
name: formal
summary: Write it the way a stranger will read it
color: grey
exit-when: manual
---

Full sentences, no shorthand.

## Standing reminder

Write for a reader who was not here.
"""

SKILL = """---
name: mode
description: Hold a mode and a style. Modes available: stale, names. Styles available: stale, names.
---

<!-- modes:start -->
old junk
<!-- modes:end -->

<!-- styles:start -->
old junk
<!-- styles:end -->
"""

MODES = {"lead": LEAD, "bugfix": BUGFIX, "shipper": SHIPPER, "hush": HUSH,
         "clash": CLASH, "maker": MAKER, "future": FUTURE}
STYLES = {"teach": TEACH, "brisk": BRISK, "formal": FORMAL}

LEAD_STANDING = "You lead. You do not implement.\nEvery domain goes to a teammate."


require_tool()


with tempfile.TemporaryDirectory() as tmp:
    root = fixture_root(tmp, "plugin", modes=MODES, styles=STYLES, skill=SKILL)
    config = os.path.join(tmp, "config")
    os.makedirs(config, exist_ok=True)

    ids = {}

    def sid(label):
        """State keys on the first eight characters, so two labels alike that far share one slot."""
        if label not in ids:
            ids[label] = "s%07d-%s" % (len(ids) + 1, label)
        return ids[label]

    def call(session, *args):
        return run(root, config, *(list(args) + ["--session", sid(session)]))

    def axis(name, session, *args):
        """Every axis-scoped verb, written as the spec writes it: the axis, then the verb."""
        return call(session, name, *args)

    def mode(session, *args):
        return axis("mode", session, *args)

    def style(session, *args):
        return axis("style", session, *args)

    def chip(session, which="mode"):
        return axis(which, session, "get", "--chip").stdout.rstrip("\n").split("\t")

    # ------------------------------------------------------------------ the axis words

    section("the surface answers to both axis words")
    p = mode("s-shape", "set", "lead")
    ok("mode set confirms in one line, exit 0",
       p.returncode == 0 and out(p) == "mode set to lead",
       "rc=%s out=%r err=%r. Every other assertion in this file is written in this shape, so if the "
       "axis word is spelled differently the whole suite reports noise." % (p.returncode, p.stdout, p.stderr))
    p = style("s-shape", "set", "teach")
    ok("style set confirms in one line, exit 0",
       p.returncode == 0 and out(p) == "style set to teach",
       "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))

    # ------------------------------------------------------------------ set and get

    section("set and get, per axis")
    ok("the mode set round-trips through get", out(mode("s-shape", "get")) == "lead",
       repr(mode("s-shape", "get").stdout))
    ok("the style set round-trips through get", out(style("s-shape", "get")) == "teach",
       repr(style("s-shape", "get").stdout))

    p = mode("s-empty", "get")
    ok("a clear mode slot prints nothing and still exits 0",
       p.returncode == 0 and not out(p),
       "rc=%s out=%r. A caller reading the exit code would treat a clear slot as a tool failure."
       % (p.returncode, p.stdout))
    p = style("s-empty", "get")
    ok("a clear style slot prints nothing and still exits 0",
       p.returncode == 0 and not out(p), "rc=%s out=%r" % (p.returncode, p.stdout))

    p = mode("s-shape", "set", "nonesuch")
    ok("an unknown mode name exits 2, not 1",
       p.returncode == 2,
       "rc=%s err=%r. Exit 1 is the code these tools use for a deliberate nothing, so a caller cannot "
       "tell a typo from an empty slot." % (p.returncode, p.stderr))
    ok("and an unknown name leaves the held mode standing", out(mode("s-shape", "get")) == "lead",
       repr(mode("s-shape", "get").stdout))

    p = style("s-shape", "set", "nonesuch")
    ok("an unknown style name exits 2 too", p.returncode == 2, "rc=%s err=%r" % (p.returncode, p.stderr))
    ok("and leaves the held style standing", out(style("s-shape", "get")) == "teach",
       repr(style("s-shape", "get").stdout))

    p = style("s-cross", "set", "lead")
    ok("a mode name is not a style name",
       p.returncode == 2,
       "rc=%s out=%r. The two folders would share one namespace, so 'style set lead' would hold a "
       "contract written for the other slot." % (p.returncode, p.stdout))
    p = mode("s-cross", "set", "teach")
    ok("and a style name is not a mode name", p.returncode == 2, "rc=%s out=%r" % (p.returncode, p.stdout))

    p = mode("s-auto", "set", "auto")
    ok("set auto needs no auto.md", p.returncode == 0 and out(p) == "mode set to auto",
       "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))
    ok("and auto round-trips through get", out(mode("s-auto", "get")) == "auto",
       repr(mode("s-auto", "get").stdout))

    p = style("s-auto", "set", "auto")
    ok("the style slot takes auto as well", p.returncode == 0 and out(style("s-auto", "get")) == "auto",
       "rc=%s out=%r" % (p.returncode, p.stdout))

    p = mode("s-auto", "set", "off")
    ok("set off empties the slot, exit 0", p.returncode == 0 and not out(mode("s-auto", "get")),
       "rc=%s held=%r" % (p.returncode, mode("s-auto", "get").stdout))

    # ------------------------------------------------------------------ independence

    section("the two axes are independent, both directions")
    mode("s-indep", "set", "lead")
    style("s-indep", "set", "teach")
    style("s-indep", "set", "brisk")
    ok("changing the style leaves the mode exactly as it was",
       out(mode("s-indep", "get")) == "lead",
       "mode is %r. The slots share a state file and one write is clobbering the other."
       % out(mode("s-indep", "get")))
    mode("s-indep", "set", "maker")
    ok("changing the mode leaves the style exactly as it was",
       out(style("s-indep", "get")) == "brisk",
       "style is %r" % out(style("s-indep", "get")))

    mode("s-indep", "set", "off")
    ok("clearing the mode leaves the style held",
       out(style("s-indep", "get")) == "brisk" and not out(mode("s-indep", "get")),
       "mode=%r style=%r. Turning one slot off would silently drop the other."
       % (out(mode("s-indep", "get")), out(style("s-indep", "get"))))

    mode("s-indep2", "set", "lead")
    style("s-indep2", "set", "teach")
    style("s-indep2", "set", "off")
    ok("clearing the style leaves the mode held",
       out(mode("s-indep2", "get")) == "lead" and not out(style("s-indep2", "get")),
       "mode=%r style=%r" % (out(mode("s-indep2", "get")), out(style("s-indep2", "get"))))

    mode("s-indep3", "set", "auto")
    style("s-indep3", "set", "formal")
    ok("one slot on auto does not put the other on auto",
       out(style("s-indep3", "get")) == "formal" and out(mode("s-indep3", "get")) == "auto",
       "mode=%r style=%r" % (out(mode("s-indep3", "get")), out(style("s-indep3", "get"))))

    mode("s-one", "set", "maker")
    style("s-one", "set", "brisk")
    mode("s-two", "set", "shipper")
    style("s-two", "set", "formal")
    got = (out(mode("s-one", "get")), out(style("s-one", "get")),
           out(mode("s-two", "get")), out(style("s-two", "get")))
    ok("two conversations hold two pairs at once, with no bleed",
       got == ("maker", "brisk", "shipper", "formal"),
       "%r. State is keyed on something other than the session id." % (got,))

    p = run(root, config, "mode", "get", "--session", sid("s-one"))
    ok("--session beats whatever the environment says the session is",
       out(p) == "maker", repr(p.stdout))

    # ------------------------------------------------------------------ the chip

    section("the chip, which the status line splits on tabs")
    fields = chip("s-chipnone")
    ok("a clear slot still emits three fields",
       len(fields) == 3 and fields[0] in ("", "off"),
       "emitted %d field(s): %r. A shell splitting on tabs reads the missing field as absent, so the "
       "status line renders the wrong column." % (len(fields), fields))

    mode("s-chip", "set", "lead")
    fields = chip("s-chip")
    ok("a held mode names itself in field one", fields[0] == "lead", repr(fields))
    ok("a declared colour comes back as its ANSI code in field two", fields[1] == "35",
       "%r. magenta is 35; the status line wraps the chip in this number." % (fields,))
    ok("field three is empty for a mode that was typed", len(fields) == 3 and fields[2] == "",
       "%r. The status line reads field three as the chosen mark." % (fields,))

    style("s-chip", "set", "teach")
    fields = chip("s-chip", "style")
    ok("the style chip is the same three fields", len(fields) == 3 and fields[0] == "teach",
       repr(fields))
    ok("and carries the style's own colour, not the mode's", fields[1] == "36",
       "%r. cyan is 36." % (fields,))

    p = mode("s-chosen", "set", "bugfix", "--chosen")
    ok("set --chosen still confirms in the same one line",
       p.returncode == 0 and out(p) == "mode set to bugfix", repr(p.stdout + p.stderr))
    fields = chip("s-chosen")
    ok("a value a pattern chose is marked in field three", fields == ["bugfix", "33", "chosen"],
       "%r. Without the mark the status line shows a chosen mode as one that was typed, so nobody "
       "can tell what the tool decided on their behalf." % (fields,))

    mode("s-chosen", "set", "bugfix")
    ok("typing the same value drops the chosen mark", chip("s-chosen") == ["bugfix", "33", ""],
       repr(chip("s-chosen")))

    style("s-chosen", "set", "brisk", "--chosen")
    ok("the style axis carries its own chosen mark", chip("s-chosen", "style")[2] == "chosen",
       repr(chip("s-chosen", "style")))
    ok("and marking the style did not mark the mode", chip("s-chosen")[2] == "",
       "%r. One mark is shared between the slots." % (chip("s-chosen"),))

    shapes = {}
    for label, args in (("fresh", None), ("auto", ["set", "auto"]), ("typed", ["set", "lead"]),
                        ("chosen", ["set", "bugfix", "--chosen"]), ("mark dropped", ["set", "maker"]),
                        ("off", ["set", "off"])):
        if args:
            mode("s-shape2", *args)
        shapes[label] = len(chip("s-shape2"))
    ok("the mode chip is three fields however the slot was reached", set(shapes.values()) == {3},
       "%r. A row that is sometimes two fields shifts every field the status line reads after it."
       % (shapes,))

    shapes = {}
    for label, args in (("fresh", None), ("auto", ["set", "auto"]), ("typed", ["set", "teach"]),
                        ("chosen", ["set", "brisk", "--chosen"]), ("off", ["set", "off"])):
        if args:
            style("s-shape3", *args)
        shapes[label] = len(chip("s-shape3", "style"))
    ok("the style chip is three fields however the slot was reached", set(shapes.values()) == {3},
       repr(shapes))

    for name, want in (("lead", "35"), ("bugfix", "33"), ("shipper", "32"),
                       ("maker", "34"), ("clash", "31"), ("future", "36")):
        mode("s-colour", "set", name)
        got = chip("s-colour")[1]
        ok("%s renders as an ANSI number the status line can use" % name,
           got.isdigit() and (got == want),
           "field two is %r, expected %r" % (got, want))
    mode("s-colour", "set", "hush")
    ok("grey renders as some ANSI number too", chip("s-colour")[1].isdigit(),
       "field two is %r, so a grey chip prints uncoloured" % chip("s-colour")[1])

    # ------------------------------------------------------------------ chips

    section("chips, which a status line drops in whole")
    import unicodedata
    narrow = [i for i in ("\U0001f9ed", "\U0001f4ac")
              if unicodedata.east_asian_width(i) not in ("W", "F")]
    ok("both chip icons are East Asian Wide", not narrow,
       "%r. A narrow emoji measures one column and renders two, so every row after it "
       "in a status line is misaligned by one." % narrow)

    p = call("s-chips-none", "chips")
    ok("both slots clear prints one off entry per axis, exit 0",
       p.returncode == 0 and p.stdout.strip() == "\U0001f9ed off  \U0001f4ac off",
       "rc=%s out=%r. An empty slot has to read as off rather than vanish, or the line jumps "
       "around as slots fill." % (p.returncode, p.stdout))

    mode("s-chips", "set", "lead")
    p = call("s-chips", "chips")
    ok("one slot held prints its name and the other stays off",
       p.returncode == 0 and "lead" in p.stdout and "\U0001f4ac off" in p.stdout, repr(p.stdout))
    ok("the two entries are separated by exactly two spaces",
       "  \U0001f4ac" in p.stdout and "   " not in p.stdout.strip(),
       "%r. The half-empty case is where spacing leaks." % p.stdout)

    style("s-chips", "set", "teach")
    p = call("s-chips", "chips")
    ok("both slots held print both chips", "lead" in p.stdout and "teach" in p.stdout, repr(p.stdout))
    ok("and each chip carries its own colour", "\033[35m" in p.stdout and "\033[36m" in p.stdout,
       "%r. Without the escape the chips render in the terminal's default colour and stop being "
       "distinguishable at a glance." % p.stdout)

    mode("s-chips", "set", "bugfix", "--chosen")
    p = call("s-chips", "chips")
    ok("a chosen value is marked with a tilde in the rendered chip", "~bugfix" in p.stdout,
       "%r. The chip reads the same whether the tool picked the value or a person typed it."
       % p.stdout)

    # A status line drops its whole output when the command it calls exits non-zero.
    for label, args in (("an unknown flag", ["chips", "--colour"]),
                        ("a dangling --session", ["chips", "--session"]),
                        ("no session at all", ["chips"]),
                        ("a flag from a newer installer", ["chips", "--width", "40"])):
        p = run(root, config, *args)
        ok("chips survives %s, exit 0" % label,
           p.returncode == 0 and not crashed(p),
           "rc=%s err=%r. A non-zero exit here blanks the entire status line, not just the chip."
           % (p.returncode, p.stderr[-200:]))

    # ------------------------------------------------------------------ choose

    section("choose, and the three restraints on it")
    mode("s-pick", "set", "auto")
    p = call("s-pick", "choose", "--axis", "mode", "--message", "the deploy is not working")
    ok("a message matching one enter-when names that contract",
       p.returncode == 0 and out(p) == "bugfix", "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))

    p = call("s-pick", "choose", "--axis", "mode", "--message", "the deploy is NOT WORKING again")
    ok("matching ignores case", out(p) == "bugfix", repr(p.stdout))

    p = call("s-pick", "choose", "--axis", "mode", "--message", "nothing in particular today")
    ok("a message matching nothing names nothing, and still exits 0",
       p.returncode == 0 and not out(p),
       "rc=%s out=%r. The caller cannot tell 'no match' from 'the tool broke'." % (p.returncode, p.stdout))

    mode("s-typed", "set", "lead")
    p = call("s-typed", "choose", "--axis", "mode", "--message", "the deploy is not working")
    ok("a value that was typed is never overridden by a pattern",
       not out(p) and out(mode("s-typed", "get")) == "lead",
       "chose %r, slot is %r. A pattern would take the conversation out of the mode that was asked for."
       % (out(p), out(mode("s-typed", "get"))))

    mode("s-amb", "set", "auto")
    p = call("s-amb", "choose", "--axis", "mode", "--message", "it fails on every load")
    ok("a message matching two contracts chooses neither",
       not out(p), "chose %r, but bugfix and clash both answer to that phrase" % out(p))
    ok("and leaves the slot exactly where it was", out(mode("s-amb", "get")) == "auto",
       repr(out(mode("s-amb", "get"))))

    mode("s-never", "set", "auto")
    p = call("s-never", "choose", "--axis", "mode", "--message", "hush now, I am on a call")
    ok("enter-never beats a pattern that matches alone",
       not out(p), "chose %r. A contract marked never-automatic is being entered automatically." % out(p))

    p = call("s-never", "choose", "--axis", "mode", "--message", "explain the mental model first")
    ok("a contract with no enter-when never matches", not out(p), repr(p.stdout))

    mode("s-word", "set", "auto")
    for message, want in (("rebuild the index from scratch", ""),
                          ("build the storybook gallery", "maker"),
                          ("a failure in the parser", "bugfix"),
                          ("the tests keep failing", "bugfix"),
                          ("it is still not working", "bugfix")):
        p = call("s-word", "choose", "--axis", "mode", "--message", message)
        ok("%r chooses %s" % (message, want or "nothing"), out(p) == want,
           "chose %r. Matching is anchored at the start of a word and free at the end: a trailing "
           "boundary would stop 'fail' matching 'failures'." % out(p))

    style("s-styleaxis", "set", "auto")
    mode("s-styleaxis", "set", "auto")
    p = call("s-styleaxis", "choose", "--axis", "style", "--message", "just the answer please")
    ok("the style axis is matched against the style folder", out(p) == "brisk", repr(p.stdout))
    p = call("s-styleaxis", "choose", "--axis", "mode", "--message", "just the answer please")
    ok("and the mode axis never sees a style's enter-when", not out(p),
       "chose %r, so one folder is being matched for both slots" % out(p))
    p = call("s-styleaxis", "choose", "--axis", "style", "--message", "the deploy is not working")
    ok("nor the style axis a mode's", not out(p), "chose %r" % out(p))

    mode("s-offslot", "set", "off")
    p = call("s-offslot", "choose", "--axis", "mode", "--message", "the deploy is not working")
    ok("an empty slot is not an auto slot, so nothing is chosen for it",
       not out(p), "chose %r. Turning the mode off would still leave patterns picking one." % out(p))

    section("every spelling of enter-never, read through the chooser")
    flags, wanted = flag_fixtures("enter-never")
    flagroot = fixture_root(tmp, "flagroot", modes=flags, styles={"brisk": BRISK})
    for stem in sorted(flags):
        shown, trigger, armed = wanted[stem]
        session = sid("s-flag-%s" % stem)
        run(flagroot, config, "mode", "set", "auto", "--session", session)
        p = run(flagroot, config, "choose", "--axis", "mode", "--message",
                "%s please" % trigger, "--session", session)
        picked = out(p)
        ok("enter-never %s %s the contract" % (shown, "withholds" if armed else "leaves"),
           (picked == "") if armed else (picked == stem),
           "chose %r. On for a YAML-true value, off for absent, false, or anything else: a "
           "spelling nobody anticipated must not quietly change which contracts are on offer."
           % picked)

    # ------------------------------------------------------------------ standing

    section("standing, which a hook injects on every turn")
    mode("s-stand", "set", "lead")
    style("s-stand", "set", "teach")
    p = call("s-stand", "standing")
    body = p.stdout
    ok("both blocks are printed", p.returncode == 0 and "You lead." in body and "Name the trade-off" in body,
       "rc=%s out=%r" % (p.returncode, body))
    ok("the mode's block comes first",
       body.find("You lead.") < body.find("Name the trade-off"), repr(body))
    lines = [l for l in body.splitlines() if l.strip()]
    ok("at most eight lines, both blocks together", len(lines) <= 8,
       "%d lines. Past eight the standing block reads as background noise and stops being seen:\n%s"
       % (len(lines), body))
    ok("the identity placeholder is resolved, never injected raw", "{{" not in body,
       "%r. The model is told to address a literal {{USER}}." % body)
    ok("and the placeholder's line survives the substitution", "before the change" in body, repr(body))

    mode("s-stand-m", "set", "lead")
    p = call("s-stand-m", "standing")
    ok("a mode alone prints its block and exits 0",
       p.returncode == 0 and "You lead." in p.stdout and "Name the trade-off" not in p.stdout,
       "rc=%s out=%r" % (p.returncode, p.stdout))

    style("s-stand-s", "set", "brisk")
    p = call("s-stand-s", "standing")
    ok("a style alone prints its block and exits 0",
       p.returncode == 0 and "Answer first." in p.stdout and "You lead." not in p.stdout,
       "rc=%s out=%r" % (p.returncode, p.stdout))

    p = call("s-stand-none", "standing")
    ok("nothing held prints nothing, exit 0", p.returncode == 0 and not out(p),
       "rc=%s out=%r" % (p.returncode, p.stdout))

    mode("s-stand-x", "set", "lead")
    p = call("s-stand-x", "standing")
    ok("the block stops at the next heading",
       "Never part of the standing block" not in p.stdout and "Decompose the topic" not in p.stdout,
       "%r. Everything after the reminder is injected on every single turn." % p.stdout)

    # ------------------------------------------------------------------ list

    section("list")
    mode("s-list", "set", "maker")
    p = call("s-list", "list", "mode")
    text = p.stdout
    ok("every mode is listed with its summary",
       p.returncode == 0 and all(n in text for n in MODES) and "Build the thing that was asked for" in text,
       "rc=%s out=%r" % (p.returncode, text))
    ok("and no style leaks into the mode listing",
       not any(n in text for n in STYLES), repr(text))
    marked = [l for l in text.splitlines() if l.lstrip().startswith("*")]
    ok("exactly one row is marked as held",
       len(marked) == 1 and "maker" in marked[0],
       "marked rows: %r. The listing does not say which contract is in force." % marked)

    p = call("s-list", "list", "style")
    ok("the style listing reads the style folder",
       all(n in p.stdout for n in STYLES) and "lead" not in p.stdout, repr(p.stdout))

    p = call("s-list", "list", "mode", "--tsv")
    rows = [r.split("\t") for r in p.stdout.splitlines() if r.strip()]
    ok("--tsv is one row per contract, tab separated",
       len(rows) == len(MODES) and all(len(r) == len(rows[0]) for r in rows),
       "%r. A ragged row shifts every field a caller reads after it." % p.stdout)
    ok("--tsv carries the name and the summary as whole fields",
       all(set(["maker", "Build the thing that was asked for"]) <= set(r)
           for r in rows if "maker" in r),
       "%r. A marker glued to the name means a caller has to strip it before matching."
       % [r for r in rows if "maker" in r])
    filled = [len([f for f in r if f.strip()]) for r in rows]
    held_row = [r for r in rows if "maker" in r]
    ok("--tsv marks the held contract, and only that one",
       len(held_row) == 1 and filled.count(max(filled)) == 1
       and max(filled) > min(filled) and len([f for f in held_row[0] if f.strip()]) == max(filled),
       "%r. Either nothing is marked or everything is, so a caller cannot tell what is in force."
       % rows)

    p = call("s-list", "list")
    ok("list with no axis covers both folders",
       "maker" in p.stdout and "brisk" in p.stdout, repr(p.stdout))

    # ------------------------------------------------------------------ show

    section("show")
    mode("s-show", "set", "lead")
    p = call("s-show", "show", "mode")
    ok("show prints the body with the front matter gone",
       p.returncode == 0 and "Decompose the topic" in p.stdout and "summary:" not in p.stdout,
       "rc=%s out=%r" % (p.returncode, p.stdout))

    p = call("s-show", "show", "mode", "--meta")
    keys = [l.split(":")[0] for l in p.stdout.splitlines() if ":" in l]
    ok("show --meta prints the front matter keys",
       "name" in keys and "summary" in keys and "no-implement" in keys, repr(p.stdout))

    style("s-show", "set", "formal")
    p = call("s-show", "show", "style")
    ok("show reads the axis it was asked for",
       "Full sentences" in p.stdout and "Decompose the topic" not in p.stdout, repr(p.stdout))

    p = call("s-show-none", "show", "mode")
    ok("show with nothing held exits 1", p.returncode == 1 and not out(p),
       "rc=%s out=%r" % (p.returncode, p.stdout))

    # The positional is an axis for the two axis words and a contract name otherwise.
    p = call("s-show-none", "show", "maker", "--meta")
    ok("show takes a contract name, not only an axis word",
       p.returncode == 0 and "name: maker" in p.stdout,
       "rc=%s out=%r err=%r. The gate was told a named contract works here."
       % (p.returncode, p.stdout, p.stderr))
    p = call("s-show-none", "show", "nonesuch", "--meta")
    ok("and an unknown contract name exits 2, listing what exists",
       p.returncode == 2 and "maker" in p.stderr, "rc=%s err=%r" % (p.returncode, p.stderr))

    mode("s-unknown-key", "set", "future")
    p = call("s-unknown-key", "show", "mode")
    ok("a contract carrying a key the tool does not know still parses",
       p.returncode == 0 and "release that has not happened" in p.stdout,
       "rc=%s out=%r err=%r. A v2 requires: line added later would break every v1 install."
       % (p.returncode, p.stdout, p.stderr))
    ok("and the unknown key does not become a mode of its own",
       "requires" not in call("s-unknown-key", "list", "mode").stdout, repr(p.stdout))

    # ------------------------------------------------------------------ announce

    section("announce, once in full then only the reminder")
    mode("s-ann", "set", "lead")
    first = call("s-ann", "announce")
    ok("the first announce after a switch is the whole contract",
       first.returncode == 0 and "Decompose the topic" in first.stdout
       and "After the reminder" in first.stdout,
       "rc=%s out=%r" % (first.returncode, first.stdout))

    second = call("s-ann", "announce")
    ok("every announce after that is only the standing block",
       "Decompose the topic" not in second.stdout and "You lead." in second.stdout,
       "%r. The full contract is re-injected on every turn, which is most of the context budget."
       % second.stdout)

    mode("s-ann", "set", "maker")
    third = call("s-ann", "announce")
    ok("switching earns the whole contract again",
       "Build it." in third.stdout and "Build what was asked for" in third.stdout, repr(third.stdout))

    p = call("s-ann", "clear", "--announced")
    ok("clear --announced prints nothing, exit 0",
       p.returncode == 0 and not p.stdout and not p.stderr,
       "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))
    ok("and leaves both slots exactly as they were", out(mode("s-ann", "get")) == "maker",
       repr(out(mode("s-ann", "get"))))
    p = call("s-ann", "announce")
    ok("so the next announce is the whole contract again", "Build it." in p.stdout, repr(p.stdout))

    style("s-ann-s", "set", "teach")
    p = call("s-ann-s", "announce")
    ok("a style is announced too, since it is a contract like any other",
       p.returncode == 0 and "Teach the thing" in p.stdout,
       "rc=%s out=%r. The style slot would hold a contract nobody was ever told about."
       % (p.returncode, p.stdout))

    p = call("s-ann-none", "announce")
    ok("announce with nothing held is silent and never a traceback",
       not out(p) and not crashed(p), "out=%r err=%r" % (p.stdout, p.stderr))

    # ------------------------------------------------------------------ approve

    section("approve, whose exit code is the whole signal")
    mode("s-app", "set", "lead")
    p = call("s-app", "approve")
    ok("nothing recorded reads as no, exit 1",
       p.returncode == 1 and not out(p), "rc=%s out=%r" % (p.returncode, p.stdout))

    p = call("s-app", "approve", "trade-brief")
    ok("recording an approval confirms in one line, exit 0",
       p.returncode == 0 and "trade-brief" in p.stdout, "rc=%s out=%r" % (p.returncode, p.stdout))

    p = call("s-app", "approve")
    ok("reading it back exits 0 and prints the slug",
       p.returncode == 0 and out(p) == "trade-brief",
       "rc=%s out=%r. The dispatch gate reads the code, so an exit 1 here blocks approved work."
       % (p.returncode, p.stdout))

    p = call("s-app-other", "approve")
    ok("an approval is per conversation, not shared",
       p.returncode == 1 and not out(p), "rc=%s out=%r" % (p.returncode, p.stdout))

    mode("s-app", "set", "maker")
    p = call("s-app", "approve")
    ok("an approval given under one mode is invisible under another",
       p.returncode == 1 and not out(p),
       "rc=%s out=%r. A yes given to the lead would silently authorise whatever the next mode does."
       % (p.returncode, p.stdout))

    mode("s-app", "set", "lead")
    p = call("s-app", "approve")
    ok("scoping hides the approval, it does not consume it",
       p.returncode == 0 and out(p) == "trade-brief", "rc=%s out=%r" % (p.returncode, p.stdout))

    call("s-app2", "approve", "first-slug")
    call("s-app2", "approve", "second-slug")
    ok("approving twice keeps the later slug", out(call("s-app2", "approve")) == "second-slug",
       repr(call("s-app2", "approve").stdout))

    # The gate falls through to this only on exit 1, to tell a foreign yes from no yes at all.
    mode("s-app", "set", "maker")
    p = call("s-app", "approve", "--any-mode")
    ok("--any-mode reads an approval given under a different mode",
       p.returncode == 0 and out(p) == "trade-brief",
       "rc=%s out=%r" % (p.returncode, p.stdout))

    p = call("s-app", "approve")
    ok("and the plain read under that mode still exits 1",
       p.returncode == 1 and not out(p),
       "rc=%s out=%r. The flag widens the read rather than weakening the scoping, so if this ever "
       "passes then --any-mode has quietly become the default and approvals cross modes."
       % (p.returncode, p.stdout))

    p = call("s-app-none", "approve", "--any-mode")
    ok("--any-mode on a conversation that never approved anything still exits 1",
       p.returncode == 1 and not out(p),
       "rc=%s out=%r. The flag widens which mode counts, not whether a yes is needed."
       % (p.returncode, p.stdout))

    p = run(root, config, "approve", "--any-mode", "--session", sid("s-app-bare"))
    ok("--any-mode against a conversation with no state at all does not crash",
       p.returncode == 1 and not crashed(p), "rc=%s err=%r" % (p.returncode, p.stderr[-200:]))

    # ------------------------------------------------------------------ clear

    section("clear")
    mode("s-clear", "set", "lead")
    style("s-clear", "set", "teach")
    p = call("s-clear", "clear")
    ok("clear prints nothing, exit 0", p.returncode == 0 and not p.stdout and not p.stderr,
       "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))
    ok("and empties both slots",
       not out(mode("s-clear", "get")) and not out(style("s-clear", "get")),
       "mode=%r style=%r" % (out(mode("s-clear", "get")), out(style("s-clear", "get"))))
    p = call("s-clear", "clear")
    ok("clearing twice is silent, exit 0", p.returncode == 0 and not p.stdout and not p.stderr,
       "rc=%s out=%r" % (p.returncode, p.stdout))
    p = call("s-clear", "approve")
    ok("and a cleared conversation has no approval left",
       p.returncode == 1 and not out(p), "rc=%s out=%r" % (p.returncode, p.stdout))

    # ------------------------------------------------------------------ sync and init

    section("sync")
    # Its own root: the folder above carries flags written wrong on purpose, which sync now rejects.
    clean = {"maker": MAKER, "shipper": SHIPPER}
    syncroot = fixture_root(tmp, "syncroot", modes=clean, styles={"brisk": BRISK}, skill=SKILL)
    p = run(syncroot, config, "sync", "--session", sid("s-sync"))
    ok("sync prints nothing, exit 0, no traceback",
       p.returncode == 0 and not p.stdout and not p.stderr and not crashed(p),
       "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))
    with open(os.path.join(syncroot, "skills", "mode", "MANUAL.md")) as f:
        synced = f.read()
    ok("sync rewrote the registry from the folder and dropped what was there",
       "maker" in synced and "brisk" in synced and "old junk" not in synced,
       "%r. The spec fixes the verb but not the marker names, so a mismatch here is a marker "
       "disagreement between the tool and the manual, not a broken rewrite." % synced[:400])

    ok("sync wrote a mode shortcut into the plugin, where it arrives as /mode:<name>",
       os.path.isfile(os.path.join(syncroot, "commands", "maker.md")),
       "commands/maker.md is missing, so the palette has no entry for the mode")
    ok("and a style shortcut into the user commands folder, where it arrives bare as /style:<name>",
       os.path.isfile(os.path.join(config, "commands", "style:brisk.md")),
       "config commands/style:brisk.md is missing. Inside the plugin it would be namespaced to "
       "/mode:style:brisk, which is the palette noise this placement removes.")

    write(os.path.join(config, "commands", "style:gone.md"),
          "A hook read this message and set the style slot to `gone`.\n")
    write(os.path.join(config, "commands", "style:mine.md"), "my own command, hands off\n")
    p = run(syncroot, config, "sync", "--session", sid("s-sync"))
    ok("a stale generated shortcut is swept and a hand-written one survives",
       p.returncode == 0
       and not os.path.exists(os.path.join(config, "commands", "style:gone.md"))
       and os.path.isfile(os.path.join(config, "commands", "style:mine.md")),
       "The sweep must key on the generated sentence, or it deletes files it never wrote.")

    badroot = fixture_root(tmp, "badroot", modes=dict(clean, future=FUTURE),
                           styles={"brisk": BRISK}, skill=SKILL)
    p = run(badroot, config, "sync", "--session", sid("s-sync-bad"))
    said = p.stdout + p.stderr
    ok("sync warns about a non-canonical flag and still completes, exit 0",
       p.returncode == 0 and not crashed(p),
       "rc=%s err=%r. Refusing would leave the registry stale over a spelling that reads fine."
       % (p.returncode, p.stderr))
    ok("and the warning names the file, the key, and says it is read as on",
       "future" in said and "no-implement" in said and "read as on" in said,
       "%r. Without all three the author cannot tell which line to change, nor which way the "
       "tool took it." % said)

    # ------------------------------------------------------------------ rules

    section("ground rules, once per conversation")
    LAW = "---\nname: law\nsummary: a fixture rule\n---\n\nAlways hand {{USER}} the receipt.\n"
    AXIOM = "---\nname: axiom\nsummary: another\n---\n\nNever guess a checkable fact.\n"
    ruleroot = fixture_root(tmp, "ruleroot", modes=clean, styles={"brisk": BRISK}, skill=SKILL,
                            rules={"law": LAW, "axiom": AXIOM})
    p = run(ruleroot, config, "rules", "--session", sid("s-rules"))
    ok("the first call prints every rule body under one heading, exit 0",
       p.returncode == 0 and "Ground rules" in p.stdout
       and "receipt" in p.stdout and "Never guess" in p.stdout,
       "rc=%s out=%r" % (p.returncode, p.stdout[:300]))
    ok("and the placeholder is substituted", "{{" not in p.stdout, repr(p.stdout[:200]))
    p = run(ruleroot, config, "rules", "--session", sid("s-rules"))
    ok("the second call prints nothing, exit 1, so a hook injects once",
       p.returncode == 1 and not p.stdout, "rc=%s out=%r" % (p.returncode, p.stdout))
    run(ruleroot, config, "clear", "--announced", "--session", sid("s-rules"))
    p = run(ruleroot, config, "rules", "--session", sid("s-rules"))
    ok("clear --announced re-arms them, which is what a resume runs",
       p.returncode == 0 and "Ground rules" in p.stdout, "rc=%s" % p.returncode)
    write(os.path.join(config, "mode", "rules", "law.md"),
          "---\nname: law\nsummary: silenced\n---\n")
    p = run(ruleroot, config, "rules", "--session", sid("s-rules-mute"))
    ok("a user file sharing a shipped stem with an empty body silences that rule only",
       p.returncode == 0 and "receipt" not in p.stdout and "Never guess" in p.stdout,
       "%r" % p.stdout[:300])
    os.remove(os.path.join(config, "mode", "rules", "law.md"))
    p = run(syncroot, config, "rules", "--session", sid("s-rules-none"))
    ok("no rules anywhere is a silent exit 1",
       p.returncode == 1 and not p.stdout, "rc=%s out=%r" % (p.returncode, p.stdout))

    SCOPED = "---\nname: pages\nsummary: scoped\nwhen: mockup|landing page\n---\n\nEvery page ships the toggle.\n"
    ruleroot2 = fixture_root(tmp, "ruleroot2", modes=clean, styles={"brisk": BRISK}, skill=SKILL,
                             rules={"law": LAW, "pages": SCOPED})
    p = run(ruleroot2, config, "rules", "--session", sid("s-scope"), "--message", "carry on")
    ok("a scoped rule stays out of the first prompt while its trigger is absent",
       p.returncode == 0 and "toggle" not in p.stdout and "receipt" in p.stdout,
       "rc=%s out=%r" % (p.returncode, p.stdout[:200]))
    p = run(ruleroot2, config, "rules", "--session", sid("s-scope"), "--message", "a mockup of settings")
    ok("and fires alone when a later prompt matches its when pattern",
       p.returncode == 0 and "toggle" in p.stdout and "receipt" not in p.stdout,
       "rc=%s out=%r" % (p.returncode, p.stdout[:200]))
    p = run(ruleroot2, config, "rules", "--session", sid("s-scope"), "--message", "another mockup")
    ok("then never again in the same conversation",
       p.returncode == 1 and not p.stdout, "rc=%s out=%r" % (p.returncode, p.stdout))

    # ------------------------------------------------------------------ version

    section("version, the only way to tell whether an update landed")

    vroot = fixture_root(tmp, "vroot", modes=clean, styles={"brisk": BRISK})
    write(os.path.join(vroot, ".claude-plugin", "plugin.json"),
          '{"name": "mode", "version": "9.9.9"}\n')
    p = run(vroot, config, "version", "--session", "s-ver")
    ok("version prints what the manifest says, exit 0",
       p.returncode == 0 and out(p) == "9.9.9",
       "rc=%s out=%r. It has to read the copy it is running from, or it cannot answer the "
       "question it exists for." % (p.returncode, p.stdout))

    p = run(vroot, config, "version")
    ok("and it needs no session, since a clone nobody has run yet still has a version",
       p.returncode == 0 and out(p) == "9.9.9",
       "rc=%s out=%r err=%r" % (p.returncode, p.stdout, p.stderr))

    noman = fixture_root(tmp, "noman", modes=clean)
    p = run(noman, config, "version")
    ok("a missing manifest is a sentence and not a traceback",
       p.returncode != 0 and not crashed(p) and p.stderr.strip(),
       "rc=%s err=%r" % (p.returncode, p.stderr[-200:]))

    unver = fixture_root(tmp, "unver", modes=clean)
    write(os.path.join(unver, ".claude-plugin", "plugin.json"), '{"name": "mode"}\n')
    p = run(unver, config, "version")
    ok("a manifest with no version says so, and says what it would cost",
       p.returncode != 0 and not crashed(p) and "unknown" in p.stderr,
       "rc=%s err=%r. Without a version an install lands in a directory called unknown and "
       "every later update overwrites it, so the message has to name that." % (p.returncode, p.stderr))

    ok("the shipped manifest carries a version, so real installs are version-keyed",
       out(live(config, "version")) != "",
       "the shipped .claude-plugin/plugin.json has no readable version")

    # ------------------------------------------------------------------ robustness

    section("nothing crashes on a tree that is not there")
    bare = fixture_root(tmp, "bare")
    for args in (["mode", "list"], ["mode", "get"], ["mode", "get", "--chip"], ["chips"],
                 ["standing"], ["mode", "show"], ["choose", "--axis", "mode", "--message", "hello"]):
        p = run(bare, config, *(args + ["--session", "s-bare"]))
        ok("%s survives an empty contracts folder" % " ".join(args),
           not crashed(p), "rc=%s err=%r" % (p.returncode, p.stderr[-300:]))

    p = run(bare, config, "mode", "set", "lead", "--session", "s-bare")
    ok("set against an empty contracts folder exits non-zero without a traceback",
       p.returncode != 0 and not crashed(p), "rc=%s err=%r" % (p.returncode, p.stderr[-300:]))

report()
