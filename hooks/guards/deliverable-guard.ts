import { tmpdir } from "node:os";
import { gitCalls } from "../../lib/hook/git.ts";
import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str, type Payload } from "../../lib/hook/io.ts";
import { deliverableCommand } from "../../lib/mode/deliverable.ts";
import { resolveDir } from "../../lib/mode/paths.ts";

type Act = [verb: string, path: string];

const EDITS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// Scratch space is where probes and helper scripts live, and none of it is a deliverable.
const SCRATCH = [...new Set([tmpdir(), "/tmp"].map((dir) => resolveDir(dir) + "/"))];
const JOB_TMP = /\/\.claude\/jobs\/[^/]+\/tmp\//;
const MR_SHELL = /\b(?:glab\s+mr\s+create|gh\s+pr\s+create)\b/;
const PUBLISH_SHELL = /\b(?:(?:npm|pnpm|yarn|bun)\s+publish|publish:artifact)\b/;
const POST_SHELL = /\b(?:glab\s+mr\s+note|gh\s+(?:pr\s+(?:comment|review)|issue\s+(?:comment|create)))\b/;
const API_POST = /\b(?:glab|gh)\s+api\b.*\b(?:notes|discussions|comments)\b/;
const WRITES_BODY = /(?:-X\s*POST|--method\s+POST|--input\b|--field\b|--raw-field\b|\s-[fF]\s)/;
const STAMP_SHELL = /\bartifact\s+stamp\b/;
const POST_TOOL =
  /^mcp__.+__(?:send_message|reply|forward|addCommentToJiraIssue|createJiraIssue|createConfluencePage|createConfluenceFooterComment|createConfluenceInlineComment|create_note|create_issue_note|create_merge_request_note)$/;
const MR_TOOL = /^mcp__.+__create_(?:merge_request|pull_request)$/;

function scratch(path: string): boolean {
  const real = resolveDir(path);
  return SCRATCH.some((dir) => real.startsWith(dir)) || JOB_TMP.test(real);
}

// Each delivery act this call performs, with the directory whose project decides how it ships.
function acts(data: Payload): Act[] {
  const tool = str(data.tool_name);
  const args = record(data.tool_input);
  const cwd = str(data.cwd) || process.cwd();
  if (EDITS.has(tool)) {
    const path = str(args.file_path) || str(args.notebook_path);
    return path && !scratch(path) ? [[path.includes("/artifacts/") ? "artifact" : "edit", path]] : [];
  }
  if (tool === "Agent") return args.name === "director" ? [["director", cwd]] : [];
  if (tool === "Bash") {
    const command = str(args.command);
    const out: Act[] = gitCalls(command, cwd).flatMap(({ repo, sub }): Act[] =>
      sub === "commit" || sub === "push" ? [[sub, repo]] : [],
    );
    if (MR_SHELL.test(command)) out.push(["mr", cwd]);
    if (PUBLISH_SHELL.test(command)) out.push(["publish", cwd]);
    if (POST_SHELL.test(command) || (API_POST.test(command) && WRITES_BODY.test(command))) out.push(["post", cwd]);
    if (STAMP_SHELL.test(command)) out.push(["artifact", cwd]);
    return out;
  }
  if (POST_TOOL.test(tool)) return [["post", cwd]];
  return MR_TOOL.test(tool) ? [["mr", cwd]] : [];
}

if (armed()) {
  try {
    const data = payload();
    // The lead's north star binds the lead; a teammate works to its own charter.
    if (data && !data.agent_id) {
      const session = str(data.session_id) || undefined;
      for (const [verb, path] of acts(data)) {
        const { text, code } = await deliverableCommand({ words: ["check", verb], path, session });
        if (code === 1 && text) {
          deny(`deliverable-guard: ${text}`);
          break;
        }
      }
    }
  } catch {}
}
