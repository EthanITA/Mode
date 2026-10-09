import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { armed } from "../../lib/hook/guard.ts"
import { blockTask, isRecord, payload, str } from "../../lib/hook/io.ts"
import { Board, Subject } from "../../lib/hook/transcript.ts"
import { lstrip, pyJson, pyStr, quote } from "../../lib/text.ts"

if (armed()) {
  try {
    const data = payload()
    if (data) {
      const subject = str(data.task_subject)
      const match = Subject.match(subject)
      if (!match) {
        blockTask(
          `Task subject ${quote(subject)} has no category. Every board item declares what has to happen for it to ` +
            "move — not who it is assigned to, which is the owner field's job. Re-create it as " +
            `"[AI] ${subject}" if you can move it yourself right now, "[USER] ${subject}" if it needs the user to ` +
            "decide or to do something himself (including a task you own but are stalled on him for), " +
            `or "[WAIT] ${subject}" if it is blocked on a third party such as CI, a review or an approval. ` +
            "The id is stamped automatically once the category is there.",
        )
      } else {
        // TaskCreate assigns the id too late for the subject; stamping here closes the id-less window.
        const taskId = data.task_id ? pyStr(data.task_id) : ""
        const stamped = Subject.standardPrefix((match[1] ?? "").toUpperCase(), taskId) + lstrip(subject.slice(match[0].length))
        const path = Board.taskPath(str(data.session_id), taskId)
        const task: unknown = taskId && subject !== stamped && existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined
        if (isRecord(task)) writeFileSync(path, pyJson({ ...task, subject: stamped }, true, 2))
      }
    }
  } catch {}
}
