import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { gitCalls, joinPath, type GitCall } from "../../lib/hook/git.ts";
import { armed } from "../../lib/hook/guard.ts";
import { deny, isRecord, payload, record, str } from "../../lib/hook/io.ts";
import { Transcript } from "../../lib/hook/transcript.ts";
import { resolveDir } from "../../lib/mode/paths.ts";
import { strip } from "../../lib/text.ts";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

const risky = ({ sub, rest }: GitCall): boolean =>
  sub === "switch" || sub === "checkout" || (sub === "reset" && rest.includes("--hard"));

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

function foreign({ repo, rest }: GitCall, mine: Set<string>): string[] {
  const top = strip(git(repo, "rev-parse", "--show-toplevel") ?? "");
  const changed = top ? git(repo, "diff", "--name-only", "HEAD") : undefined;
  if (!changed) return [];
  let paths = changed
    .split("\n")
    .filter(Boolean)
    .map((path) => resolveDir(joinPath(top, path)));
  // `checkout -- file` only touches the files it names, so edits elsewhere are not at stake.
  const dash = rest.indexOf("--");
  if (dash >= 0) {
    const named = new Set(rest.slice(dash + 1).map((path) => resolveDir(joinPath(repo, path))));
    paths = paths.filter((path) => named.has(path));
  }
  return paths.filter((path) => !mine.has(path)).map((path) => relative(top, path));
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
          `git-guard — \`git ${call.sub}\` in ${call.repo} would carry or discard uncommitted changes this session ` +
            `did not make: ${shown}.\n\nThe rule this guard enforces: a checkout can hold someone ` +
            "else's work in progress. `git switch` and `git checkout` carry it onto another " +
            "branch, and `git reset --hard` or `git checkout -- <file>` destroy it. Park it first " +
            'with `git stash push -u -m "<whose work, why parked>"` and pop it back when you are ' +
            "done, or ask the user. Do not narrate the block.",
        );
        break;
      }
    }
  } catch {}
}
