import { head, quote, strip, words } from "../text.ts";

export const SLASH = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".go",
  ".rs",
  ".java",
  ".swift",
  ".kt",
  ".c",
  ".h",
  ".cpp",
]);
export const HASH = new Set([".py", ".sh", ".bash", ".zsh", ".rb"]);

// A WHY that needs more than this has stopped being a note and become prose.
const MAX_BLOCK_LINES = 2;
const MAX_WORDS = 28;
// Two short notes is the WHY exemption; a third is a habit.
const QUIET_BLOCKS = 2;

// Directives and deprecation markers are not prose.
export const EXEMPT =
  /eslint-|@ts-|prettier-ignore|noqa|type:\s*ignore|pylint:|flake8:|shellcheck|biome-ignore|DEPRECATED|^#!/i;
const STRINGS = /https?:\/\/[^\s"'`]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
const MARKER = /^\s*(?:\/\/+|#+|\/\*+|\*+)\s*/;

export function markerOf(extension: string): string | undefined {
  return SLASH.has(extension) ? "//" : HASH.has(extension) ? "#" : undefined;
}

// A header sits before any code, so only the first real line counts.
export function opensWithHeader(text: string, marker: string): boolean {
  const [opening] = text
    .split("\n")
    .filter((line) => strip(line) && !line.startsWith("#!"))
    .map(strip);
  return !!opening && (opening.startsWith(marker) || opening.startsWith("/*")) && !EXEMPT.test(opening);
}

// Consecutive comment-only lines are one block, because three stacked // lines are one paragraph to a reader.
export function blocksIn(text: string, marker: string): string[][] {
  const found: string[][] = [];
  let current: string[] = [];
  for (const raw of text.split("\n")) {
    const line = strip(raw.replace(STRINGS, ""));
    const isComment = line.startsWith(marker) || (marker === "//" && line.startsWith("/*"));
    if (isComment && !EXEMPT.test(line)) {
      current.push(strip(raw));
    } else if (current.length) {
      found.push(current);
      current = [];
    }
  }
  if (current.length) found.push(current);
  return found;
}

export function verdicts(blocks: string[][], header: boolean, wholeFile: boolean): string[] {
  const out: string[] = [];
  if (header) out.push("it opens with a file-header comment — banned outright");
  for (const block of blocks) {
    const count = words(block.map((line) => line.replace(MARKER, "")).join(" ")).length;
    const first = quote(head(block[0] ?? "", 60));
    if (block.length > MAX_BLOCK_LINES)
      out.push(`${block.length}-line comment ${first} — a WHY fits in one line, two at most`);
    else if (count > MAX_WORDS) out.push(`${count}-word comment ${first} — say it shorter or not at all`);
  }
  // Density counts on an Edit, which appends; a Write's total says nothing about restraint.
  if (!wholeFile && blocks.length > QUIET_BLOCKS)
    out.push(`${blocks.length} separate comments in one edit — the default is zero`);
  return out;
}
