import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { Part, Word } from "./parse.ts";

export type Scope = {
  cwd?: string;
  vars: Map<string, string[] | undefined>;
  env: Record<string, string | undefined>;
  home: string;
};

// One argv word after expansion; no value means the guard cannot see it, and `known` is the text before the unseen part.
export type Arg = { raw: string; value?: string; known?: string };

type Segment = { text: string; glob: boolean };

// What `$(mktemp …)` expands to: a path made by this very command, so whatever it holds is the command's own.
export const FRESH = "\u0000fresh";

const GLOB = /[*?[]/;
const MAX_EXPANSIONS = 2000;

export const clone = (scope: Scope): Scope => ({ ...scope, vars: new Map(scope.vars) });

function rawOf(word: Word): string {
  return word
    .map((part) =>
      part.kind === "text" ? part.text : part.kind === "var" ? `$${part.name || "?"}` : `$(${part.script.trim()})`,
    )
    .join("");
}

function lookup(name: string, scope: Scope): string[] | undefined {
  if (!name) return undefined;
  if (scope.vars.has(name)) return scope.vars.get(name);
  if (name === "PWD") return scope.cwd ? [scope.cwd] : undefined;
  const value = scope.env[name];
  return typeof value === "string" ? [value] : undefined;
}

// The few substitutions whose output the guard can know without running anything that writes.
function substitute(script: string, scope: Scope): string | undefined {
  const command = script.trim();
  if (command === "pwd") return scope.cwd;
  if (/^mktemp(\s|$)/.test(command)) return FRESH;
  if (/tmpdir\(\)/.test(command)) return tmpdir();
  if (/^git rev-parse --show-toplevel$/.test(command) && scope.cwd) {
    const done = spawnSync("git", ["-C", scope.cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: 5000,
    });
    return done.status === 0 ? done.stdout.trim() : undefined;
  }
  return undefined;
}

function options(part: Part, scope: Scope): Segment[] | undefined {
  if (part.kind === "text") return [{ text: part.text, glob: !part.quoted }];
  if (part.kind === "sub") {
    const value = substitute(part.script, scope);
    return value ? [{ text: value, glob: false }] : undefined;
  }
  const values = lookup(part.name, scope);
  const fallback = typeof part.fallback === "string" ? [{ text: part.fallback, glob: false }] : undefined;
  if (fallback && (!values || values.every((value) => !value))) return fallback;
  return values?.map((text) => ({ text, glob: false }));
}

function braces(text: string): string[] {
  const open = text.indexOf("{");
  if (open < 0) return [text];
  let depth = 0;
  const commas: number[] = [];
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) {
      const head = text.slice(0, open);
      const tail = braces(text.slice(i + 1));
      if (!commas.length) return braces(text.slice(open + 1)).map((rest) => head + "{" + rest);
      const cuts = [open, ...commas, i];
      const choices = cuts.slice(1).flatMap((cut, k) => braces(text.slice((cuts[k] ?? 0) + 1, cut)));
      return choices.flatMap((choice) => tail.map((rest) => head + choice + rest));
    } else if (text[i] === "," && depth === 1) commas.push(i);
  }
  return [text];
}

function patternOf(segments: Segment[]): string {
  return segments.map(({ text, glob }) => (glob ? text : text.replace(/[*?[\]\\]/g, "\\$&"))).join("");
}

function componentRegex(component: string): RegExp {
  let out = "";
  for (let i = 0; i < component.length; i++) {
    const c = component[i] ?? "";
    if (c === "\\") out += (component[++i] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else if (c === "[") {
      const end = component.indexOf("]", i + 2);
      if (end < 0) out += "\\[";
      else {
        out += "[" + component.slice(i + 1, end).replace(/^!/, "^") + "]";
        i = end;
      }
    } else out += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

const unescape = (text: string): string => text.replace(/\\(.)/g, "$1");

// Filesystem globbing the way the shell does it, so `rm -rf *` is judged by what is actually there.
function glob(pattern: string, cwd: string): string[] {
  const absolute = pattern.startsWith("/");
  const parts = pattern.split("/").filter((part, i) => part || i === 0);
  let found: string[] = [absolute ? "/" : ""];
  for (const part of absolute ? parts.slice(1) : parts) {
    if (!part) continue;
    const next: string[] = [];
    for (const base of found) {
      const dir = resolve(cwd, base || ".");
      if (!GLOB.test(part.replace(/\\./g, ""))) {
        next.push(base ? `${base.replace(/\/$/, "")}/${unescape(part)}` : unescape(part));
        continue;
      }
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        continue;
      }
      const matcher = componentRegex(part);
      for (const name of names.sort()) {
        if (name.startsWith(".") && !part.startsWith(".")) continue;
        if (matcher.test(name)) next.push(base ? `${base.replace(/\/$/, "")}/${name}` : name);
      }
    }
    found = next.slice(0, MAX_EXPANSIONS);
  }
  return found.filter((path) => {
    try {
      statSync(resolve(cwd, path));
      return true;
    } catch {
      return false;
    }
  });
}

export function expand(word: Word, scope: Scope, { split = true }: { split?: boolean } = {}): Arg[] {
  const raw = rawOf(word);
  let combos: Segment[][] = [[]];
  for (const part of word) {
    const choices = options(part, scope);
    if (!choices) {
      const known = combos.length === 1 ? (combos[0] ?? []).map((segment) => segment.text).join("") : "";
      return [{ raw, known: known.startsWith("~/") ? scope.home + known.slice(1) : known }];
    }
    combos = combos.flatMap((combo) => choices.map((choice) => [...combo, choice])).slice(0, MAX_EXPANSIONS);
  }
  const out: Arg[] = [];
  for (const combo of combos) {
    const first = combo[0];
    if (first?.glob && first.text.startsWith("~")) {
      const user = /^~([^/]*)/.exec(first.text)?.[1];
      if (user) return [{ raw }];
      combo[0] = { text: scope.home + first.text.slice(1), glob: false };
    }
    const variants = split
      ? combo.reduce<Segment[][]>(
          (acc, segment) =>
            acc.flatMap((prefix) =>
              (segment.glob ? braces(segment.text) : [segment.text]).map((text) => [
                ...prefix,
                { text, glob: segment.glob },
              ]),
            ),
          [[]],
        )
      : [combo];
    for (const segments of variants) {
      const value = segments.map((segment) => segment.text).join("");
      if (split && segments.some((segment) => segment.glob && GLOB.test(segment.text))) {
        if (!scope.cwd && !value.startsWith("/")) return [{ raw }];
        const matches = glob(patternOf(segments), scope.cwd ?? "/");
        out.push(...(matches.length ? matches : [value]).map((match) => ({ raw, value: match })));
      } else out.push({ raw, value });
    }
  }
  return out.slice(0, MAX_EXPANSIONS);
}

// An absolute path for an argv word, keeping a trailing slash because rsync and rm read it.
export function absolute(value: string, scope: Scope): string | undefined {
  if (value.startsWith(FRESH)) return value;
  if (isAbsolute(value)) return value;
  if (!scope.cwd) return undefined;
  if (scope.cwd.startsWith(FRESH)) return FRESH;
  const path = resolve(scope.cwd, value);
  return value.endsWith("/") && path !== "/" ? `${path}/` : path;
}
