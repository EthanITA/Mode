import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gitCalls } from "../../lib/hook/git.ts";
import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str, type Payload } from "../../lib/hook/io.ts";

const DIRECTOR = "director";
// A teammate's id carries its name, and a second spawn under the same name gains a counter.
const TEAMMATE_ID = /^a(.+?)(?:-\d+)?-[0-9a-f]+$/;
const GIT_WRITES = new Set([
  "add",
  "am",
  "apply",
  "checkout",
  "cherry-pick",
  "clean",
  "commit",
  "merge",
  "mv",
  "pull",
  "push",
  "rebase",
  "reset",
  "restore",
  "revert",
  "rm",
  "stash",
  "switch",
  "tag",
  "worktree",
]);
const GIT_READS_OF_WRITE_VERBS = new Set(["stash list", "stash show"]);
const BRANCH_WRITES = new Set([
  "-d",
  "-D",
  "--delete",
  "-m",
  "-M",
  "--move",
  "-c",
  "-C",
  "--copy",
  "-f",
  "--force",
  "-u",
  "--set-upstream-to",
  "--unset-upstream",
  "--edit-description",
]);

const REASONS = {
  write: "The director reviews and decides, and never writes. Put the change in your verdict and the lead makes it.",
  agent: "The director never spawns agents. Check it yourself with Read and Bash, or ask the lead in your verdict.",
  board: "The board is the lead's. Put the item in your reply and the lead boards it.",
  git: (sub: string): string =>
    `\`git ${sub}\` changes the repo, and the director never does. Read-only git such as status, diff, log and show stays yours.`,
};

function writes(sub: string, rest: string[]): boolean {
  // A bare first argument creates a branch, while flags alone only list them.
  if (sub === "branch")
    return !!rest.length && (!rest[0]?.startsWith("-") || rest.some((arg) => BRANCH_WRITES.has(arg)));
  return GIT_WRITES.has(sub) && !GIT_READS_OF_WRITE_VERBS.has(`${sub} ${rest[0] ?? ""}`);
}

// The name the agent was spawned under, read from the meta file Claude Code keeps beside the transcript.
function agentName(data: Payload): string {
  const agent = str(data.agent_id);
  if (!agent) return "";
  const base = str(data.transcript_path).replace(/\.[^./]*$/, "");
  let meta: unknown;
  try {
    meta = JSON.parse(readFileSync(join(base, "subagents", `agent-${agent}.meta.json`), "utf8"));
  } catch {
    return TEAMMATE_ID.exec(agent)?.[1] ?? "";
  }
  if (typeof meta !== "object" || !meta || Array.isArray(meta)) throw new TypeError("agent meta is not an object");
  const { name } = meta as { name?: unknown };
  return name ? String(name) : "";
}

function verdict(data: Payload): string | undefined {
  if (agentName(data) !== DIRECTOR) return undefined;
  const tool = str(data.tool_name);
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) return REASONS.write;
  if (tool === "Agent") return REASONS.agent;
  if (tool === "TaskCreate" || tool === "TaskUpdate") return REASONS.board;
  if (tool !== "Bash") return undefined;
  const call = gitCalls(str(record(data.tool_input).command), str(data.cwd) || process.cwd()).find(({ sub, rest }) =>
    writes(sub, rest),
  );
  return call ? REASONS.git(call.sub) : undefined;
}

if (armed()) {
  try {
    const data = payload();
    const reason = data ? verdict(data) : undefined;
    if (reason) deny(`director-guard: ${reason}`);
  } catch {}
}
