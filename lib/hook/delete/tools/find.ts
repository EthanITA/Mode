import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { absolute, type Arg, type Scope } from "../scope.ts";
import { blind, type Victim } from "../victim.ts";

const REMOVERS = new Set(["rm", "unlink", "shred", "srm", "rimraf"]);
const PREFIXES = new Set(["sudo", "env", "command", "nice", "nohup"]);
const SILENCED = new Set(["-print", "-print0", "-ls"]);
const SILENCED_WITH_ARG = new Set(["-printf", "-fprint", "-fprint0", "-fls"]);
const MAX_MATCHES = 20000;

// The Bash tool's `find` is Claude Code's bundled bfs, so list matches with the same binary the command would run.
function list(argv: string[], cwd: string, scope: Scope): SpawnSyncReturns<string> {
  const options = { cwd, encoding: "utf8" as const, timeout: 5000, maxBuffer: 64 * 1024 * 1024 };
  const bundled = [scope.env.CLAUDE_CODE_EXECPATH, join(scope.home, ".local", "bin", "claude")].find(
    (path): path is string => !!path && existsSync(path),
  );
  if (bundled)
    return spawnSync(bundled, ["-S", "dfs", "-regextype", "findutils-default", ...argv], { ...options, argv0: "bfs" });
  return spawnSync("/usr/bin/find", argv, options);
}

export function find(args: Arg[], scope: Scope, name: string): Victim[] {
  let i = 0;
  const lead: string[] = [];
  while (i < args.length) {
    const value = args[i]?.value ?? "";
    if (/^-[HLPEXdsx]+$/.test(value) || /^-O\d$/.test(value)) lead.push(value);
    else if (value === "-D" || value === "-S") lead.push(value, args[++i]?.value ?? "");
    else break;
    i++;
  }
  const starts: Arg[] = [];
  for (; i < args.length; i++) {
    const value = args[i]?.value;
    if (typeof value === "string" && (/^[-(!)]/.test(value) || value === ",")) break;
    starts.push(args[i] as Arg);
  }

  const expression = args.slice(i);
  const listing: string[] = [];
  let destructive = false;
  let deletes = false;
  let recursive = false;
  for (let k = 0; k < expression.length; k++) {
    const token = expression[k]?.value ?? "";
    if (token === "-delete") {
      destructive = deletes = true;
      listing.push("-print0");
    } else if (/^-(exec|execdir|ok|okdir)$/.test(token)) {
      let end = k + 1;
      while (
        end < expression.length &&
        expression[end]?.value !== ";" &&
        !(expression[end]?.value === "+" && expression[end - 1]?.value === "{}")
      )
        end++;
      const command = expression.slice(k + 1, end).map((arg) => arg.value ?? "");
      const tool = basename(command.find((word) => !PREFIXES.has(basename(word)) && !word.includes("=")) ?? "");
      if (REMOVERS.has(tool)) {
        destructive = true;
        recursive ||= tool === "rimraf" || command.some((word) => /^-[^-]*[rR]/.test(word) || word === "--recursive");
        listing.push("-print0");
      } else listing.push("-true");
      k = end;
    } else if (SILENCED.has(token)) listing.push("-true");
    else if (SILENCED_WITH_ARG.has(token)) {
      listing.push("-true");
      k++;
    } else if (token === "-fprintf") {
      listing.push("-true");
      k += 2;
    } else listing.push(token);
  }
  if (!destructive) return [];

  const hidden = [...starts, ...expression].find((arg) => typeof arg.value !== "string");
  if (hidden) return [blind(name, hidden, scope)];
  if (!scope.cwd) return [{ kind: "stop", tool: name, why: "can't be checked, because its directory is unknown" }];
  const roots = starts.length ? starts.map((arg) => arg.value ?? "") : ["."];
  const depth = deletes && !listing.includes("-depth") ? ["-depth"] : [];
  const done = list([...lead, ...roots, ...depth, ...listing], scope.cwd, scope);
  const found = (done.stdout ?? "").split("\0").filter(Boolean);
  if (done.error || (done.status !== 0 && !found.length)) {
    const why = done.error?.message ?? (done.stderr ?? "").split("\n")[0] ?? "";
    return [
      {
        kind: "stop",
        tool: name,
        why: `can't be checked, because listing what it would delete failed (${why.trim()}). Narrow it until a dry listing works`,
      },
    ];
  }
  if (found.length > MAX_MATCHES)
    return [{ kind: "stop", tool: name, why: `would delete more than ${MAX_MATCHES} paths. Narrow it` }];
  return found.map((path) => ({
    kind: "path",
    path: absolute(path, scope) ?? path,
    how: recursive ? "tree" : "entry",
    tool: name,
  }));
}
