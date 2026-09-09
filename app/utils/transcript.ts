export type TurnSegment =
  | { kind: "prose"; text: string }
  | { body: string; kind: "block"; summary: string; tag: string };

const WRAPPERS = [
  "bash-input",
  "bash-stderr",
  "bash-stdout",
  "command-args",
  "command-message",
  "command-name",
  "local-command-caveat",
  "local-command-stderr",
  "local-command-stdout",
  "system-reminder",
  "task-notification",
];

// An allowlist, never "anything angle-bracketed": turn text is full of `<slug>` and `<path>` prose.
const BLOCK = new RegExp(`<(${WRAPPERS.join("|")})>([\\s\\S]*?)</\\1>`, "g");
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,}).*$/gm;
const INLINE = /`[^`\n]+`/g;
const SUMMARY_CHARS = 72;

export function turnSegments(text: string): TurnSegment[] {
  const guarded = guardedRanges(text);
  const out: TurnSegment[] = [];
  let at = 0;
  for (const found of text.matchAll(BLOCK)) {
    const start = found.index ?? 0;
    if (guarded.some(([from, to]) => start >= from && start < to)) continue;
    addProse(out, text.slice(at, start));
    const body = (found[2] ?? "").trim();
    out.push({ body, kind: "block", summary: summaryOf(body), tag: found[1] ?? "" });
    at = start + found[0].length;
  }
  addProse(out, text.slice(at));
  return out;
}

function addProse(out: TurnSegment[], text: string): void {
  const trimmed = text.trim();
  if (trimmed) out.push({ kind: "prose", text: trimmed });
}

function summaryOf(body: string): string {
  const head = shorten(body, SUMMARY_CHARS);
  const lines = body ? body.split("\n").length : 0;
  if (lines < 2) return head;
  return head ? `${head} · ${plural(lines, "line")}` : plural(lines, "line");
}

// Folding too little only leaves a blob raw; folding inside a fence would hide code the turn is about.
function guardedRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let open = -1;
  for (const fence of text.matchAll(FENCE)) {
    const at = fence.index ?? 0;
    if (open < 0) open = at;
    else {
      out.push([open, at + fence[0].length]);
      open = -1;
    }
  }
  if (open >= 0) out.push([open, text.length]);
  for (const span of text.matchAll(INLINE)) {
    const at = span.index ?? 0;
    out.push([at, at + span[0].length]);
  }
  return out;
}
