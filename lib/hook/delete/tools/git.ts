import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { absolute, type Arg, type Scope } from "../scope.ts";
import { blind, type Victim } from "../victim.ts";

const GLOBAL_VALUED = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);

type Split = { flags: string[]; before: Arg[]; after: Arg[]; dash: boolean };

function split(args: Arg[], valued: Set<string>): Split {
  const out: Split = { flags: [], before: [], after: [], dash: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as Arg;
    const value = arg.value;
    if (out.dash) out.after.push(arg);
    else if (value === "--") out.dash = true;
    else if (typeof value === "string" && value.startsWith("-") && value !== "-") {
      out.flags.push(value);
      if (valued.has(value)) i++;
    } else out.before.push(arg);
  }
  return out;
}

const has = (flags: string[], long: string[], short?: RegExp): boolean =>
  flags.some((flag) => long.includes(flag) || (!!short && /^-[^-]/.test(flag) && short.test(flag.slice(1))));

const isCommit = (name: string, cwd: string): boolean =>
  spawnSync("git", ["-C", cwd, "rev-parse", "--verify", "--quiet", `${name}^{commit}`], { timeout: 5000 }).status === 0;

type Dirty = { specs: Arg[]; here: Scope & { cwd: string }; staged: boolean; tool: string };

function dirty({ specs, here, staged, tool }: Dirty): Victim[] {
  const hidden = specs.find((arg) => typeof arg.value !== "string");
  if (hidden) return [{ ...blind(tool, hidden, here), within: here.cwd }];
  return [{ kind: "dirty", cwd: here.cwd, specs: specs.map((arg) => arg.value ?? ""), staged, tool }];
}

function clean(rest: Arg[], here: Scope & { cwd: string }): Victim[] {
  const { cwd } = here;
  const { flags } = split(rest, new Set(["-e", "--exclude"]));
  if (!has(flags, ["--force"], /f/) || has(flags, ["--dry-run"], /n/) || has(flags, ["--interactive"], /i/)) return [];
  const hidden = rest.find((arg) => typeof arg.value !== "string");
  if (hidden) return [blind("git clean", hidden, here)];
  const kept = rest
    .map((arg) => arg.value ?? "")
    .filter((value) => !["--force", "--quiet"].includes(value))
    .map((value) => (/^-[^-]/.test(value) ? value.replace(/[fq]/g, "") : value))
    .filter((value) => value !== "-");
  const done = spawnSync("git", ["-C", cwd, "clean", "-n", ...kept], { encoding: "utf8", timeout: 10000 });
  if (done.status !== 0)
    return [
      {
        kind: "stop",
        tool: "git clean",
        why: `can't be checked, because \`git clean -n\` failed: ${done.stderr.trim()}`,
      },
    ];
  return done.stdout
    .split("\n")
    .map((line) => /^Would remove (.+)$/.exec(line)?.[1])
    .filter((path): path is string => !!path)
    .map((path) => ({
      kind: "path",
      path: resolve(cwd, path),
      how: path.endsWith("/") ? "tree" : "entry",
      tool: "git clean",
    }));
}

// The git subcommands that throw away working-tree content, each as the files it would take.
export function git(args: Arg[], scope: Scope): Victim[] {
  let cwd = scope.cwd;
  let i = 0;
  for (; i < args.length; i++) {
    const value = args[i]?.value;
    if (typeof value !== "string" || !value.startsWith("-")) break;
    if (!GLOBAL_VALUED.has(value)) continue;
    const next = args[++i]?.value;
    if (value === "-C") cwd = typeof next === "string" && cwd ? absolute(next, { ...scope, cwd }) : undefined;
  }
  const sub = args[i]?.value;
  const rest = args.slice(i + 1);
  if (!cwd) {
    const risky = ["reset", "checkout", "switch", "restore", "clean", "rm"];
    return sub && risky.includes(sub)
      ? [{ kind: "stop", tool: `git ${sub}`, why: "can't be checked, because the directory it runs in is unknown" }]
      : [];
  }

  const here = { ...scope, cwd };
  if (sub === "reset")
    return rest.some((arg) => arg.value === "--hard")
      ? dirty({ specs: [], here, staged: true, tool: "git reset --hard" })
      : [];
  if (sub === "switch")
    return has(split(rest, new Set()).flags, ["--force", "--discard-changes"], /f/)
      ? dirty({ specs: [], here, staged: true, tool: "git switch" })
      : [];
  if (sub === "clean") return clean(rest, here);
  if (sub === "rm") {
    const { flags, before, after } = split(rest, new Set());
    if (flags.includes("--cached") || !has(flags, ["--force"], /f/)) return [];
    return dirty({ specs: [...before, ...after], here, staged: true, tool: "git rm -f" });
  }
  if (sub === "restore") {
    const { flags, before, after } = split(rest, new Set(["-s", "--source"]));
    if (has(flags, ["--patch"], /p/)) return [];
    const staged = has(flags, ["--staged"], /S/);
    const worktree = has(flags, ["--worktree"], /W/) || !staged;
    if (worktree && flags.some((flag) => flag.startsWith("--pathspec-from-file")))
      return [{ kind: "stop", tool: "git restore", why: "can't be checked, because its paths come from a file" }];
    const specs = [...before, ...after];
    return worktree && specs.length ? dirty({ specs, here, staged, tool: "git restore" }) : [];
  }
  if (sub === "checkout") {
    const { flags, before, after, dash } = split(rest, new Set(["-b", "-B", "--orphan"]));
    if (has(flags, ["--patch"], /p/)) return [];
    const force = has(flags, ["--force"], /f/);
    const branching = has(flags, ["--orphan"], /[bB]/);
    let treeish: string | undefined;
    let specs: Arg[] = [];
    if (dash) {
      treeish = before[0]?.value;
      specs = after;
    } else if (before.length && !branching) {
      const first = before[0]?.value ?? "";
      if (first === "-" || isCommit(first, cwd)) {
        treeish = first;
        specs = before.slice(1);
      } else specs = before;
    }
    if (specs.length) return dirty({ specs, here, staged: !!treeish, tool: "git checkout" });
    return force ? dirty({ specs: [], here, staged: true, tool: "git checkout -f" }) : [];
  }
  return [];
}
