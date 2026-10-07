from __future__ import annotations

from _jev import ask, config, question

INTENTS = ("answer", "change", "artifact", "post")
NOTHING = "none"
# How far a change may travel. Published is its own rung: after a push for a site, after a commit for a page.
SHIPS = {
    "committed": {"commit"},
    "pushed": {"commit", "push"},
    "mr-merged": {"commit", "push", "mr"},
    "published": {"commit", "push", "publish"},
}
SHIP_NAMES = {"commit": "committed", "push": "pushed", "mr": "mr-merged", "publish": "published"}
SHIP_SAID = {"committed": "a commit", "pushed": "a push", "mr-merged": "an MR, done when merged",
             "published": "a publish"}
DEFAULT_SHIP = "committed"
ACTS = ("commit", "push", "mr", "publish")
READ_AT = 0.6
ASK_CHARS = 4000
# Arrives in the user role without anybody typing it, so it is never an ask to read.
INJECTED = ("<", "Another Claude session sent a message", "[Request interrupted")

QUESTIONS = {
    "change": question(
        "Does ask want files changed, such as code, config, docs, tests or rules?",
        "Yes when doing what it asks means editing files, including a fix, a refactor or a rule.",
        "No when it only wants an answer, a page to read or a message sent.",
    ),
    "artifact": question(
        "Does ask want a page or document made to be opened and read, such as a report, a review, a plan page "
        "or a mockup?",
        "Yes when the result is something the user opens and keeps.",
        "No when a reply in the conversation or a change to files is enough.",
    ),
    "post": question(
        "Does ask want something sent to other people under the user's name, such as a comment, a reply, a "
        "message, an email or a ticket?",
        "Yes when something written for another person reaches them because of it.",
        "No when the only thing others see is the change itself shipping, such as a commit, a push or a merge "
        "request, or when nothing leaves the conversation and the user's own files.",
    ),
}


def mode_delivers(meta: dict) -> tuple[str, ...]:
    """What a mode can produce, from its front matter. A mode that declares nothing is not tracked at all."""
    declared = {d.strip().lower() for d in str(meta.get("deliverables") or "").split(",") if d.strip()}
    return tuple(d for d in INTENTS if d in declared)


def ship_name(value: str) -> str:
    return SHIP_NAMES.get(value, value)


def project_ship(path: str) -> tuple[str, str]:
    """How a change under this path ships, and the `delivery` row that says so, matched as board-deliver does."""
    lowered = (path or "").lower()
    for tree, kind in config().get("delivery") or []:
        if str(tree).lower() in lowered and str(kind) in SHIPS:
            return str(kind), str(tree)
    return DEFAULT_SHIP, ""


def ship_of(state: dict, path: str) -> tuple[str, str]:
    override = ship_name(str(state.get("ship") or ""))
    return (override, "this ask") if override in SHIPS else project_ship(path)


def said(intents) -> str:
    return " + ".join(intents)


def where_from(source: str) -> str:
    return {"this ask": "set for this ask", "": "no `delivery` row matches"}.get(source, "the `%s` row" % source)


def describe(state: dict, path: str) -> str:
    intents = list(state.get("intents") or [])
    text = said(intents)
    if "change" in intents or "artifact" in intents:
        ship, source = ship_of(state, path)
        text += ", and a change here ships as %s (%s)" % (SHIP_SAID[ship], where_from(source))
    line = str(state.get("line") or "").strip()
    return text + (". " + line.rstrip(".") if line else "") + "."


def announce(state: dict, mode: str, delivers: tuple[str, ...], path: str) -> str:
    if state.get("intents"):
        text = "Deliverable: " + describe(state, path)
        if state.get("source") == "jev":
            text += " Jev read that from the ask, so confirm it or correct it with `mode deliverable`."
        return text
    ship, source = project_ship(path)
    return ("Deliverable: none named. Name it before the first edit with `mode deliverable <%s>... \"<one line>\"`, "
            "since %s delivers %s and a change here ships as %s (%s)."
            % ("|".join(delivers), mode, said(delivers), SHIP_SAID[ship], where_from(source)))


def check(verb: str, state: dict | None, path: str) -> str | None:
    """Why a delivery act falls outside the named deliverable, or None when it fits."""
    if not state or not state.get("intents"):
        return ("No deliverable is named yet, so there is no north star to hold this to. Name it first: "
                "`mode deliverable <answer|change|artifact|post>... \"<one line>\"`.")
    intents = list(state["intents"])
    named = said(intents)
    if verb == "edit" and "change" not in intents:
        return ("The deliverable is %s, and editing %s is a change. If this ask changes files too, say so: "
                "`mode deliverable %s change \"<one line>\"`." % (named, path or "a file", " ".join(intents)))
    if verb == "artifact" and "artifact" not in intents:
        return "The deliverable is %s, and %s is an artifact. If this ask wants a page, add artifact." % (
            named, path or "this page")
    if verb == "post" and "post" not in intents:
        return "The deliverable is %s, and this sends something to other people. If this ask wants that, add post." % named
    if verb in ACTS and "change" not in intents and "artifact" not in intents:
        return "The deliverable is %s, which changes nothing, so there is nothing to %s." % (named, verb)
    if verb in ACTS:
        ship, source = ship_of(state, path)
        if verb not in SHIPS[ship]:
            return ("A change here ships as %s (%s), so a %s goes past that. If it should go further, add a "
                    "`delivery` row for this tree in ~/.claude/mode/config.json, or say this ask ships further "
                    "with `mode deliverable %s --ship %s`." % (SHIP_SAID[ship], where_from(source), verb,
                                                                  " ".join(intents), verb))
    return None


def read(ask_text: str, mode: str, delivers: tuple[str, ...], board: list[str]) -> list[str] | None:
    """Jev's reading of what the ask wants, kept to what the mode delivers. Answer is what is left over."""
    text = (ask_text or "").strip()
    if not text or text.startswith(INJECTED):
        return None
    questions = {name: QUESTIONS[name] for name in delivers if name in QUESTIONS}
    reading = ask(questions, {"ask": text[:ASK_CHARS], "mode": mode, "open_board": board}) if questions else {}
    if reading is None:
        return None
    found = [name for name in delivers if reading.get(name, 0) >= READ_AT]
    if found:
        return found
    # Answer is the leftover only where the mode can answer; anywhere else a guess would be a false star.
    return ["answer"] if "answer" in delivers else None


def tables(modes: list[tuple[str, tuple[str, ...]]], path: str) -> str:
    """The quick tables: every mode against how a change ships here, then every project's row."""
    ship, source = project_ship(path)
    width = max(len(name) for name, _ in modes) if modes else 4
    lines = ["Here a change ships as %s (%s)." % (SHIP_SAID[ship], where_from(source)), "",
             "%-*s  delivers" % (width, "mode")]
    for name, delivers in modes:
        lines.append("%-*s  %s" % (width, name, ", ".join(delivers) if delivers else "nothing"))
    rows = [(str(tree), str(kind)) for tree, kind in config().get("delivery") or [] if str(kind) in SHIPS]
    rows.append(("anything else", DEFAULT_SHIP))
    tree_width = max(len(tree) for tree, _ in rows)
    lines += ["", "%-*s  a change ships as" % (tree_width, "project")]
    lines += ["%-*s  %s" % (tree_width, tree, SHIP_SAID[kind]) for tree, kind in rows]
    return "\n".join(lines)
