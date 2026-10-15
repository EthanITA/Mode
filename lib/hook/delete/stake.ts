import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { resolveDir } from "../../mode/paths.ts";
import { FRESH } from "./scope.ts";
import type { Rule, Victim } from "./victim.ts";

export type Context = { home: string; config: string; job?: string; owned: () => Set<string> };

type Entry = { xy: string; abs: string; dir: boolean };
type Loss = { entry: Entry; label: string };
type Repo = { root: string; entries: Entry[]; tracked?: string[] };

// Rebuilt by an install or a build, so losing them costs a rerun rather than work.
const REGENERABLE = new Set([
  "node_modules",
  ".nuxt",
  ".output",
  ".next",
  ".turbo",
  ".cache",
  ".vite",
  ".svelte-kit",
  ".parcel-cache",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".venv",
  ".DS_Store",
]);
const REGENERABLE_DIR = /[._-](dist|build|cache|output)$/i;
const REGENERABLE_FILE = /\.(pyc|log|tsbuildinfo)$/;
const ZONES = [
  "Documents",
  "Desktop",
  "Pictures",
  "Movies",
  "Music",
  "Library/Mobile Documents",
  "Library/CloudStorage",
];
const LINK_KEEPERS = new Set([
  "rm",
  "unlink",
  "shred",
  "srm",
  "rimraf",
  "mv",
  "ln",
  "find",
  "bfs",
  "gfind",
  "git clean",
]);
const DELETERS = new Set(["rm", "unlink", "shred", "srm", "rimraf", "find", "bfs", "gfind", "git clean"]);
const MASS = 50;
const SHOWN = 5;

const inside = (path: string, dir: string): boolean => path === dir || path.startsWith(dir === "/" ? "/" : `${dir}/`);

const present = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

const isDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

function same(a: string, b: string): boolean {
  try {
    const [left, right] = [statSync(a), statSync(b)];
    if (left.size !== right.size || left.size > 32 * 1024 * 1024) return false;
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

function globRegex(glob: string): RegExp {
  const body = glob
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${body}$`);
}

// rsync's filter rules, first match wins, applied to each directory on the way down as rsync walks it.
function excluded(rel: string, rules: Rule[]): boolean {
  const parts = rel.split("/");
  for (let k = 1; k <= parts.length && rules.length; k++) {
    const path = parts.slice(0, k).join("/");
    const rule = rules.find(({ pattern }) => {
      const body = pattern.replace(/^\/+|\/+$/g, "");
      if (!body) return false;
      const regex = globRegex(body);
      if (pattern.startsWith("/")) return regex.test(path);
      if (!body.includes("/")) return regex.test(basename(path));
      return path.split("/").some((_, i, all) => regex.test(all.slice(i).join("/")));
    });
    if (rule?.exclude) return true;
  }
  return false;
}

function parseStatus(out: string, root: string): Entry[] {
  const tokens = out.split("\0");
  const entries: Entry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    if (token.length < 4) continue;
    const xy = token.slice(0, 2);
    if (xy[0] === "R" || xy[0] === "C") i++;
    const rel = token.slice(3);
    entries.push({ xy, abs: join(root, rel), dir: rel.endsWith("/") });
  }
  return entries;
}

function regenerable(path: string): boolean {
  const parts = path.split("/");
  return (
    parts.some((part) => REGENERABLE.has(part) || REGENERABLE_DIR.test(part)) ||
    REGENERABLE_FILE.test(parts.at(-1) ?? "")
  );
}

// Why an entry's current bytes are gone for good once overwritten, or undefined when git or a rebuild brings them back.
function exposure({ xy, abs, dir }: Entry, root: string, staged: boolean): string | undefined {
  if (xy === "!!" || xy === "??") {
    if (dir && existsSync(join(abs, ".git"))) return "a separate git working tree";
    if (regenerable(relative(root, abs))) return undefined;
    return xy === "!!" ? "ignored" : "untracked";
  }
  const [x = " ", y = " "] = xy;
  if (y === "M" || y === "T") return "uncommitted";
  return staged && "MARCT".includes(x) ? "staged" : undefined;
}

function nestedRepo(dir: string): string | undefined {
  let level = [dir];
  let budget = 3000;
  for (let depth = 0; depth < 4 && level.length; depth++) {
    const next: string[] = [];
    for (const current of level) {
      if (--budget < 0) return undefined;
      let names: string[];
      try {
        names = readdirSync(current);
      } catch {
        continue;
      }
      if (names.includes(".git")) return current;
      for (const name of names)
        if (name !== "node_modules" && isDir(join(current, name)) && !lstatSync(join(current, name)).isSymbolicLink())
          next.push(join(current, name));
    }
    level = next;
  }
  return undefined;
}

// Each victim against what owns it: the filesystem's roots, other sessions, git's record, and this session's writes.
export function judge(victims: Victim[], ctx: Context): string[] {
  const findings: string[] = [];
  const jobs = join(ctx.config, "jobs");
  const tmp = ctx.job ? join(ctx.job, "tmp") : undefined;
  const tops = new Map<string, string | undefined>();
  const repos = new Map<string, Repo>();
  const zones: [string, string][] = [
    ...ZONES.map((zone): [string, string] => [join(ctx.home, zone), `your ${zone} folder`]),
    [ctx.config, "Claude Code's own data"],
  ];

  const mine = (path: string): boolean => path.startsWith(FRESH) || (!!tmp && inside(path, tmp));
  const owned = (path: string): boolean => ctx.owned().has(path);

  const toplevel = (dir: string): string | undefined => {
    if (!tops.has(dir)) {
      const done = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 10000 });
      tops.set(dir, done.status === 0 ? resolveDir(done.stdout.trim()) : undefined);
    }
    return tops.get(dir);
  };

  const repo = (root: string): Repo => {
    const known = repos.get(root);
    if (known) return known;
    const done = spawnSync(
      "git",
      ["-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching"],
      { encoding: "utf8", timeout: 15000, maxBuffer: 256 * 1024 * 1024 },
    );
    if (done.status !== 0) throw new Error(`git status failed in ${root}: ${done.stderr}`);
    const made = { root, entries: parseStatus(done.stdout, root) };
    repos.set(root, made);
    return made;
  };

  const tracked = (found: Repo): string[] => {
    if (!found.tracked) {
      const done = spawnSync("git", ["-C", found.root, "ls-files", "-z"], {
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 256 * 1024 * 1024,
      });
      found.tracked = done.stdout
        .split("\0")
        .filter(Boolean)
        .map((rel) => join(found.root, rel));
    }
    return found.tracked;
  };

  const rootLabel = (path: string): string | undefined => {
    if (path === "/") return "the root of the filesystem";
    if (path === ctx.home) return "your home folder";
    if (inside(ctx.home, path)) return "a folder holding your home folder";
    if (dirname(path) === ctx.home) return "a top-level item of your home folder";
    if (path.split("/").length <= 3 && !inside(path, ctx.home)) return "a top-level system folder";
    if (dirname(path) === ctx.config) return "part of Claude Code's own data";
    if (existsSync(join(path, ".git"))) return "a whole git working tree";
    return undefined;
  };

  const report = (tool: string, verb: string, root: string, lost: Loss[], whose: string): void => {
    if (!lost.length) return;
    const shown = lost
      .slice(0, SHOWN)
      .map(({ entry, label }) => `${relative(root, entry.abs) || "."} (${label})`)
      .join(", ");
    const more = lost.length > SHOWN ? ` and ${lost.length - SHOWN} more` : "";
    const count = `${lost.length} file${lost.length === 1 ? "" : "s"}`;
    findings.push(`\`${tool}\` would ${verb} ${count} in ${root} ${whose}: ${shown}${more}`);
  };
  const unrecoverable = "that git can't bring back and this session never wrote";

  const massive = (tool: string, at: string, count: number): void => {
    if (count > MASS)
      findings.push(
        `\`${tool}\` would delete ${count} tracked files under ${at}. Remove tracked files with \`git rm -r\`, ` +
          "which refuses anything uncommitted and leaves the removal staged where it shows",
      );
  };

  const elsewhere = (tool: string, at: string): boolean => {
    if (!inside(at, jobs)) return false;
    const own = !!ctx.job && inside(at, ctx.job);
    findings.push(
      `\`${tool}\` would touch ${at}, ${own ? "this session's own job state" : "another session's job folder"}`,
    );
    return true;
  };

  const path = (victim: Extract<Victim, { kind: "path" }>): void => {
    const { tool, how } = victim;
    if (victim.path.startsWith(FRESH)) return;
    const trimmed = victim.path.length > 1 ? victim.path.replace(/\/+$/, "") : victim.path;
    const follow = victim.path.endsWith("/") || !LINK_KEEPERS.has(tool);
    const at = follow ? resolveDir(trimmed) : join(resolveDir(dirname(trimmed)), basename(trimmed));
    if (!present(at) || mine(at)) return;
    const verb = how === "move" ? "move" : DELETERS.has(tool) ? "delete" : "overwrite";
    const label = rootLabel(at);
    if (label) return void findings.push(`\`${tool}\` would ${verb} ${at}, ${label}`);
    if (elsewhere(tool, at) || how === "move") return;
    if (!follow && lstatSync(at).isSymbolicLink()) return;
    if (/\/\.git(\/|$)/.test(at)) {
      if (how === "entry" && at.endsWith(".lock")) return;
      return void findings.push(`\`${tool}\` would ${verb} ${at}, inside git's own store`);
    }
    const root = toplevel(isDir(at) ? at : dirname(at));
    if (!root) {
      const zone = zones.find(([dir]) => inside(at, dir));
      // Scripts rebuild artifacts and state files under the config folder all day, so only wiping a tree there counts.
      const counts = zone && (how === "tree" || (zone[0] !== ctx.config && !owned(at)));
      if (zone && counts) findings.push(`\`${tool}\` would ${verb} ${at}, in ${zone[1]}`);
      const nested = how === "tree" && !zone ? nestedRepo(at) : undefined;
      if (nested) findings.push(`\`${tool}\` would ${verb} ${at}, which holds the git working tree ${nested}`);
      return;
    }
    const found = repo(root);
    const tree = how === "tree";
    const lost: Loss[] = [];
    for (const entry of found.entries) {
      const within = entry.abs === at || (tree && inside(entry.abs, at));
      const around = entry.dir && inside(at, entry.abs) && entry.abs !== at;
      if (!within && !around) continue;
      const label = exposure(entry, root, false);
      if (label && !owned(around ? at : entry.abs)) lost.push({ entry: around ? { ...entry, abs: at } : entry, label });
    }
    report(tool, verb, root, lost, unrecoverable);
    if (tree) massive(tool, at, tracked(found).filter((file) => inside(file, at)).length);
  };

  const mirror = (victim: Extract<Victim, { kind: "mirror" }>): void => {
    const { tool, source, rules, prune, overwrite } = victim;
    const at = resolveDir(victim.target.replace(/(.)\/+$/, "$1"));
    if (!present(at) || mine(at)) return;
    const label = rootLabel(at);
    const verb = prune ? "delete or overwrite" : "overwrite";
    if (label && (prune || !existsSync(join(at, ".git"))))
      return void findings.push(
        `\`${tool}\` would ${prune ? "mirror" : "copy"} ${source ?? "a remote source"} onto ${at}, ${label}`,
      );
    if (elsewhere(tool, at)) return;
    const root = toplevel(at);
    if (!root) {
      const zone = zones.find(([dir]) => inside(at, dir));
      if (zone && prune)
        findings.push(`\`${tool}\` would mirror ${source ?? "a remote source"} onto ${at}, in ${zone[1]}`);
      return;
    }
    const found = repo(root);
    const twin = (file: string): string | undefined => (source ? join(source, relative(at, file)) : undefined);
    const lost: Loss[] = [];
    for (const entry of found.entries) {
      const around = entry.dir && inside(at, entry.abs) && entry.abs !== at;
      if (!around && !inside(entry.abs, at)) continue;
      const label = exposure(entry, root, false);
      if (!label || excluded(relative(at, entry.abs), rules)) continue;
      const copy = around ? undefined : twin(entry.abs);
      if (copy && present(copy)) {
        if (!overwrite || entry.dir || same(entry.abs, copy)) continue;
      } else if (!prune) continue;
      if (!owned(entry.abs)) lost.push({ entry: around ? { ...entry, abs: at } : entry, label });
    }
    report(tool, verb, root, lost, unrecoverable);
    if (prune)
      massive(
        tool,
        at,
        tracked(found).filter((file) => {
          if (!inside(file, at) || excluded(relative(at, file), rules)) return false;
          const copy = twin(file);
          return !copy || !present(copy);
        }).length,
      );
  };

  const dirty = (victim: Extract<Victim, { kind: "dirty" }>): void => {
    const root = toplevel(victim.cwd);
    if (!root || mine(root)) return;
    const done = spawnSync(
      "git",
      ["-C", victim.cwd, "status", "--porcelain=v1", "-z", "--untracked-files=no", "--", ...victim.specs],
      { encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024 * 1024 },
    );
    if (done.status !== 0) {
      findings.push(`\`${victim.tool}\` can't be checked, because \`git status\` failed: ${done.stderr.trim()}`);
      return;
    }
    const lost = parseStatus(done.stdout, root)
      .map((entry) => ({ entry, label: exposure(entry, root, victim.staged) ?? "" }))
      .filter(({ entry, label }) => label && !owned(entry.abs));
    report(victim.tool, "discard changes to", root, lost, "that this session never made");
  };

  for (const victim of victims) {
    if (victim.kind === "stop") {
      if (!victim.within || !mine(resolveDir(victim.within))) findings.push(`\`${victim.tool}\` ${victim.why}`);
    } else if (victim.kind === "path") path(victim);
    else if (victim.kind === "mirror") mirror(victim);
    else dirty(victim);
  }
  return [...new Set(findings)];
}
