import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configRoot } from "../mode/paths.ts";
import { head, pyStr, strip } from "../text.ts";

const CAP = 6;
const TEXT_CAP = 60;

type News = { id?: unknown; kind?: unknown; text?: unknown; owner?: unknown; seq?: unknown };

const line = (said: string): string =>
  `Board changed in the sidecar: ${said}. Marco edited the board directly rather than saying it, so ` +
  "there is nothing to reply to — carry it into what you are doing.";

function clause(item: News): string {
  const task = `#${pyStr(item.id)}`;
  if (item.kind === "added") {
    const text = strip(typeof item.text === "string" ? item.text : "");
    const long = Array.from(text).length > TEXT_CAP;
    return `${task} added "${long ? head(text, TEXT_CAP - 1).trimEnd() + "…" : text}"`;
  }
  if (item.kind === "owner") return `${task} reassigned to ${item.owner ? pyStr(item.owner) : "nobody"}`;
  return `${task} ${pyStr(item.kind)}`;
}

// A seq that is not a number throws, as it always has, which drops the whole note rather than miscounting.
function seqOf(item: News): number {
  const seq = item.seq || 0;
  if (typeof seq !== "number" && typeof seq !== "boolean") throw new TypeError("board news seq is not a number");
  return Number(seq);
}

// What changed on the board since this session last looked, or "". Advances the cursor, so a delta lands once.
export function newsLine(sessionId: string): string {
  const key = sessionId.slice(0, 8);
  const home = join(configRoot(), "board");
  const seenPath = join(home, `session-${key}.seen`);
  let items: unknown[];
  try {
    const data: unknown = JSON.parse(readFileSync(join(home, `session-${key}.json`), "utf8"));
    const news = (data as { news?: unknown }).news;
    items = Array.isArray(news) ? news : [];
  } catch {
    return "";
  }
  let seen = 0;
  try {
    const text = strip(readFileSync(seenPath, "utf8"));
    if (/^[+-]?\d+$/.test(text)) seen = Number(text);
  } catch {}
  const fresh = items
    .filter((one): one is News => typeof one === "object" && !!one && !Array.isArray(one))
    .filter((one) => seqOf(one) > seen);
  if (!fresh.length) return "";
  // Cursor first: a delivery we cannot record is one the next tool call would repeat.
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(seenPath, String(Math.max(...fresh.map(seqOf))));
  } catch {
    return "";
  }
  const shown = fresh.slice(0, CAP).map(clause);
  if (fresh.length > CAP) shown.push(`and ${fresh.length - CAP} more`);
  return line(shown.join("; "));
}
