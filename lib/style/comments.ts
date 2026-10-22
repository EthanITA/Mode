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

// Directives and deprecation markers are not prose.
export const EXEMPT =
  /eslint-|@ts-|prettier-ignore|noqa|type:\s*ignore|pylint:|flake8:|shellcheck|biome-ignore|DEPRECATED|^#!/i;
const STRINGS = /https?:\/\/[^\s"'`]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
const MARKER = /^\s*(?:\/\/+|#+|\/\*+|\*+)\s*/;

export function markerOf(extension: string): string | undefined {
  return SLASH.has(extension) ? "//" : HASH.has(extension) ? "#" : undefined;
}

// A header sits before any code, so only the first real line counts.
export function headerOf(text: string, marker: string): string | undefined {
  const [opening] = text
    .split("\n")
    .filter((line) => strip(line) && !line.startsWith("#!"))
    .map(strip);
  if (!opening || EXEMPT.test(opening)) return undefined;
  return opening.startsWith(marker) || opening.startsWith("/*") ? opening : undefined;
}

// Consecutive comment-only lines are one block, because three stacked // lines are one paragraph to a reader.
function blocksIn(text: string, marker: string): string[][] {
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

export function shown(block: string[]): string {
  return quote(head(block[0] ?? "", 60));
}

export function overreach(block: string[], header?: string): string | undefined {
  if (block[0] === header) return `file-header comment ${shown(block)}, banned outright`;
  if (block.length > MAX_BLOCK_LINES)
    return `${block.length}-line comment ${shown(block)}, a WHY fits in one line, two at most`;
  const count = words(block.map((line) => line.replace(MARKER, "")).join(" ")).length;
  return count > MAX_WORDS ? `${count}-word comment ${shown(block)}, say it shorter or not at all` : undefined;
}

export function addedBlocks(before: string, after: string, marker: string): string[][] {
  const kept = new Set(blocksIn(before, marker).flat());
  return blocksIn(after, marker).filter((block) => block.some((line) => !kept.has(line)));
}
