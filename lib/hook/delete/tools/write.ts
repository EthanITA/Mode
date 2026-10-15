import type { Arg, Scope } from "../scope.ts";
import { hasShort, operands, pathVictim, type Victim } from "../victim.ts";

const DISK = /^\/dev\/r?disk\d/;
const ERASE = /^(erase\w*|zeroDisk|randomDisk|secureErase|partitionDisk|reformat|deleteContainer|deleteVolume)$/;

const stop = (tool: string, why: string): Victim => ({ kind: "stop", tool, why });

export function tee(args: Arg[], scope: Scope): Victim[] {
  const { flags, rest } = operands(args);
  if (flags.includes("--append") || hasShort(flags, /a/)) return [];
  return rest.map((arg) => pathVictim(arg, scope, "entry", "tee"));
}

export function truncate(args: Arg[], scope: Scope): Victim[] {
  const { rest } = operands(args, new Set(["-s", "-r", "--size", "--reference"]));
  return rest.map((arg) => pathVictim(arg, scope, "entry", "truncate"));
}

export function dd(args: Arg[], scope: Scope): Victim[] {
  const out = args.find((arg) => arg.value?.startsWith("of=") || arg.raw.startsWith("of="));
  if (!out) return [];
  const value = out.value?.slice(3);
  if (value && DISK.test(value)) return [stop("dd", `would write straight onto the disk ${value}`)];
  return [pathVictim({ raw: out.raw.slice(3), value }, scope, "entry", "dd")];
}

export function disk(args: Arg[], _scope: Scope, name: string): Victim[] {
  if (name !== "diskutil") return [stop(name, "would format a volume")];
  const verbs = args.map((arg) => arg.value ?? "");
  return verbs.some((verb) => ERASE.test(verb)) ? [stop("diskutil", `would erase a disk (${verbs.join(" ")})`)] : [];
}
