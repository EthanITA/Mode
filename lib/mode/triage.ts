import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readTextSafe } from "../files.ts";
import { lines, splitLines, strip } from "../text.ts";
import { ask, question } from "./jev.ts";
import { configRoot } from "./paths.ts";

const WORK_AT = 0.5;
const BROADCAST_AT = 0.5;
const MATCH_AT = 0.7;
const FIRST_LINE_CHARS = 200;

const WORK = question(
  "Does request ask for something to be done, such as a change, a fix, research, a review or a document, rather than something a reply settles?",
  "Yes when somebody has to do work to fulfil it.",
  "No when a reply settles it: a question about the sessions, their status or something one lookup shows, or something only the user can answer.",
);
const BROADCAST = question(
  "Is request an instruction meant for running sessions themselves, such as wrapping up, pausing, carrying on or picking up where they left off, rather than new work?",
  "Yes when it tells sessions how to proceed.",
  "No when it asks for work or for a reply.",
);

const match = (key: string) =>
  question(
    `Is request about the same work as the entry in live_sessions whose key is ${key}?`,
    "Yes when it continues, changes or asks about that session's work, such as the same ticket, repo or topic.",
    "No when it is about something else.",
  );

type Session = { key: string; title: string; first: string; cwd: string };
export type Verdict = {
  outcome: "new" | "relay" | "answer" | "ask";
  targets: Session[];
  reading: Record<string, number>;
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => typeof part === "object" && part && (part as { type?: unknown }).type === "text")
    .map((part) => String((part as { text?: unknown }).text || ""))
    .join(" ");
}

function firstLine(home: string, sessionId: string): string {
  let projects: string[];
  try {
    projects = readdirSync(join(home, "projects"));
  } catch {
    return "";
  }
  for (const project of projects) {
    for (const line of splitLines(readTextSafe(join(home, "projects", project, `${sessionId}.jsonl`)) ?? "")) {
      let entry: { type?: unknown; isMeta?: unknown; message?: { content?: unknown } };
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const text = entry.type === "user" ? textOf(entry.message?.content) : "";
      if (strip(text) && !entry.isMeta && !text.trimStart().startsWith("<"))
        return Array.from(lines(strip(text))[0] ?? "")
          .slice(0, FIRST_LINE_CHARS)
          .join("");
    }
  }
  return "";
}

function alive(pid: unknown): boolean {
  const id = Number(pid);
  if (!Number.isInteger(id)) return false;
  try {
    process.kill(id, 0);
    return true;
  } catch {
    return false;
  }
}

function liveSessions(): Session[] {
  const home = configRoot();
  const me = process.env.CLAUDE_CODE_SESSION_ID ?? "";
  let files: string[];
  try {
    files = readdirSync(join(home, "sessions"))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  const found: Session[] = [];
  for (const file of files) {
    let record: { sessionId?: unknown; pid?: unknown; name?: unknown; cwd?: unknown };
    try {
      record = JSON.parse(readTextSafe(join(home, "sessions", file)) ?? "");
    } catch {
      continue;
    }
    const sessionId = String(record.sessionId || "");
    if (!sessionId || sessionId === me || !alive(record.pid)) continue;
    found.push({
      key: sessionId.slice(0, 8),
      title: String(record.name || ""),
      first: firstLine(home, sessionId),
      cwd: String(record.cwd || ""),
    });
  }
  return found;
}

function decide(reading: Record<string, number>, sessions: Session[]): Verdict {
  const matched = sessions.filter((session) => (reading[`session_${session.key}`] ?? 0) >= MATCH_AT);
  if ((reading.broadcast ?? 0) >= BROADCAST_AT)
    return { outcome: "relay", targets: matched.length ? matched : sessions, reading };
  if ((reading.work ?? 0) < WORK_AT) return { outcome: "answer", targets: matched, reading };
  // Two sessions that both fit is a guess the contract leaves to the user.
  if (matched.length > 1) return { outcome: "ask", targets: matched, reading };
  return matched.length ? { outcome: "relay", targets: matched, reading } : { outcome: "new", targets: [], reading };
}

export async function triage(request: string): Promise<Verdict | undefined> {
  const sessions = liveSessions();
  const questions = {
    work: WORK,
    broadcast: BROADCAST,
    ...Object.fromEntries(sessions.map((session) => [`session_${session.key}`, match(session.key)])),
  };
  const state = {
    request,
    live_sessions: sessions.map(({ key, title, first, cwd }) => ({ key, title, first_prompt: first, cwd })),
  };
  const reading = await ask(questions, state);
  return reading ? decide(reading, sessions) : undefined;
}

export function triageReport(verdict: Verdict): string {
  const targets = verdict.targets.map((session) => strip(`${session.key} ${session.title}`)).join("; ");
  const joint = verdict.outcome === "answer" ? " about " : verdict.outcome === "ask" ? " between " : " to ";
  const reading = Object.entries(verdict.reading)
    .map(([name, p]) => `${name} ${p.toFixed(2)}`)
    .join(", ");
  return verdict.outcome + (targets ? joint + targets : "") + ` (${reading})`;
}
