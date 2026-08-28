"""Emits one diagram per contract into assets/, so the guide references images instead of
inlining mermaid. Modes are pipelines with gates; styles have no steps, so they are drawn as a
transformation of the same reply rather than as a flow that would misrepresent them."""

import pathlib
import xml.sax.saxutils as x

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"

CSS = """
  .t{font:600 12px ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial;fill:#1f2328}
  .s{font:10.5px ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial;fill:#656d76}
  .k{font:600 9px ui-sans-serif,sans-serif;fill:#7d4e00;letter-spacing:.07em}
  .b{fill:#ffffff;stroke:#d0d7de;stroke-width:1.5}
  .g{fill:#fff8c5;stroke:#9a6700;stroke-width:1.5}
  .a{fill:#fbefff;stroke:#8250df;stroke-width:1.5}
  .m{fill:#f6f8fa;stroke:#d0d7de;stroke-width:1.5}
  .ln{stroke:#8c959f;stroke-width:1.5;fill:none}
  .lp{stroke:#8c959f;stroke-width:1.3;fill:none;stroke-dasharray:4 3}
  .at{fill:#6639ba}
  @media (prefers-color-scheme: dark){
    .t{fill:#e6edf3}.s{fill:#9198a1}.k{fill:#e3b341}
    .b{fill:#151b23;stroke:#3d444d}
    .g{fill:#2b2412;stroke:#d4a72c}
    .a{fill:#231c33;stroke:#a371f7}
    .m{fill:#0d1117;stroke:#3d444d}
    .ln,.lp{stroke:#6e7681}
    .at{fill:#c297ff}
  }
"""

ARROW = ('<defs><marker id="h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
         'markerHeight="7" orient="auto-start-reverse">'
         '<path d="M0 0 L10 5 L0 10 z" fill="#8c959f"/></marker></defs>')


def svg(w, h, body, alt):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" '
            f'height="{h}" role="img" aria-label="{x.quoteattr(alt)[1:-1]}">\n'
            f'<style>{CSS}</style>\n{ARROW}\n{body}\n</svg>\n')


def wrap(text, limit):
    words, lines, cur = text.split(), [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if len(trial) > limit and cur:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def box(cx, y, w, h, title, kind="b", note=""):
    out = [f'<rect class="{kind}" x="{cx}" y="{y}" width="{w}" height="{h}" rx="7"/>']
    lines = wrap(title, 17)
    # Vertically centred as a block, so a two-line label does not sit low in its box.
    top = y + h / 2 - (len(lines) - 1) * 7 - (5 if note else 0) + 4
    for i, line in enumerate(lines):
        out.append(f'<text class="t" x="{cx + w / 2}" y="{top + i * 14}" text-anchor="middle">'
                   f'{x.escape(line)}</text>')
    if note:
        out.append(f'<text class="k" x="{cx + w / 2}" y="{y + h - 7}" text-anchor="middle">'
                   f'{x.escape(note)}</text>')
    return "".join(out)


def mode_svg(steps, loop, alt):
    """steps: (label, gate?) left to right. loop: (from_index, to_index, caption) or None."""
    bw, bh, gap, x0, y0 = 138, 56, 26, 16, 46
    w = x0 * 2 + len(steps) * bw + (len(steps) - 1) * gap
    h = 150
    parts = []
    for i, (label, gate) in enumerate(steps):
        cx = x0 + i * (bw + gap)
        parts.append(box(cx, y0, bw, bh, label, "g" if gate else "b", "GATE" if gate else ""))
        if i:
            parts.append(f'<path class="ln" d="M{cx - gap} {y0 + bh / 2} H{cx - 4}" '
                         f'marker-end="url(#h)"/>')
    if loop:
        src, dst, cap = loop
        sx = x0 + src * (bw + gap) + bw / 2
        dx = x0 + dst * (bw + gap) + bw / 2
        by = y0 + bh + 30
        parts.append(f'<path class="lp" d="M{sx} {y0 + bh} V{by} H{dx} V{y0 + bh + 4}" '
                     f'marker-end="url(#h)"/>')
        parts.append(f'<text class="s" x="{(sx + dx) / 2}" y="{by + 15}" '
                     f'text-anchor="middle">{x.escape(cap)}</text>')
    return svg(w, h, "\n".join(parts), alt)


def style_svg(before, after, bullets, alt):
    bw, bh, y0 = 210, 74, 44
    w = 620
    h = 76 + bh + len(bullets) * 15
    parts = [box(20, y0, bw, bh, before, "m"),
             box(w - 20 - bw, y0, bw, bh, after, "a")]
    mx = 20 + bw
    parts.append(f'<path class="ln" d="M{mx + 12} {y0 + bh / 2} H{w - 20 - bw - 12}" '
                 f'marker-end="url(#h)"/>')
    parts.append(f'<text class="s" x="{w / 2}" y="{y0 + bh / 2 - 10}" text-anchor="middle">'
                 f'the style</text>')
    parts.append(f'<text class="s" x="20" y="{y0 - 14}">what it would have been</text>')
    parts.append(f'<text class="s at" x="{w - 20 - bw}" y="{y0 - 14}">what it becomes</text>')
    for i, line in enumerate(bullets):
        parts.append(f'<text class="s" x="20" y="{y0 + bh + 26 + i * 15}">{x.escape(line)}</text>')
    return svg(w, h, "\n".join(parts), alt)


MODES = {
    "ic": ([("Read the ask", 0), ("Ground it", 0), ("Build", 0), ("Verify", 0), ("Deliver", 0)],
           (3, 2, "fails, so back to building"),
           "IC mode runs one loop: read the ask, ground it in the repo, build, verify through "
           "something that can disagree, deliver. A failed verification returns to building."),
    "copilot": ([("Intake together", 0), ("Spec artifact", 0), ("Approval", 1), ("Dispatch team", 0),
                 ("Integrate", 0)], (4, 3, "fails review, back to the owner"),
                "Copilot runs intake with the user, writes a spec artifact, then stops at an "
                "approval gate. Only a recorded yes opens dispatch to a team, whose work is "
                "verified and integrated."),
    "autopilot": ([("Read the goal", 0), ("Plan, privately", 0), ("Dispatch team", 0),
                   ("Integrate", 0), ("Open the MR", 0)], None,
                  "Autopilot has no approval gate because nobody is present to give one. It reads "
                  "the goal, plans for itself, dispatches, integrates and opens the merge request, "
                  "which is also where it ends."),
    "debug": ([("Instrument", 0), ("Reproduces", 1), ("Fix the cause", 0), ("Explainer", 0),
               ("Open the MR", 0)], (1, 0, "will not reproduce, so back to visibility"),
              "Debug makes the failure observable first, then holds at a gate until it reproduces "
              "on demand. Only then does it fix the cause, write the explainer and open the merge "
              "request."),
    "tdd": ([("Enumerate cases", 0), ("Reduce to minimum", 0), ("Red", 1), ("Green", 0),
             ("Refactor", 0)], (4, 2, "next behaviour needs a new red"),
            "TDD enumerates cases from structure, reduces them to a minimum set, then loops: a "
            "test that fails on its assertion, the least code that passes it, then refactoring "
            "while green."),
    "prove": ([("Name the channel", 0), ("Baseline before", 0), ("Change", 0), ("Prove after", 0),
               ("Break it once", 0)], None,
              "Prove names the channel that could disagree, records a baseline before the change, "
              "proves it after, then deliberately breaks the thing once to confirm the channel "
              "actually notices."),
    "tester": ([("Environment", 0), ("Enumerate surface", 0), ("Generate cases", 0),
                ("Execute for real", 0), ("Verdict", 0)], None,
               "Tester establishes the environment and preconditions, enumerates the surface by "
               "reading rather than recall, generates cases from structure, runs them for real and "
               "reports a verdict. It fixes nothing."),
    "studio": ([("Talk it through", 0), ("Onto the page now", 0), ("React to what is there", 0),
                ("Widen or narrow", 0)], (3, 0, "round again, rejected options stay visible"),
               "Studio is a cycle rather than a pipeline: talk, put it on the page immediately, "
               "react to what is visible, widen or narrow, and go round again. Rejected options "
               "stay on the page with their reasons."),
}

STYLES = {
    "edu": ("A correct wall of prose", "A picture, then plain words",
            ["Top down: big picture, then a simple example, then the detail.",
             "Every term of art glossed the first time it appears.",
             "Closes on what was covered and the one thing to remember."],
            "The edu style turns a correct wall of prose into a picture followed by plain words, "
            "ordered top down and closing on a recap."),
    "fast": ("Preamble, plan, work, recap", "The one thing, and done",
             ["No preamble, no plan, no recap. Two or three sentences is normal.",
              "Defaults taken and named in a handful of words.",
              "Fewer words, never less work: the lookup still happens."],
             "The fast style strips preamble, plan and recap down to the one thing and a statement "
             "that it is done, without skipping any of the actual work."),
    "ship": ("Code that works", "Code the next person can hold",
             ["Readable, named for what it is, grouped by domain.",
              "Comments say why or do not exist; exported surfaces are typed.",
              "A touched file that outgrew itself gets split."],
             "The ship style turns code that merely works into code the next developer can "
             "maintain: readable, named, grouped by domain and typed at its edges."),
    "maintainer": ("The change alone", "The change, and everything that travels with it",
                   ["Tests, README, API docs and changelog move in the same diff.",
                    "The blast radius of every behaviour change is named out loud.",
                    "A stale dependency is reported and never silently bumped."],
                   "The maintainer style makes the change arrive with its tests, docs and changelog "
                   "in the same diff, and names the blast radius of anything that could surprise a "
                   "dependent."),
    "native": ("Your own idiom", "The idiom already in the file",
               ["Match the neighbours: naming, structure, test shape, commit style.",
                "Contribute none of your own conventions to somebody else's house.",
                "A local habit you dislike is still the local habit."],
               "The native style drops your own conventions and matches the ones already in the "
               "file, so a contribution to somebody else's repository reads as theirs."),
    "creative": ("The first safe answer", "Several real options, one bold",
                 ["Genuinely different options, not one renamed three ways.",
                  "The boldness is spent in one place, and its cost is named.",
                  "Creativity is in the approach, never in the facts."],
                 "The creative style replaces the first safe answer with several genuinely "
                 "different options, spending boldness in one place and naming what it cost, while "
                 "leaving the facts untouched."),
    "xyz": ("Straight to the answer", "The read, then the answer",
            ["X what was typed, Y what was meant, Z what that forces into existence.",
             "Y is inferred from the repo and the history, not asked.",
             "A Z inside the topic gets done this turn and reported."],
            "The xyz style opens every reply with a three line read, stating what was typed, what "
            "was actually meant, and the adjacent work that follows, before doing anything."),
}


def hook_sequence():
    actors = ["You", "The hook", "bin/mode", "Claude"]
    xs = [90, 250, 410, 570]
    top, bottom = 54, 250
    parts = []
    for name, cx in zip(actors, xs):
        parts.append(box(cx - 62, 20, 124, 30, name, "a" if name == "Claude" else "b"))
        parts.append(f'<line class="lp" x1="{cx}" y1="{top}" x2="{cx}" y2="{bottom}"/>')
    msgs = [(0, 1, "your message, before Claude sees it", 84),
            (1, 2, "expire, switch, choose", 122),
            (2, 1, "what each slot now holds", 160),
            (1, 3, "message plus the contract text", 198)]
    for src, dst, label, y in msgs:
        a, b = xs[src], xs[dst]
        parts.append(f'<path class="ln" d="M{a} {y} H{b}" marker-end="url(#h)"/>')
        parts.append(f'<text class="s" x="{(a + b) / 2}" y="{y - 6}" text-anchor="middle">'
                     f'{x.escape(label)}</text>')
    parts.append(f'<text class="s" x="{xs[3]}" y="{bottom + 20}" text-anchor="middle">'
                 f'holds by mechanism, not by remembering</text>')
    return svg(660, 285, "\n".join(parts),
               "The hook intercepts your message before Claude sees it, asks bin/mode to expire, "
               "switch and choose, receives what each slot now holds, and passes Claude the message "
               "together with the contract text.")


def rules_tiers():
    parts = [f'<text class="s" x="20" y="30">A rules file with no when: pattern</text>',
             box(20, 40, 250, 52, "Always on", "g", "EVERY CONVERSATION"),
             f'<text class="s" x="20" y="112">Injected whole on the first prompt, then never</text>',
             f'<text class="s" x="20" y="127">repeated. Six ship this way.</text>',
             f'<text class="s" x="330" y="30">A rules file carrying when:</text>',
             box(330, 40, 250, 52, "Waits for its trigger", "a", "ONCE, WHEN MATCHED"),
             f'<text class="s" x="330" y="112">Stays out of the first prompt and costs nothing</text>',
             f'<text class="s" x="330" y="127">until a message matches. The artifact rule.</text>',
             f'<line class="lp" x1="20" y1="152" x2="580" y2="152"/>',
             box(20, 172, 170, 46, "Resume or compact", "m"),
             f'<path class="ln" d="M196 195 H246" marker-end="url(#h)"/>',
             box(250, 172, 170, 46, "Re-armed", "g"),
             f'<text class="s" x="436" y="190">Either one drops the injected</text>',
             f'<text class="s" x="436" y="205">text, so the rules go again.</text>']
    return svg(620, 240, "\n".join(parts),
               "A rules file with no when pattern is injected whole on the first prompt of every "
               "conversation. A rules file carrying a when pattern waits and costs nothing until a "
               "message matches it. A resume or a compact re-arms both, because either one drops "
               "the injected text.")


def slot_lifecycle():
    nodes = {"empty": (60, 60), "held": (300, 30), "auto": (300, 130), "chosen": (520, 130)}
    parts = []
    for name, (cx, cy) in nodes.items():
        kind = "a" if name == "chosen" else "b"
        parts.append(box(cx, cy, 116, 44, name, kind, "~ IN THE CHIP" if name == "chosen" else ""))
    edges = [((176, 52), (300, 52), "you type a name"),
             ((176, 92), (300, 152), "/mode auto"),
             ((416, 152), (520, 152), "a pattern matches"),
             ((520, 168), (416, 168), "its exit fires")]
    for (ax, ay), (bx, by), label in edges:
        mid = (ax + bx) / 2
        parts.append(f'<path class="ln" d="M{ax} {ay} C{mid} {ay} {mid} {by} {bx} {by}" '
                     f'marker-end="url(#h)"/>')
        parts.append(f'<text class="s" x="{mid}" y="{min(ay, by) - 7}" text-anchor="middle">'
                     f'{x.escape(label)}</text>')
    parts.append('<path class="lp" d="M358 74 V118" marker-end="url(#h)"/>')
    parts.append('<text class="s" x="366" y="100">off</text>')
    parts.append(f'<text class="s" x="20" y="212">A contract you typed is never overridden by a '
                 f'pattern. A message matching two picks neither.</text>')
    return svg(660, 228, "\n".join(parts),
               "A slot moves between empty, held when you type a name, and auto. While on auto a "
               "matching pattern moves it to chosen, marked with a tilde in the status line, and "
               "its exit condition returns it to auto rather than to empty.")


MECHANISMS = {"hook-sequence": hook_sequence, "rules-tiers": rules_tiers,
              "slot-lifecycle": slot_lifecycle}


def main():
    OUT.mkdir(exist_ok=True)
    written = []
    for name, fn in MECHANISMS.items():
        path = OUT / f"{name}.svg"
        path.write_text(fn())
        written.append(path.name)
    for name, (steps, loop, alt) in MODES.items():
        path = OUT / f"mode-{name}.svg"
        path.write_text(mode_svg(steps, loop, alt))
        written.append(path.name)
    for name, (before, after, bullets, alt) in STYLES.items():
        path = OUT / f"style-{name}.svg"
        path.write_text(style_svg(before, after, bullets, alt))
        written.append(path.name)
    print(f"{len(written)} written: {', '.join(sorted(written))}")


if __name__ == "__main__":
    main()
