import type { Tool } from "../victim.ts";
import { copy, ditto } from "./copy.ts";
import { find } from "./find.ts";
import { git } from "./git.ts";
import { rm } from "./rm.ts";
import { rsync } from "./rsync.ts";
import { dd, disk, tee, truncate } from "./write.ts";

const TOOLS = new Map<string, Tool>([
  ["rm", rm],
  ["unlink", rm],
  ["shred", rm],
  ["srm", rm],
  ["rimraf", rm],
  ["cp", copy],
  ["gcp", copy],
  ["mv", copy],
  ["gmv", copy],
  ["ln", copy],
  ["gln", copy],
  ["ditto", ditto],
  ["rsync", rsync],
  ["find", find],
  ["gfind", find],
  ["bfs", find],
  ["git", git],
  ["tee", tee],
  ["truncate", truncate],
  ["dd", dd],
  ["diskutil", disk],
]);

export const REMOVERS = new Set(["rm", "unlink", "shred", "srm", "rimraf", "truncate"]);

export const toolFor = (name: string): Tool | undefined =>
  TOOLS.get(name) ?? (/^(newfs|mkfs)/.test(name) ? disk : undefined);
