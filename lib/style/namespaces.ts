import { WORD } from "../text.ts";

export const TYPED = new Set([".ts", ".tsx", ".mts", ".cts", ".vue", ".js", ".jsx", ".mjs", ".cjs"]);

const STAR = new RegExp(String.raw`^\s*export\s+\*\s+(?:as\s+[\p{L}\p{N}_$]+\s+)?from(?!${WORD})`, "mu");
const DECLARED =
  /^\s*export\s+(?:async\s+)?(?:const|let|var|function\*?|class|abstract\s+class|type|interface|enum)\s+([A-Za-z_$][\p{L}\p{N}_$]*)/gmu;
const PREFIX = /^([a-z]{4,})(?=[A-Z])/;
// A verb names an action, not a domain: formatDate beside formatMoney is two formatters, not a Format namespace.
const VERBS = new Set([
  "create",
  "build",
  "make",
  "format",
  "parse",
  "render",
  "handle",
  "fetch",
  "load",
  "should",
  "with",
  "from",
  "into",
  "assert",
  "ensure",
  "resolve",
  "validate",
  "normalize",
  "serialize",
  "compute",
  "toggle",
  "update",
  "delete",
  "remove",
  "apply",
  "register",
  "define",
  "read",
  "write",
  "find",
  "list",
  "check",
  "watch",
]);

export function offenders(text: string): string[] {
  const findings: string[] = [];
  if (STAR.test(text))
    findings.push("`export *` re-exports everything: the index is an allowlist, so name what leaves");
  const groups = new Map<string, string[]>();
  for (const [, name = ""] of text.matchAll(DECLARED)) {
    const prefix = PREFIX.exec(name)?.[1];
    if (prefix && !VERBS.has(prefix)) groups.set(prefix, [...(groups.get(prefix) ?? []), name]);
  }
  for (const [prefix, names] of groups) {
    if (names.length < 2) continue;
    const rest = (names[0] ?? "").slice(prefix.length);
    findings.push(
      `${names.length} exports share the prefix \`${prefix}\` (${names.join(", ")}): a shared prefix is a namespace asking to exist, ` +
        `\`${prefix[0]?.toUpperCase()}${prefix.slice(1)}.${rest.slice(0, 1).toLowerCase()}${rest.slice(1)}()\` behind one curated index`,
    );
  }
  return findings;
}
