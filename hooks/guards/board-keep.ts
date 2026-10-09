import { armed } from "../../lib/hook/guard.ts"
import { deny, payload, record, str } from "../../lib/hook/io.ts"
import { Board, Transcript } from "../../lib/hook/transcript.ts"
import { head, pyStr, quote } from "../../lib/text.ts"

if (armed()) {
  try {
    const data = payload()
    const args = record(data?.tool_input)
    if (data && data.tool_name === "TaskUpdate" && args.status === "deleted") {
      const taskId = pyStr(args.taskId)
      const entries = Transcript.read(str(data.transcript_path))
      const target = Board.load(str(data.session_id), entries).find((task) => pyStr(task.id) === taskId)
      if (target && target.status === "completed") {
        deny(
          `#${taskId} is completed, and a completed task is the receipt that the work happened — it stays on ` +
            "the board. Dropping a pending item that stopped mattering is fine; erasing a finished one " +
            `rewrites the record. Subject: ${quote(head(str(target.subject), 80))}`,
        )
      }
    }
  } catch {}
}
