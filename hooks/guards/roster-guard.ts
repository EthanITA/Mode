import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str, type Payload } from "../../lib/hook/io.ts";
import { Board, Transcript, type Task } from "../../lib/hook/transcript.ts";
import { held } from "../../lib/mode/state.ts";
import { head, pyStr, quote, strip } from "../../lib/text.ts";

type Owner = { task: Task; name: string; files: string[]; meta: Payload };

// Board items carrying a files list are the roster; everything else on the board is ordinary work.
function owners(board: Task[]): Owner[] {
  return board.flatMap((task) => {
    const meta = record(task.metadata);
    const raw = meta.files;
    const files = typeof raw === "string" ? raw.split(",").map(strip) : Array.isArray(raw) ? raw.map(String) : [];
    if (!files.length) return [];
    return [{ task, name: str(meta.owner) || str(task.owner), files: files.filter(Boolean), meta }];
  });
}

function verdict(data: Payload): string | undefined {
  const args = record(data.tool_input);
  const name = strip(str(args.name));
  const charter = str(args.prompt);
  const roster = owners(Board.load(str(data.session_id), Transcript.read(str(data.transcript_path))));
  if (!name) {
    return "Every owner is named, because the board is the roster and an owner nobody can name is an owner nobody can route to. Pass `name` on the Agent call.";
  }
  const mine = roster.filter((owner) => owner.name === name || str(owner.task.owner) === name);
  const [chosen] = mine;
  if (!chosen) {
    const known = [...new Set(roster.map((owner) => owner.name).filter(Boolean))].sort().join(", ") || "nobody yet";
    return (
      `${quote(name)} is not on the board, so there is no record of what it owns and the file test cannot be ` +
      `applied. Create its board item first, carrying metadata {"owner": ${quote(name)}, "files": [...]} ` +
      `with the paths it holds, then spawn it. On the roster now: ${known}.`
    );
  }
  const clash = roster.flatMap((other) =>
    other.task.id === chosen.task.id || pyStr(other.task.status) === "completed"
      ? []
      : chosen.files
          .filter((path) => other.files.includes(path))
          .map((path) => [other.name || head(str(other.task.subject), 40), path]),
  );
  if (clash.length) {
    const lines = clash
      .slice(0, 6)
      .map(([who, path]) => `  ${who} also holds ${path}`)
      .join("\n");
    return (
      `Two owners would write the same file, which is the failure that ruins a fleet.\n${lines}\n` +
      "They are one domain: merge them and let the survivor inherit it, or narrow the paths so the two sets do not touch."
    );
  }
  const missing = chosen.files.filter((path) => !charter.includes(path));
  if (missing.length) {
    return (
      `The charter never names ${missing.slice(0, 4).join(", ")}, so this agent starts cold without knowing what it owns. A ` +
      "charter carries the working directory, the files it owns by path, the files that are not " +
      "its to touch, the contract it builds against and how to report back."
    );
  }
  const notes = chosen.meta.notes;
  if (notes && !charter.includes(head(pyStr(notes), 60))) {
    return (
      "This domain has notes from the owner before it, and the charter does not carry them, so " +
      "the agent will re-derive what somebody already paid to learn. Splice them into the " +
      `charter. Recorded on #${pyStr(chosen.task.id)}: ${head(pyStr(notes), 400)}`
    );
  }
  if (!charter.includes("Domain notes")) {
    return (
      "The charter has no handback for what this agent learns. Ask it to close its report with a " +
      "`## Domain notes` section: the facts about these files that the next agent here would " +
      "otherwise work out again. That handback is the only way knowledge reaches the roster, " +
      "since the router never reads the code itself."
    );
  }
  return undefined;
}

if (armed()) {
  try {
    const data = payload();
    if (data && data.tool_name === "Agent" && held("mode", str(data.session_id) || undefined) === "swarm") {
      const reason = verdict(data);
      if (reason) deny(reason);
    }
  } catch {}
}
