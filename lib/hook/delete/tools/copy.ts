import { lstatSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { absolute, type Arg, type Scope } from "../scope.ts";
import { blind, hasShort, operands, pathVictim, type Victim } from "../victim.ts";

const VALUED = new Set(["-t", "--target-directory", "-S", "--suffix"]);

const isDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const exists = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

const longFlag = (flags: string[], ...names: string[]): boolean =>
  flags.some((flag) => names.some((name) => flag === name || flag.startsWith(`${name}=`)));

// What a cp, mv or ln writes over: the destination, or the same name inside it when it is a directory.
export function copy(args: Arg[], scope: Scope, name: string): Victim[] {
  const { flags, rest } = operands(args, VALUED);
  const tool = name.replace(/^g(?=cp|mv|ln)/, "");
  const targetFlag = flags.findIndex((flag) => flag === "-t" || flag === "--target-directory");
  const inline = flags.find((flag) => flag.startsWith("--target-directory="));
  const destArg: Arg | undefined =
    targetFlag >= 0
      ? { raw: flags[targetFlag + 1] ?? "", value: flags[targetFlag + 1] }
      : inline
        ? { raw: inline, value: inline.split("=").slice(1).join("=") }
        : tool === "ln" && rest.length === 1
          ? { raw: ".", value: "." }
          : rest.pop();
  if (!destArg || !rest.length) return [];
  if (longFlag(flags, "--backup") || hasShort(flags, /b/)) return [];
  const sources =
    tool === "mv"
      ? rest.filter((arg) => typeof arg.value === "string").map((arg) => pathVictim(arg, scope, "move", tool))
      : [];
  const overwrites =
    tool === "ln"
      ? longFlag(flags, "--force") || hasShort(flags, /f/)
      : !(longFlag(flags, "--no-clobber") || hasShort(flags, /n/));
  if (!overwrites) return sources;
  if (typeof destArg.value !== "string") return [blind(tool, destArg, scope)];
  const dest = absolute(destArg.value, scope);
  if (!dest) return [pathVictim(destArg, scope, "entry", tool)];
  const keepsLink = tool === "ln" && (hasShort(flags, /[nh]/) || longFlag(flags, "--no-dereference"));
  const intoDir = !hasShort(flags, /T/) && !longFlag(flags, "--no-target-directory") && isDir(dest) && !keepsLink;
  const recursive = hasShort(flags, /[rRa]/) || longFlag(flags, "--recursive", "--archive");

  const victims: Victim[] = [...sources];
  for (const source of rest) {
    if (typeof source.value !== "string") {
      if (intoDir) victims.push(blind(tool, source, scope));
      continue;
    }
    const from = absolute(source.value, scope);
    if (!from) continue;
    const target = intoDir ? join(dest, basename(from)) : dest;
    if (tool === "cp" && isDir(from)) {
      if (!recursive) continue;
      const roots = intoDir && from.endsWith("/") ? [dest, target] : [target];
      for (const root of roots.filter(isDir))
        victims.push({ kind: "mirror", target: root, source: from, rules: [], prune: false, overwrite: true, tool });
    } else if (exists(target) && !(isDir(from) && isDir(target))) {
      victims.push({ kind: "path", path: target, how: "entry", tool });
    }
  }
  return victims;
}

export function ditto(args: Arg[], scope: Scope): Victim[] {
  const { rest } = operands(args, new Set(["--arch", "--bom", "-V", "--hfsCompression"]));
  const destArg = rest.pop();
  if (!destArg || !rest.length) return [];
  if (typeof destArg.value !== "string") return [blind("ditto", destArg, scope)];
  const dest = absolute(destArg.value, scope);
  if (!dest || !isDir(dest))
    return dest && exists(dest) ? [{ kind: "path", path: dest, how: "entry", tool: "ditto" }] : [];
  return rest.flatMap((source): Victim[] => {
    const from = typeof source.value === "string" ? absolute(source.value, scope) : undefined;
    if (!from) return [blind("ditto", source, scope)];
    return isDir(from)
      ? [{ kind: "mirror", target: dest, source: from, rules: [], prune: false, overwrite: true, tool: "ditto" }]
      : [{ kind: "path", path: join(dest, basename(from)), how: "entry", tool: "ditto" }];
  });
}
