import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";

export const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MODE = join(PLUGIN, "bin", "mode");
export const ARTIFACT = join(PLUGIN, "bin", "artifact");

// A suite never calls the network, and never reads the session or plugin the test runner itself sits in.
process.env.MODE_JEV = "off";
for (const key of [
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_PLUGIN_ROOT",
  "MODE_PLUGIN_ROOT",
  "NOTES_MODES",
  "NOTES_DIR",
  "NOTES_ARTIFACTS",
])
  delete process.env[key];

export type Run = SpawnSyncReturns<string>;
export type Env = NodeJS.ProcessEnv;

export function scratch(prefix = "mode-test-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function write(path: string, text: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

export type Contracts = Record<string, string>;
export type Fixture = { modes?: Contracts; styles?: Contracts; rules?: Contracts; manual?: string };

// Fixture names differ from the shipped ones, so a test cannot pass by reading the live folder.
export function fixtureRoot(root: string, { modes = {}, styles = {}, rules = {}, manual }: Fixture): string {
  const folders: [string, Contracts][] = [
    ["modes", modes],
    ["styles", styles],
    ["rules", rules],
  ];
  for (const [folder, contracts] of folders) {
    mkdirSync(join(root, "skills", "mode", folder), { recursive: true });
    for (const [stem, text] of Object.entries(contracts))
      write(join(root, "skills", "mode", folder, `${stem}.md`), text);
  }
  if (manual) write(join(root, "skills", "mode", "MANUAL.md"), manual);
  return root;
}

export type ContractShape = {
  name: string;
  color?: string;
  exitWhen?: string;
  keys?: string;
  body?: string;
  reminder?: string;
};

export function contract({
  name,
  color = "blue",
  exitWhen = "manual",
  keys = "",
  body = "Body.",
  reminder = "Hold the line.",
}: ContractShape): string {
  return `---\nname: ${name}\nsummary: a fixture\ncolor: ${color}\nexit-when: ${exitWhen}\n${keys}---\n\n${body}\n\n## Standing reminder\n\n${reminder}\n`;
}

export function env(extra: Env = {}): Env {
  return { ...process.env, ...extra };
}

export function run(
  command: string,
  args: string[],
  { input = "", env: vars = process.env }: { input?: string; env?: Env } = {},
): Run {
  return spawnSync(command, args, { input, env: vars, encoding: "utf8" });
}

export function fire(hook: string, payload: unknown, vars: Env): Run {
  return run("sh", [join(PLUGIN, "hooks", "run"), hook], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: vars,
  });
}

export type HookOutput = {
  decision?: string;
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
    suppressOriginalPrompt?: boolean;
  };
};

export function output(done: Run): HookOutput {
  return done.stdout.trim() ? (JSON.parse(done.stdout) as HookOutput) : {};
}

export const denial = (done: Run): string | undefined =>
  output(done).hookSpecificOutput?.permissionDecision === "deny"
    ? (output(done).hookSpecificOutput?.permissionDecisionReason ?? "")
    : undefined;
export const contextOf = (done: Run): string => output(done).hookSpecificOutput?.additionalContext ?? "";
export const silent = (done: Run): boolean => done.status === 0 && !done.stdout.trim();

const NODE_FRAME = /^\s+at .+:\d+:\d+\)?$/m;
export const crashed = (done: Run): boolean => NODE_FRAME.test(done.stderr);

export type Line = { type: string; message?: unknown; [key: string]: unknown };

export const user = (text: string): Line => ({ type: "user", message: { role: "user", content: text } });
export const said = (text: string): Line => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
export const used = (
  name: string,
  input: object,
  id = `t-${name}-${Math.random().toString(36).slice(2, 8)}`,
): Line => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", id, name, input }] },
});
export const answered = (id: string, content: unknown): Line => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: id, content }] },
});

export function transcript(dir: string, lines: Line[]): string {
  return write(
    join(dir, `t-${Math.random().toString(36).slice(2, 10)}.jsonl`),
    lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
  );
}
