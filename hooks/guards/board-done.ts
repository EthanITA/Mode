import { DELIVERY_SHELL, DELIVERY_TOOL, verify } from "../../lib/hook/deliver.ts";
import { armed } from "../../lib/hook/guard.ts";
import { isRecord, payload, record, str, zap, type Payload } from "../../lib/hook/io.ts";
import { Board, Transcript, Turns } from "../../lib/hook/transcript.ts";
import { head, pyStr, pyTruthy, strip } from "../../lib/text.ts";

type Nudge = [text: string, message: string];

function nudge(data: Payload): Nudge | undefined {
  const entries = Transcript.read(str(data.transcript_path));
  if (Transcript.alreadyZapped(entries, "board-done")) return undefined;
  // The sweep audits only the "conversation is done" claim; a board with open items is still in flight.
  const tasks = Board.store(str(data.session_id));
  if (!tasks.length || tasks.some((task) => task.status !== "completed")) return undefined;

  const calls = Turns.calls(entries).flat();
  const shipped = [
    ...calls
      .filter(([name, args]) => name === "Bash" && DELIVERY_SHELL.test(str(args.command)))
      .map(([, args]) => str(args.command)),
    ...calls.filter(([name]) => DELIVERY_TOOL.test(name)).map(([name]) => name),
  ];
  const declared = tasks.filter((task) => pyTruthy(record(task.metadata).done));
  if (!shipped.length && !declared.length) return undefined;

  for (const task of declared) {
    const done = record(task.metadata).done;
    if (!isRecord(done)) throw new TypeError("metadata.done is not an object");
    const [verdict, detail] = verify(done);
    // An "error" verdict is infrastructure, and the fence never blocks on a broken network.
    if (verdict === "unmet") {
      return [
        `The board reads all-ticked — the conversation-done claim — but #${pyStr(task.id)}'s delivery receipt fails: ${detail}. ` +
          "Re-open it with TaskUpdate (status in_progress) and finish the delivery, or correct the receipt.",
        `board-done: board says done but #${pyStr(task.id)}'s receipt fails — re-opening.`,
      ];
    }
  }

  if (shipped.length && !declared.length) {
    const sample = [...new Set(shipped.map((command) => head(strip(command), 60)))].sort().slice(0, 3).join("; ");
    return [
      `Delivery work ran this session (${sample}) but no board item declares a delivery receipt, so the all-ticked ` +
        "board asserts done without proof. Add the delivery item with its metadata.done receipt " +
        "(mr-merged / pushed / published per the project's Definition of done), verify it, then tick.",
      "board-done: delivery ran with no receipt on the board — adding it.",
    ];
  }
  return undefined;
}

if (armed()) {
  try {
    const data = payload();
    const found = data && !data.stop_hook_active ? nudge(data) : undefined;
    if (found) zap(...found);
  } catch {}
}
