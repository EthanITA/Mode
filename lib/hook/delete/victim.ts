import { absolute, type Arg, type Scope } from "./scope.ts";

export type Rule = { exclude: boolean; pattern: string };

// `tree` takes everything under the path, `entry` replaces or removes one entry, `move` carries it elsewhere intact.
export type Victim =
  | { kind: "path"; path: string; how: "tree" | "entry" | "move"; tool: string }
  | { kind: "mirror"; target: string; source?: string; rules: Rule[]; prune: boolean; overwrite: boolean; tool: string }
  | { kind: "dirty"; cwd: string; specs: string[]; staged: boolean; tool: string }
  | { kind: "stop"; tool: string; why: string; within?: string };

export type Tool = (args: Arg[], scope: Scope, name: string) => Victim[];

// Whatever the unseen part turns out to be, the path stays under the directory its visible start names.
export function blind(tool: string, arg: Arg, scope: Scope): Extract<Victim, { kind: "stop" }> {
  const known = arg.known ?? "";
  const dir = known.includes("/") ? known.slice(0, known.lastIndexOf("/") + 1) : known ? "./" : undefined;
  return {
    kind: "stop",
    tool,
    why: `can't be checked, because the guard can't see what \`${arg.raw}\` expands to. Spell the path out literally`,
    within: dir && !dir.includes("..") ? absolute(dir, scope) : undefined,
  };
}

export function pathVictim(arg: Arg, scope: Scope, how: "tree" | "entry" | "move", tool: string): Victim {
  if (typeof arg.value !== "string") return blind(tool, arg, scope);
  const path = absolute(arg.value, scope);
  if (!path)
    return {
      kind: "stop",
      tool,
      why: `can't be checked, because the directory \`${arg.raw}\` is relative to is unknown after the \`cd\` before it`,
    };
  return { kind: "path", path, how, tool };
}

// Options and operands the way getopt reads them: `--` ends options, and a lone `-` is an operand.
export function operands(args: Arg[], valued: Set<string> = new Set()): { flags: string[]; rest: Arg[] } {
  const flags: string[] = [];
  const rest: Arg[] = [];
  let ended = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as Arg;
    const value = arg.value;
    if (ended || typeof value !== "string" || !value.startsWith("-") || value === "-") rest.push(arg);
    else if (value === "--") ended = true;
    else {
      flags.push(value);
      if (valued.has(value)) flags.push(args[++i]?.value ?? "");
    }
  }
  return { flags, rest };
}

export const hasShort = (flags: string[], letters: RegExp): boolean =>
  flags.some((flag) => /^-[^-]/.test(flag) && letters.test(flag.slice(1)));
