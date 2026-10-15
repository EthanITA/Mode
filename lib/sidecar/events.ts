import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SidecarEvent, Topic, Topics } from "../../shared/types/events.ts";
import { sidecarHome } from "../mode/paths.ts";
import { Refusal } from "../mode/refusal.ts";

type Fields = Record<string, unknown>;

export interface Publish<T extends Topic> {
  topic: T;
  data: Topics[T];
  // The conversation the event belongs to, as its 8-hex key; defaults to the Claude Code session running this.
  key?: string;
}

export interface Slice {
  events: SidecarEvent[];
  offset: number;
}

const NEWLINE = 0x0a;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

// The registry: a topic is publishable and readable only once it has a parser here.
const PARSE: { [T in Topic]: (data: Fields) => Topics[T] | undefined } = {
  "artifact.created": (data) => {
    const slug = text(data.slug);
    const path = text(data.path);
    return slug && path ? { slug, path, title: text(data.title) || slug } : undefined;
  },
};

export const TOPICS = Object.keys(PARSE) as Topic[];

export function logFile(): string {
  return join(sidecarHome(), "events.jsonl");
}

export function isTopic(name: string): name is Topic {
  return Object.hasOwn(PARSE, name);
}

function parse<T extends Topic>(topic: T, data: unknown): Topics[T] | undefined {
  return typeof data === "object" && data ? PARSE[topic](data as Fields) : undefined;
}

export function publish<T extends Topic>({
  topic,
  data,
  key = process.env.CLAUDE_CODE_SESSION_ID?.slice(0, 8),
}: Publish<T>): void {
  const clean = parse(topic, data);
  if (!clean) throw new Refusal(`not a valid ${topic} event: ${JSON.stringify(data)}`, 2);
  mkdirSync(dirname(logFile()), { recursive: true });
  // One write per line under O_APPEND, so producers in separate processes never interleave.
  appendFileSync(logFile(), `${JSON.stringify({ topic, key, at: new Date().toISOString(), data: clean })}\n`);
}

export function end(): number {
  try {
    return statSync(logFile()).size;
  } catch {
    return 0;
  }
}

function eventOf(line: string, offset: number): SidecarEvent | undefined {
  try {
    const raw = JSON.parse(line) as Fields;
    const topic = text(raw.topic);
    if (!isTopic(topic)) return undefined;
    const data = parse(topic, raw.data);
    if (!data) return undefined;
    const key = text(raw.key);
    return { topic, ...(key && { key }), at: text(raw.at), offset, data };
  } catch {
    return undefined;
  }
}

// A last line with no newline yet is a write still landing, so it waits for the next read.
export function read(since = 0): Slice {
  const size = end();
  // Past the end means the log was cleared, so the consumer starts over from its beginning.
  const from = since > size ? 0 : since;
  if (from === size) return { events: [], offset: size };
  const buffer = Buffer.alloc(size - from);
  const fd = openSync(logFile(), "r");
  try {
    readSync(fd, buffer, 0, buffer.length, from);
  } finally {
    closeSync(fd);
  }
  const events: SidecarEvent[] = [];
  let start = 0;
  for (let nl = buffer.indexOf(NEWLINE); nl !== -1; nl = buffer.indexOf(NEWLINE, start)) {
    const event = eventOf(buffer.subarray(start, nl).toString("utf8"), from + nl + 1);
    if (event) events.push(event);
    start = nl + 1;
  }
  return { events, offset: from + start };
}
