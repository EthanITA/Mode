import { homedir } from "node:os";
import { commands } from "../shell.ts";

export type GitCall = { repo: string; sub: string; rest: string[] };

const expandHome = (path: string): string => (path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path);

// Python's os.path.join: an absolute part restarts the path, and nothing is normalised.
export function joinPath(base: string, part: string): string {
  if (part.startsWith("/") || !base) return part;
  return base.endsWith("/") ? base + part : `${base}/${part}`;
}

// Each git invocation with the directory it runs in, following `cd` and `-C` the way the shell would.
export function gitCalls(command: string, base: string): GitCall[] {
  let where = base;
  const calls: GitCall[] = [];
  for (const [head = "", ...args] of commands(command)) {
    if (head === "cd" && args.length) {
      where = joinPath(where, expandHome(args[0] ?? ""));
      continue;
    }
    if (head.split("/").pop() !== "git") continue;
    let here = where;
    let rest = args;
    while (rest[0]?.startsWith("-")) {
      if ((rest[0] === "-C" || rest[0] === "-c") && rest.length > 1) {
        if (rest[0] === "-C") here = joinPath(here, expandHome(rest[1] ?? ""));
        rest = rest.slice(2);
      } else {
        rest = rest.slice(1);
      }
    }
    if (rest.length) calls.push({ repo: here, sub: rest[0] ?? "", rest: rest.slice(1) });
  }
  return calls;
}
