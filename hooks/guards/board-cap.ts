import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str } from "../../lib/hook/io.ts";
import { Board, Subject } from "../../lib/hook/transcript.ts";
import { pyStr } from "../../lib/text.ts";

// Three open USER items leave room for the work that can actually proceed.
const CAP = 3;

if (armed()) {
  try {
    const data = payload();
    const tool = str(data?.tool_name);
    const args = record(data?.tool_input);
    if (
      data &&
      (tool === "TaskCreate" || tool === "TaskUpdate") &&
      args.subject &&
      Subject.category({ subject: args.subject }) === "USER"
    ) {
      const taskId = tool === "TaskUpdate" ? pyStr(args.taskId) : "";
      const openUsers = Board.store(str(data.session_id)).filter(
        (task) =>
          !(taskId && pyStr(task.id) === taskId) &&
          (task.status === "pending" || task.status === "in_progress") &&
          Subject.category(task) === "USER",
      ).length;
      if (openUsers >= CAP) {
        deny(
          `There are already ${openUsers} open USER items, and the cap is ${CAP}. Fold this work into an item ` +
            "already open, or take the sensible default, proceed, and say so in the closing summary " +
            "instead of opening another USER item.",
        );
      }
    }
  } catch {}
}
