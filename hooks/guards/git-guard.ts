import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { gitCalls, joinPath, type GitCall } from "../../lib/hook/git.ts";
import { armed } from "../../lib/hook/guard.ts";
import { deny, isRecord, payload, record, str } from "../../lib/hook/io.ts";
import { Transcript } from "../../lib/hook/transcript.ts";
import { resolveDir } from "../../lib/mode/paths.ts";
import { strip } from "../../lib/text.ts";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// Discarding work is delete-guard's; this one stops a branch switch carrying someone else's edits along.
const risky = ({ sub, rest }: GitCall): boolean => sub === "switch" || (sub === "checkout" && !rest.includes("--"));

function git(repo: string, ...args: string[]): string | undefined {
  const done = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout: 10000 });
  if (done.error) throw done.error;
  return done.status === 0 ? done.stdout : undefined;
}

function owned(transcript: string): Set<string> {
  const paths = new Set<string>();
  for (const entry of Transcript.read(transcript)) {
    const content = Transcript.contentOf(entry);
    for (const item of Array.isArray(content) ? content : []) {
      if (!isRecord(item) || item.type !== "tool_use" || !WRITE_TOOLS.has(str(item.name))) continue;
      const path = str(record(item.input).file_path);
      if (path) paths.add(resolveDir(path));
    }
  }
  return paths;
}

function foreign({ repo }: GitCall, mine: Set<string>): string[] {
  const top = strip(git(repo, "rev-parse", "--show-toplevel") ?? "");
  const changed = top ? git(repo, "diff", "--name-only", "HEAD") : undefined;
  if (!changed) return [];
  return changed
    .split("\n")
    .filter(Boolean)
    .map((path) => resolveDir(joinPath(top, path)))
    .filter((path) => !mine.has(path))
    .map((path) => relative(top, path));
}

if (armed()) {
  try {
    const data = payload();
    if (data && data.tool_name === "Bash") {
      const calls = gitCalls(str(record(data.tool_input).command), str(data.cwd) || process.cwd()).filter(risky);
      const mine = calls.length ? owned(str(data.transcript_path)) : new Set<string>();
      for (const call of calls) {
        const theirs = foreign(call, mine);
        if (!theirs.length) continue;
        const shown = theirs.slice(0, 5).join(", ") + (theirs.length > 5 ? ` and ${theirs.length - 5} more` : "");
        deny(
          `git-guard — \`git ${call.sub}\` in ${call.repo} would carry uncommitted changes this session ` +
            `did not make: ${shown}.\n\nThe rule this guard enforces: a checkout can hold someone ` +
            "else's work in progress, and `git switch` or `git checkout` carries it onto another branch. Park it first " +
            'with `git stash push -u -m "<whose work, why parked>"` and pop it back when you are ' +
            "done, or ask the user. Do not narrate the block.",
        );
        break;
      }
    }
  } catch {}
}
