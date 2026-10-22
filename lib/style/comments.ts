import { strip } from "../text.ts";

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

// Directives and deprecation markers are not prose.
export const EXEMPT =
  /eslint-|@ts-|prettier-ignore|noqa|type:\s*ignore|pylint:|flake8:|shellcheck|biome-ignore|DEPRECATED|^#!/i;
const STRINGS = /https?:\/\/[^\s"'`]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;

export function markerOf(extension: string): string | undefined {
  return SLASH.has(extension) ? "//" : HASH.has(extension) ? "#" : undefined;
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

export function addedComments(before: string, after: string, marker: string): string[] {
  const kept = new Set(blocksIn(before, marker).flat());
  const added: string[] = [];
  for (const block of blocksIn(after, marker)) {
    const first = block.find((line) => !kept.has(line));
    if (first) added.push(first);
  }
  return added;
}
