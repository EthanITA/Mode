import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { modeConfig } from "../mode/config.ts";
import { head, pyRepr, pyStr, strip } from "../text.ts";
import { isRecord, record, str, type Payload } from "./io.ts";

export type Verdict = ["met" | "unmet" | "error", string];

// Subjects that claim shipment must carry a checkable receipt even before metadata exists.
export const DELIVERY_SUBJECT = /\b(?:push(?:ed)?|merged?|mr\s*!?\d+|deploy(?:ed)?|publish(?:ed)?|release[ds]?)\b/i;
// Narrower than MUTATING_SHELL: only commands that put work in front of someone else.
export const DELIVERY_SHELL =
  /\b(?:git\s+push|glab\s+mr\s+(?:create|merge)|gh\s+pr\s+(?:create|merge)|publish:artifact)\b/;
// Any MCP server's merge-request or pull-request creator, whichever forge the user is on.
export const DELIVERY_TOOL = /^mcp__.+__(?:create|merge)_(?:merge_request|pull_request)$/;

// Warn until a quiet week proves the checks do not cry wolf, then DELIVER_MODE=deny.
export const DELIVER_MODE = process.env.DELIVER_MODE || "warn";

const expandHome = (path: string): string => (path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path);

function run(command: string[], timeoutSeconds = 30): [code: number, out: string, err: string] {
  const done = spawnSync(command[0] ?? "", command.slice(1), { encoding: "utf8", timeout: timeoutSeconds * 1000 });
  if (done.error) return [-1, "", done.error.message];
  return [done.status ?? -1, strip(done.stdout ?? ""), strip(done.stderr ?? "")];
}

// Ships empty: only the user knows which tree owes which receipt.
export function requiredKind(...hints: unknown[]): string | undefined {
  const rows = modeConfig().delivery;
  const required = (Array.isArray(rows) ? rows : []).map((row: unknown) => [
    pyStr((row as unknown[])[0]).toLowerCase(),
    pyStr((row as unknown[])[1]),
  ]);
  for (const hint of hints) {
    if (!hint) continue;
    const lowered = pyStr(hint).toLowerCase();
    const found = required.find(([tree]) => lowered.includes(tree ?? ""));
    if (found) return found[1];
  }
  return undefined;
}

function verifyMr(done: Payload): Verdict {
  const { project, iid } = done;
  if (!project || !iid) return ["unmet", "mr-merged needs project and iid in metadata.done"];
  const [code, out, err] = run([
    process.env.DELIVER_GLAB || "glab",
    "mr",
    "view",
    pyStr(iid),
    "-R",
    pyStr(project),
    "--output",
    "json",
  ]);
  if (code !== 0) return ["error", head(err || out || "glab failed", 200)];
  let state: unknown;
  try {
    state = record(JSON.parse(out)).state;
  } catch {
    return ["error", "glab printed non-JSON"];
  }
  return state === "merged" ? ["met", ""] : ["unmet", `MR !${pyStr(iid)} state is ${pyRepr(state)}, not merged`];
}

function verifyPushed(done: Payload): Verdict {
  const repo = expandHome(str(done.repo));
  if (run(["git", "-C", repo, "rev-parse", "--is-inside-work-tree"], 10)[0] !== 0)
    return ["unmet", `repo ${pyRepr(repo)} is not a git work tree`];
  let branch = done.branch;
  if (!branch) {
    const [code, out, err] = run(["git", "-C", repo, "rev-parse", "--abbrev-ref", "HEAD"]);
    if (code !== 0) return ["error", head(err, 200)];
    branch = out;
  }
  const [upCode, upstream] = run(["git", "-C", repo, "rev-parse", "--abbrev-ref", `${pyStr(branch)}@{upstream}`]);
  if (upCode !== 0) return ["unmet", `branch ${pyRepr(branch)} has no upstream — it was never pushed`];
  // Fetch first so "0 ahead" is measured against the real remote, not a stale local ref.
  const [fetchCode, , fetchErr] = run(["git", "-C", repo, "fetch", "-q"], 60);
  if (fetchCode !== 0) return ["error", `fetch failed: ${head(fetchErr, 200)}`];
  const [code, out, err] = run(["git", "-C", repo, "rev-list", "--count", `${upstream}..${pyStr(branch)}`]);
  if (code !== 0) return ["error", head(err, 200)];
  return out === "0" ? ["met", ""] : ["unmet", `${out} commit(s) on ${pyStr(branch)} not on ${upstream}`];
}

function verifyPublished(done: Payload): Verdict {
  const url = str(done.url);
  if (!url.startsWith("https://")) return ["unmet", "published needs an https url in metadata.done"];
  const [code, out, err] = run([
    process.env.DELIVER_CURL || "curl",
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    url,
  ]);
  if (code !== 0) return ["error", head(err || "curl failed", 200)];
  if (out !== "200") return ["unmet", `${url} answered ${out}`];
  const repo = expandHome(str(done.repo));
  if (repo) {
    const [statusCode, changed, statusErr] = run(["git", "-C", repo, "status", "--porcelain", str(done.topic) || "."]);
    if (statusCode !== 0) return ["error", head(statusErr, 200)];
    if (changed) return ["unmet", `durable copy has uncommitted changes in ${pyRepr(repo)}`];
  }
  return ["met", ""];
}

// "error" is infrastructure, and callers fail open on it so the fence never blocks on a broken network.
export function verify(done: unknown): Verdict {
  const receipt = isRecord(done) ? done : {};
  if (receipt.kind === "mr-merged") return verifyMr(receipt);
  if (receipt.kind === "pushed") return verifyPushed(receipt);
  if (receipt.kind === "published") return verifyPublished(receipt);
  return ["unmet", `unknown receipt kind ${pyRepr(receipt.kind)} — use mr-merged, pushed or published`];
}
