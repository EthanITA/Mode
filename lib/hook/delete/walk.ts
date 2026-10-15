import { basename } from "node:path";
import { literal, parse, type Redirect, type Word } from "./parse.ts";
import { absolute, clone, expand, type Arg, type Scope } from "./scope.ts";
import { REMOVERS, toolFor } from "./tools/index.ts";
import { pathVictim, type Victim } from "./victim.ts";

const RESERVED = new Set(["!", "{", "}", "then", "do", "else", "elif", "if", "while", "until", "fi", "done", "esac"]);
const DECLARE = new Set(["export", "local", "declare", "typeset", "readonly"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const TRUNCATING = new Set([">", ">|", "&>", ">&"]);
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)\+?=/;
const DISK = /^\/dev\/r?disk\d/;
const RUNNERS = new Set(["pnpm", "yarn", "npm", "bun"]);
const MAX_DEPTH = 4;

// The value-taking options of each prefix command, so the command it runs is found behind them.
const WRAPPERS = new Map<string, { valued: string[]; positional?: number }>([
  ["sudo", { valued: ["-u", "-g", "-p", "-C", "-h", "-D", "-r", "-t", "-U", "-T"] }],
  ["doas", { valued: ["-u", "-C"] }],
  ["env", { valued: ["-u", "-P", "-S", "-C", "--unset", "--chdir"] }],
  ["nice", { valued: ["-n", "--adjustment"] }],
  ["nohup", { valued: [] }],
  ["time", { valued: [] }],
  ["command", { valued: [] }],
  ["builtin", { valued: [] }],
  ["exec", { valued: ["-a"] }],
  ["noglob", { valued: [] }],
  ["caffeinate", { valued: ["-t", "-w"] }],
  ["stdbuf", { valued: ["-i", "-o", "-e"] }],
  ["timeout", { valued: ["-s", "-k", "--signal", "--kill-after"], positional: 1 }],
  ["npx", { valued: ["-p", "--package", "-c", "--call"] }],
  ["pnpx", { valued: [] }],
  ["bunx", { valued: [] }],
  ["xargs", { valued: ["-n", "-L", "-P", "-s", "-E", "-e", "-I", "-J", "-d", "-a", "-R", "-S"] }],
]);

const firstText = (word: Word | undefined): string =>
  word?.[0]?.kind === "text" && !word[0].quoted ? word[0].text : "";

function unwrap(argv: Arg[]): { argv: Arg[]; chdir?: Arg; via: string[] } {
  let rest = argv;
  let chdir: Arg | undefined;
  const via: string[] = [];
  for (let round = 0; round < 8; round++) {
    const name = basename(rest[0]?.value ?? "");
    const runner = RUNNERS.has(name) && ["dlx", "exec", "x"].includes(rest[1]?.value ?? "");
    const wrapper = runner ? { valued: [], positional: 0 } : WRAPPERS.get(name);
    if (!wrapper) break;
    via.push(name);
    let i = runner ? 2 : 1;
    for (; i < rest.length; i++) {
      const value = rest[i]?.value ?? "";
      if (value === "--") {
        i++;
        break;
      }
      if (name === "env" && ASSIGNMENT.test(value)) continue;
      if (!value.startsWith("-") || value === "-") break;
      if (name === "env" && (value === "-C" || value === "--chdir")) chdir = rest[i + 1];
      if (name === "env" && value.startsWith("--chdir=")) chdir = { raw: value, value: value.slice(8) };
      if (wrapper.valued.includes(value)) i++;
    }
    rest = rest.slice(i + (wrapper.positional ?? 0));
  }
  return { argv: rest, chdir, via };
}

function assign(word: Word, scope: Scope): void {
  const [first, ...more] = word;
  const name = ASSIGNMENT.exec(firstText(word))?.[1];
  if (!name || first?.kind !== "text") return;
  const head = first.text.slice(first.text.indexOf("=") + 1);
  const [arg] = expand([{ ...first, text: head }, ...more], scope, { split: false });
  scope.vars.set(name, typeof arg?.value === "string" ? [arg.value] : undefined);
}

function redirect({ op, target }: Redirect, scope: Scope, out: Victim[]): void {
  if (!TRUNCATING.has(op)) return;
  for (const arg of expand(target, scope)) {
    const value = arg.value;
    if (op === ">&" && (value === "-" || /^\d+$/.test(value ?? ""))) continue;
    if (value?.startsWith("/dev/")) {
      if (DISK.test(value)) out.push({ kind: "stop", tool: op, why: `would write straight onto the disk ${value}` });
      continue;
    }
    out.push(pathVictim(arg, scope, "entry", op));
  }
}

function run(words: Word[], redirects: Redirect[], scope: Scope, out: Victim[], depth: number): void {
  for (const word of [...words, ...redirects.map((r) => r.target)])
    for (const part of word) if (part.kind === "sub") walk(part.script, clone(scope), out, depth + 1);
  for (const target of redirects) redirect(target, scope, out);

  const list = [...words];
  while (list.length && RESERVED.has(literal(list[0] as Word) ?? "")) list.shift();
  const head = list[0] ? literal(list[0]) : undefined;
  if (head === "for" || head === "select") {
    const name = literal(list[1] ?? []) ?? "";
    const values = literal(list[2] ?? []) === "in" ? list.slice(3).flatMap((word) => expand(word, scope)) : [];
    const seen = values.every((arg) => typeof arg.value === "string") && literal(list[2] ?? []) === "in";
    if (name) scope.vars.set(name, seen ? values.map((arg) => arg.value ?? "") : undefined);
    return;
  }
  if (head === "case") return;

  const prefix: Word[] = [];
  while (list.length && ASSIGNMENT.test(firstText(list[0]))) prefix.push(list.shift() as Word);
  if (!list.length || DECLARE.has(head ?? "")) {
    for (const word of list.length ? list.slice(1) : prefix) assign(word, scope);
    return;
  }

  const { argv, chdir, via } = unwrap(list.flatMap((word) => expand(word, scope)));
  const here = chdir ? { ...clone(scope), cwd: chdir.value ? absolute(chdir.value, scope) : undefined } : scope;
  const name = basename(argv[0]?.value ?? "");
  const args = argv.slice(1);
  if (!name) return;
  if (via.includes("xargs")) {
    if (REMOVERS.has(name))
      out.push({
        kind: "stop",
        tool: `xargs ${name}`,
        why: "can't be checked, because the paths come down the pipe. Pass them literally, or use `find … -delete`, which the guard can list",
      });
    return;
  }
  if (name === "cd" || name === "pushd") {
    const target = args.find((arg) => !arg.value?.startsWith("-") || arg.value === "-");
    if (!target) scope.cwd = scope.home;
    else if (typeof target.value !== "string" || target.value === "-") scope.cwd = undefined;
    else scope.cwd = absolute(target.value.replace(/(.)\/+$/, "$1"), scope)?.replace(/(.)\/$/, "$1");
    return;
  }
  if (name === "popd") scope.cwd = undefined;
  else if (name === "read" || name === "mapfile" || name === "readarray") {
    for (const arg of args) if (arg.value && !arg.value.startsWith("-")) scope.vars.set(arg.value, undefined);
  } else if (SHELLS.has(name)) {
    const flag = args.findIndex((arg) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg.value ?? ""));
    const body = flag >= 0 ? args[flag + 1]?.value : undefined;
    const inner = clone(here);
    args.slice(flag + 2).forEach((arg, n) => inner.vars.set(String(n), arg.value ? [arg.value] : undefined));
    if (body) walk(body, inner, out, depth + 1);
  } else if (name === "eval") {
    if (args.every((arg) => typeof arg.value === "string"))
      walk(args.map((arg) => arg.value).join(" "), here, out, depth + 1);
  } else out.push(...(toolFor(name)?.(args, here, name) ?? []));
}

// Every destructive effect of a command line, following cd, variables, subshells, loops and nested shells.
export function walk(script: string, scope: Scope, out: Victim[], depth = 0): Victim[] {
  if (depth > MAX_DEPTH) return out;
  const saved: Scope[] = [];
  let current = scope;
  for (const step of parse(script)) {
    if (step.kind === "open") {
      saved.push(current);
      current = clone(current);
    } else if (step.kind === "close") current = saved.pop() ?? current;
    else run(step.words, step.redirects, current, out, depth);
  }
  return out;
}
