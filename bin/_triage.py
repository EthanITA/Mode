from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from _jev import ask, question

WORK_AT = 0.5
BROADCAST_AT = 0.5
MATCH_AT = 0.7
FIRST_LINE_CHARS = 200

WORK = question(
    "Does request ask for something to be done, such as a change, a fix, research, a review or a document, "
    "rather than something a reply settles?",
    "Yes when somebody has to do work to fulfil it.",
    "No when a reply settles it: a question about the sessions, their status or something one lookup shows, "
    "or something only the user can answer.",
)
BROADCAST = question(
    "Is request an instruction meant for running sessions themselves, such as wrapping up, pausing, carrying "
    "on or picking up where they left off, rather than new work?",
    "Yes when it tells sessions how to proceed.",
    "No when it asks for work or for a reply.",
)


def match(key: str) -> dict:
    return question(
        f"Is request about the same work as the entry in live_sessions whose key is {key}?",
        "Yes when it continues, changes or asks about that session's work, such as the same ticket, repo or topic.",
        "No when it is about something else.",
    )


@dataclass
class Session:
    key: str
    title: str
    first: str
    cwd: str


@dataclass
class Verdict:
    outcome: str
    targets: list[Session] = field(default_factory=list)
    reading: dict[str, float] = field(default_factory=dict)


def first_line(home: Path, session_id: str) -> str:
    for transcript in home.glob(f"projects/*/{session_id}.jsonl"):
        with transcript.open(errors="replace") as lines:
            for line in lines:
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                content = (entry.get("message") or {}).get("content") if entry.get("type") == "user" else None
                if isinstance(content, list):
                    content = " ".join(i.get("text") or "" for i in content if isinstance(i, dict) and i.get("type") == "text")
                text = content if isinstance(content, str) else ""
                if text.strip() and not entry.get("isMeta") and not text.lstrip().startswith("<"):
                    return text.strip().splitlines()[0][:FIRST_LINE_CHARS]
    return ""


def alive(pid: object) -> bool:
    try:
        os.kill(int(pid), 0)
    except (OSError, TypeError, ValueError):
        return False
    return True


def live_sessions() -> list[Session]:
    home = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
    me = os.environ.get("CLAUDE_CODE_SESSION_ID", "")
    found = []
    for entry in sorted((home / "sessions").glob("*.json")):
        try:
            record = json.loads(entry.read_text(errors="replace"))
        except (OSError, ValueError):
            continue
        session_id = str(record.get("sessionId") or "")
        if not session_id or session_id == me or not alive(record.get("pid")):
            continue
        found.append(Session(session_id[:8], str(record.get("name") or ""), first_line(home, session_id),
                             str(record.get("cwd") or "")))
    return found


def decide(reading: dict[str, float], sessions: list[Session]) -> Verdict:
    matched = [s for s in sessions if reading.get(f"session_{s.key}", 0) >= MATCH_AT]
    if reading.get("broadcast", 0) >= BROADCAST_AT:
        return Verdict("relay", matched or sessions, reading)
    if reading.get("work", 0) < WORK_AT:
        return Verdict("answer", matched, reading)
    if len(matched) > 1:
        # Two sessions that both fit is a guess the contract leaves to the user.
        return Verdict("ask", matched, reading)
    return Verdict("relay", matched, reading) if matched else Verdict("new", [], reading)


def triage(request: str) -> Verdict | None:
    sessions = live_sessions()
    questions = {"work": WORK, "broadcast": BROADCAST, **{f"session_{s.key}": match(s.key) for s in sessions}}
    state = {"request": request,
             "live_sessions": [{"key": s.key, "title": s.title, "first_prompt": s.first, "cwd": s.cwd}
                               for s in sessions]}
    reading = ask(questions, state)
    return decide(reading, sessions) if reading is not None else None
