import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gitCalls } from "../../lib/hook/git.ts";
import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str, type Payload } from "../../lib/hook/io.ts";
import { commands } from "../../lib/shell.ts";

const DIRECTOR = "director";
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun", "deno"]);
const QUERIES = new Set(["ls", "list", "why", "outdated", "view", "info", "show", "help", "-v", "--version"]);
const RUNNERS = new Set([
  "ava",
  "bazel",
  "biome",
  "bunx",
  "cmake",
  "cypress",
  "docker-compose",
  "esbuild",
  "eslint",
  "gradle",
  "gradlew",
  "jest",
  "make",
  "mocha",
  "mvn",
  "mvnw",
  "mypy",
  "next",
  "ninja",
  "nose2",
  "nox",
  "npx",
  "nuxi",
  "nuxt",
  "nx",
  "phpunit",
  "playwright",
  "pnpx",
  "prettier",
  "py.test",
  "pyright",
  "pytest",
  "rollup",
  "rspec",
  "ruff",
  "stylelint",
  "swiftlint",
  "tox",
  "tsc",
  "turbo",
  "uvx",
  "vite",
  "vitest",
  "vue-tsc",
  "webpack",
  "xcodebuild",
]);
const VERBS: Record<string, Set<string>> = {
  cargo: new Set(["bench", "build", "check", "clippy", "run", "test"]),
  docker: new Set(["build", "compose", "run"]),
  dotnet: new Set(["build", "publish", "run", "test"]),
  go: new Set(["build", "generate", "run", "test", "vet"]),
  poetry: new Set(["build", "install", "run"]),
  swift: new Set(["build", "run", "test"]),
  uv: new Set(["build", "run", "sync"]),
};
const PYTHON_MODULES = new Set(["build", "mypy", "pyright", "pytest", "tox", "unittest"]);
const NODE_RUNS = new Set(["--run", "--test", "--watch"]);
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
  agent: "The director never spawns agents. Read it yourself, or ask the lead in your verdict.",
  board: "The board is the lead's. Put the item in your reply and the lead boards it.",
  git: (sub: string): string =>
    `\`git ${sub}\` changes the repo, and the director never does. Read-only git such as status, diff, log and show stays yours.`,
  run: (what: string): string =>
    `\`${what}\` is a check or a job, and running it is the lead's, who owns the details and their verification. Judge the whole from the diff, the code and the output the lead sent, and ask for a missing run in your verdict.`,
};

const runs = ([head = "", ...args]: string[]): boolean => {
  const tool = head.split("/").pop() ?? "";
  if (PACKAGE_MANAGERS.has(tool)) return !QUERIES.has(args[0] ?? "help");
  if (tool === "node") return args.some((arg) => NODE_RUNS.has(arg));
  if (tool.startsWith("python")) return args[0] === "-m" && PYTHON_MODULES.has(args[1] ?? "");
  return RUNNERS.has(tool) || !!VERBS[tool]?.has(args.find((arg) => !arg.startsWith("-")) ?? "");
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
  const input = record(data.tool_input);
  const command = str(input.command);
  if (input.run_in_background === true) return REASONS.run("a background run");
  const run = commands(command).find(runs);
  if (run) return REASONS.run(run.slice(0, 2).join(" "));
  const call = gitCalls(command, str(data.cwd) || process.cwd()).find(({ sub, rest }) => writes(sub, rest));
  return call ? REASONS.git(call.sub) : undefined;
}

if (armed()) {
  try {
    const data = payload();
    const reason = data ? verdict(data) : undefined;
    if (reason) deny(`director-guard: ${reason}`);
  } catch {}
}
