import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { record, sessionEntries } from "../../../lib/artifact/store.ts";
import { readTextSafe } from "../../../lib/files.ts";
import { sidecarHome } from "../../../lib/mode/paths.ts";
import * as Events from "../../../lib/sidecar/events.ts";
import { findRecord, openRecord, recordPath } from "../../../lib/web/records.ts";
import { conversationOf, type ConversationTurn } from "./conversation.ts";
import { isKey } from "./paths.ts";

const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;
const WEB = /https?:\/\/[^\s<>"'`\]]+/gi;
const TRAILING = /[.,;:!?*_]+$/;

export interface LinkAdoption {
  key: string;
  /** Said just now, so it is announced the way a new page is; a catch-up on older turns lands quietly. */
  isLive?: boolean;
}

interface Ledger {
  links: string[];
  offset: number;
}

const count = (text: string, char: string): number => text.split(char).length - 1;

// A markdown link's closing paren rides along on the match, while one the address itself opened stays.
function trimmed(match: string): string {
  let url = match.replace(TRAILING, "");
  while (url.endsWith(")") && count(url, "(") < count(url, ")")) url = url.slice(0, -1).replace(TRAILING, "");
  return url;
}

function linksOf(text: string): string[] {
  const out = new Set<string>();
  for (const [match] of text.replace(CODE, " ").matchAll(WEB)) {
    const url = trimmed(match);
    if (URL.canParse(url)) out.add(new URL(url).href);
  }
  return [...out];
}

const isSaid = ({ role, kind }: ConversationTurn): boolean =>
  role === "user" || (role === "assistant" && (kind === "narration" || kind === "answer"));

function ledgerPath(key: string): string {
  return join(sidecarHome(), "links", `${key}.json`);
}

function ledgerOf(file: string): Ledger {
  try {
    const { links, offset } = JSON.parse(readTextSafe(file) ?? "") as Partial<Ledger>;
    return {
      links: Array.isArray(links) ? links.filter((one) => typeof one === "string") : [],
      offset: typeof offset === "number" ? offset : 0,
    };
  } catch {
    return { links: [], offset: 0 };
  }
}

// Each address once per conversation, so a link artifact someone removed stays gone however often it is said again.
function adopt({ key, isLive = false }: LinkAdoption): void {
  if (!isKey(key)) return;
  const file = ledgerPath(key);
  const { links, offset } = ledgerOf(file);
  const slice = conversationOf({ key, since: offset });
  if (slice.offset === offset) return;
  const seen = new Set(links);
  const held = sessionEntries(key);
  for (const href of slice.turns.filter(isSaid).flatMap((turn) => linksOf(turn.text))) {
    if (seen.has(href)) continue;
    seen.add(href);
    const url = new URL(href);
    if (findRecord({ among: held, url })) continue;
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
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ links: [...seen], offset: slice.offset } satisfies Ledger)}\n`);
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
