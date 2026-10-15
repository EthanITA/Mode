import type { Arg, Scope } from "../scope.ts";
import { hasShort, operands, pathVictim, type Victim } from "../victim.ts";

const SHRED_VALUED = new Set(["-n", "-s", "--iterations", "--size", "--random-source"]);

export function rm(args: Arg[], scope: Scope, name: string): Victim[] {
  const { flags, rest } = operands(args, name === "shred" ? SHRED_VALUED : undefined);
  const recursive = name === "rimraf" || flags.includes("--recursive") || hasShort(flags, /[rR]/);
  return rest.map((arg) => pathVictim(arg, scope, recursive ? "tree" : "entry", name));
}
