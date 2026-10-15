import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configRoot, resolveDir } from "../../mode/paths.ts";
import { written } from "./owned.ts";
import { judge } from "./stake.ts";
import type { Victim } from "./victim.ts";
import { walk } from "./walk.ts";

export type Call = { command: string; cwd: string; session: string; transcript: string };

const RULE =
  "The rule this guard enforces: a shell command never destroys what this session doesn't own and git can't " +
  "bring back. $CLAUDE_JOB_DIR/tmp is yours to wipe. To drop files this session made through the shell, move them " +
  "into $CLAUDE_JOB_DIR/tmp/trash/ rather than deleting them, which keeps them recoverable; anything else, ask the " +
  "user. Do not narrate the block.";

// A background job's scratch space lives under the first eight characters of its session id.
function jobDir(session: string): string | undefined {
  const derived = session ? join(configRoot(), "jobs", session.slice(0, 8)) : "";
  const dir = derived && existsSync(derived) ? derived : process.env.CLAUDE_JOB_DIR;
  return dir ? resolveDir(dir) : undefined;
}

export function verdict({ command, cwd, session, transcript }: Call): string {
  const home = resolveDir(homedir());
  const job = jobDir(session);
  const env = { ...process.env, ...(job ? { CLAUDE_JOB_DIR: job } : {}) };
  const victims: Victim[] = walk(command, { cwd: resolveDir(cwd), vars: new Map(), env, home }, []);
  if (!victims.length) return "";
  let mine: Set<string> | undefined;
  const findings = judge(victims, {
    home,
    config: resolveDir(configRoot()),
    job,
    owned: () => (mine ??= written(transcript, session)),
  });
  return findings.length ? `${findings.join(".\n\n")}.\n\n${RULE}` : "";
}
