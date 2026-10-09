import { DELIVER_MODE, DELIVERY_SUBJECT, requiredKind, verify } from "../../lib/hook/deliver.ts"
import { armed } from "../../lib/hook/guard.ts"
import { deny, isRecord, payload, record, str, systemMessage, type Payload } from "../../lib/hook/io.ts"
import { Board, Transcript } from "../../lib/hook/transcript.ts"
import { pyRepr, pyStr, pyTruthy } from "../../lib/text.ts"

// A refusal in deny mode, a visible warning otherwise; either way the first one found is the only one said.
function block(reason: string): void {
  if (DELIVER_MODE === "deny") deny(reason)
  else systemMessage(`⚡ board-deliver (warn): ${reason}`)
}

function check(data: Payload): void {
  const args = record(data.tool_input)
  if (data.tool_name !== "TaskUpdate" || args.status !== "completed") return
  const taskId = pyStr(args.taskId)
  const entries = Transcript.read(str(data.transcript_path))
  const task = Board.load(str(data.session_id), entries).find((one) => pyStr(one.id) === taskId)
  if (!task) return

  // The call's own metadata wins: a receipt may arrive in the same update that ticks.
  const fromCall = record(args.metadata).done
  const done = pyTruthy(fromCall) ? fromCall : record(task.metadata).done
  const subject = str(args.subject) || str(task.subject)
  if (!pyTruthy(done)) {
    if (DELIVERY_SUBJECT.test(subject)) {
      block(
        `#${taskId} reads as a delivery item but declares no receipt — put {done: {kind: mr-merged|pushed|published, …}} ` +
          "in its metadata so the bar is checkable against the project's Definition of done, then tick.",
      )
    }
    return
  }
  if (!isRecord(done)) return
  const demanded = requiredKind(done.repo, done.project, done.url, data.cwd)
  if (demanded && done.kind !== demanded) {
    return block(`#${taskId} declares receipt kind ${pyRepr(done.kind)} but this tree's Definition of done demands ${pyRepr(demanded)}.`)
  }
  const [verdict, detail] = verify(done)
  if (verdict === "unmet") block(`#${taskId}: the done bar is not met — ${detail}. The delivery item stays open.`)
  if (verdict === "error") systemMessage(`⚡ board-deliver: #${taskId} receipt unverifiable (${detail}) — allowing, verify by hand.`)
}

if (armed()) {
  try {
    const data = payload()
    if (data) check(data)
  } catch {}
}
