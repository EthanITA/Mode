import { closeSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { record, sessionEntries } from "../../../lib/artifact/store.ts";
import { readTextSafe } from "../../../lib/files.ts";
import { sidecarHome } from "../../../lib/mode/paths.ts";
import * as Events from "../../../lib/sidecar/events.ts";
import { findRecord, openRecord, recordPath } from "../../../lib/web/records.ts";
import { isKey } from "./paths.ts";
import { plain } from "./relay.ts";
import { readOut } from "./speaker.ts";
import { transcriptIndex } from "./transcripts.ts";

const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;
const WEB = /https?:\/\/[^\s<>"'`\]]+/gi;
const TRAILING = /[.,;:!?*_]+$/;
// What these bring back came off the web, so Claude citing it afterwards is not Claude linking it.
const WEB_TOOLS = new Set(["WebFetch", "WebSearch"]);
const NEWLINE = 0x0a;

type Entry = Record<string, unknown>;

export interface LinkAdoption {
  key: string;
  /** Said just now, so it is announced the way a new page is; a catch-up on older turns lands quietly. */
  isLive?: boolean;
}

interface Ledger {
  /** What a web tool brought in, which Claude citing never adopts but the user saying it still does. */
  fetched: string[];
  links: string[];
  offset: number;
  /** Web tool calls still waiting on a result, which can land in a later read than the call. */
  pending: string[];
}

interface Placing {
  held: string[];
  href: string;
  isLive: boolean;
  key: string;
}

const count = (text: string, char: string): number => text.split(char).length - 1;
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

// A markdown link's closing paren rides along on the match, while one the address itself opened stays.
function trimmed(match: string): string {
  let url = match.replace(TRAILING, "");
  while (url.endsWith(")") && count(url, "(") < count(url, ")")) url = url.slice(0, -1).replace(TRAILING, "");
  return url;
}

function addressesIn(text: string): string[] {
  const out = new Set<string>();
  for (const [match] of text.matchAll(WEB)) {
    const url = trimmed(match);
    if (URL.canParse(url)) out.add(new URL(url).href);
  }
  return [...out];
}

const linksOf = (text: string): string[] => addressesIn(text.replace(CODE, " "));

// A search lists a page as ?hl=es and Claude cites it bare, so what a web tool brought in matches on the page alone.
function pageOf(href: string): string {
  const { origin, pathname } = new URL(href);
  return `${origin}${pathname.replace(/\/+$/, "")}`;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("\n");
  return typeof value === "object" && value ? Object.values(value).map(textOf).join("\n") : "";
}

function blocksOf(entry: Entry): Entry[] {
  const content = (entry.message as Entry | undefined)?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content.filter((one): one is Entry => typeof one === "object" && !!one) : [];
}

const spoken = (text: string): string[] =>
  readOut(text).flatMap((piece) => (piece.kind === "said" ? [plain(piece.text)] : []));

// The user's own words, read as the chat reads them, so a reminder, hook context or a skill's body never counts.
function userSaid(entry: Entry): string[] {
  if (entry.type === "queue-operation") return entry.operation === "enqueue" ? spoken(str(entry.content)) : [];
  if (entry.type !== "user" || entry.isMeta || entry.isCompactSummary) return [];
  const blocks = blocksOf(entry);
  if (blocks[0]?.type === "tool_result") return [];
  return spoken(
    blocks
      .filter((block) => block.type === "text")
      .map((block) => str(block.text))
      .join(""),
  );
}

// Through the last whole line, so a record still being written is read on the next pass rather than cut in half.
function readFrom(path: string, offset: number): { entries: Entry[]; offset: number } {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    if (size <= offset) return { entries: [], offset: size };
    const buffer = Buffer.alloc(size - offset);
    readSync(fd, buffer, 0, buffer.length, offset);
    const end = buffer.lastIndexOf(NEWLINE) + 1;
    const entries = buffer
      .subarray(0, end)
      .toString("utf8")
      .split("\n")
      .flatMap((line): Entry[] => {
        try {
          const parsed: unknown = JSON.parse(line);
          return typeof parsed === "object" && parsed ? [parsed as Entry] : [];
        } catch {
          return [];
        }
      });
    return { entries, offset: offset + end };
  } finally {
    closeSync(fd);
  }
}

function ledgerPath(key: string): string {
  return join(sidecarHome(), "links", `${key}.json`);
}

function ledgerOf(file: string): Ledger {
  try {
    const { fetched, links, offset, pending } = JSON.parse(readTextSafe(file) ?? "") as Partial<Ledger>;
    return {
      fetched: strings(fetched),
      links: strings(links),
      offset: typeof offset === "number" ? offset : 0,
      pending: strings(pending),
    };
  } catch {
    return { fetched: [], links: [], offset: 0, pending: [] };
  }
}

function place({ held, href, isLive, key }: Placing): void {
  const url = new URL(href);
  if (findRecord({ among: held, url })) return;
  const { record: made } = openRecord({ url });
  record(made.slug, key);
  held.push(made.slug);
  if (isLive)
    Events.publish({
      topic: "artifact.created",
      key,
      data: { slug: made.slug, title: url.host, path: recordPath(made.slug) },
    });
}

// Each address once per conversation, so a link artifact someone removed stays gone however often it is said again.
function adopt({ key, isLive = false }: LinkAdoption): void {
  if (!isKey(key)) return;
  const path = transcriptIndex().get(key)?.path;
  if (!path) return;
  const file = ledgerPath(key);
  const ledger = ledgerOf(file);
  const read = readFrom(path, ledger.offset);
  if (read.offset === ledger.offset) return;
  const links = new Set(ledger.links);
  const fetched = new Set(ledger.fetched);
  const pending = new Set(ledger.pending);
  const held = sessionEntries(key);
  const take = (href: string): void => {
    if (links.has(href)) return;
    links.add(href);
    place({ held, href, isLive, key });
  };
  for (const entry of read.entries) {
    if (entry.isSidechain) continue;
    for (const text of userSaid(entry)) for (const href of linksOf(text)) take(href);
    for (const block of blocksOf(entry)) {
      if (block.type === "tool_use" && WEB_TOOLS.has(str(block.name))) {
        pending.add(str(block.id));
        for (const href of addressesIn(textOf(block.input))) fetched.add(pageOf(href));
      } else if (block.type === "tool_result" && pending.delete(str(block.tool_use_id))) {
        for (const href of addressesIn(textOf(block.content))) fetched.add(pageOf(href));
      } else if (entry.type === "assistant" && block.type === "text") {
        for (const href of linksOf(str(block.text))) if (!fetched.has(pageOf(href))) take(href);
      }
    }
  }
  mkdirSync(dirname(file), { recursive: true });
  const next: Ledger = { fetched: [...fetched], links: [...links], offset: read.offset, pending: [...pending] };
  writeFileSync(file, `${JSON.stringify(next)}\n`);
}

export const Links = {
  // Never throws, since it runs inside the stream's file watcher, where a throw would take the server down.
  adopt(options: LinkAdoption): void {
    try {
      adopt(options);
    } catch {}
  },
  ledger: ledgerPath,
  of: linksOf,
};
