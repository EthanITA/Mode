import { armed } from "../../lib/hook/guard.ts"
import { payload, str, systemMessage, zap, type Payload } from "../../lib/hook/io.ts"
import { Board, Subject, Transcript, Turns } from "../../lib/hook/transcript.ts"

// A task that ages this many turns without a board call has stopped describing reality.
const STALE_TURNS = 3
const CATEGORIES = ["AI", "USER", "WAIT"]

type Nudge = [text: string, message: string]

// The first nudge that applies, in the order the python guard checked them, since only one is said per stop.
function nudge(data: Payload): Nudge | string | undefined {
  const session = str(data.session_id)
  const entries = Transcript.read(str(data.transcript_path))
  if (Transcript.alreadyZapped(entries, "board-check")) return undefined
  const turns = Turns.calls(entries)
  if (!turns.length) return undefined

  const stored = Board.store(session)
  const replay = Board.dedupe(Board.fromTranscript(entries))
  // A wiped store is repaired in place: the transcript holds every create and update, so no rebuild turn.
  if (!stored.length && replay.length) {
    Board.restore(session, replay)
    return [
      "The session store was wiped (a compact or resume drops it). The board has been restored from the " +
        `transcript automatically — ${replay.length} task(s), ids, statuses and receipts intact. No rebuild needed; carry on.`,
      `board-check: store wiped — board auto-restored (${replay.length} tasks).`,
    ]
  }

  const shape = Turns.shape(turns.at(-1) ?? [])
  // A turn that only read and answered has no board duty: nagging hygiene there is what made Q&A stretches hell.
  if (!shape.substantial && !shape.boardCalls.length) return undefined
  const tasks = stored
  const actionable = Board.mine(tasks, turns)
  const open = actionable.filter((task) => task.status === "pending" || task.status === "in_progress")
  const inProgress = actionable.filter((task) => task.status === "in_progress")
  const listed = (list: typeof tasks): string => list.map(Board.describe).join("; ")

  if (shape.substantial && !tasks.length) {
    const reason =
      shape.written.size >= 2
        ? `wrote ${shape.written.size} files`
        : shape.delegated.length
          ? `delegated to ${[...new Set(shape.delegated)].sort().join(", ")}`
          : "ran mutating shell commands"
    return [
      `This turn ${reason} but no task board exists. Open one now with TaskCreate: record what you just did — each ` +
        "finished piece created and marked completed as its receipt — and add pending or in_progress items only " +
        "for work that genuinely remains. If nothing remains, receipts alone are the correct board: never invent " +
        'filler, and never park a fake "[USER] decide…" item just to satisfy this check.',
      "board-check: work happened with no board — recording receipts.",
    ]
  }

  if (shape.substantial && !open.length && !shape.created.length && !shape.completed.length && !shape.question) {
    return [
      "Every task on the board is completed, yet this turn did work — the board is missing this turn's " +
        "receipt. Record the work you just did: create it and mark it completed if it is done and verified, and " +
        "add pending items only if something real is outstanding. A fully ticked board that matches reality " +
        'means the topic is done — never invent filler, and a parked "[USER] Decide to commit" is the ' +
        "canonical filler, not a task.",
      "board-check: board is missing this turn's receipt — recording it.",
    ]
  }

  // A task in flight since an earlier turn already covers the work, so ticking late is not acting early.
  const covered = inProgress.some((task) => Turns.lastTouch(turns, task) < turns.length - 1)
  if (shape.substantial && shape.created.length && shape.actedFirst && !covered) {
    return [
      `You started working before the board went up: the first action came at call ${shape.firstAction + 1}, the first board call ` +
        `at ${shape.firstBoard + 1}. The board states what you are about to do, so it goes up before the first action, ` +
        "otherwise it records what already happened.",
      "board-check: acted before the board went up.",
    ]
  }

  if (shape.substantial && !shape.boardCalls.length && open.length) {
    return [
      "This turn changed things but never touched the board. Reconcile it now: mark completed anything you " +
        "finished and verified, set the item you are on to in_progress, and add tasks for work that surfaced. " +
        `Open items: ${listed(open)}`,
      "board-check: board went untouched during a work turn — reconciling.",
    ]
  }

  // Closing something out is proof the board is live.
  if (shape.substantial && open.length && !inProgress.length && !shape.completed.length && !shape.question) {
    return [
      "You are doing work but no task is marked in_progress. Set the one you are actually on to in_progress so " +
        `the board reflects reality. Pending: ${listed(open)}`,
      "board-check: work in flight with nothing marked in_progress.",
    ]
  }

  if (shape.substantial && shape.createdStartable.length && !inProgress.length && !shape.completed.length && !shape.question) {
    return ["You created tasks this turn but left them all pending. Mark the one you are starting as in_progress.", "board-check: tasks created but none started."]
  }

  // The id can only be checked here: TaskCreate assigns it after the subject is written.
  const malformed = tasks.flatMap((task) => {
    if (!Subject.category(task)) return [`${Board.describe(task)} → needs ${CATEGORIES.map((c) => `[${c}]`).join(" or ")}`]
    const gap = Subject.idGap(task)
    return gap ? [`${Board.describe(task)} → ${gap}`] : []
  })
  if (malformed.length) {
    return [
      'These board subjects are not in standard form — every one reads "#id [CATEGORY] subject", the id ' +
        'padded to three columns so the ids line up, so that a bare "#4" resolves wherever it is quoted. ' +
        `Fix each with TaskUpdate: ${malformed.join("; ")}`,
      `board-check: ${malformed.length} task subject(s) off-standard — renaming.`,
    ]
  }

  const age = (task: (typeof tasks)[number]): number => turns.length - 1 - Turns.lastTouch(turns, task)
  const stale = inProgress.filter((task) => age(task) >= STALE_TURNS)
  if (stale.length) {
    return [
      `These tasks have been in_progress with no board update: ${stale.map((task) => `${Board.describe(task)} (untouched ${age(task)} turns)`).join("; ")}. ` +
        "Reconcile each one — mark it completed if it is done and verified, split it if it grew, or leave it and say what it is blocked on.",
      `board-check: ${stale.length} stale in_progress task(s) — reconciling.`,
    ]
  }

  // Past the panel's truncation the rendered list is the only complete view the user gets of a clean board.
  return tasks.filter((task) => task.status !== "completed").length > Board.FULL_LIST_OVER ? Board.full(tasks) : undefined
}

if (armed()) {
  try {
    const data = payload()
    // The self-heal turn must not be audited again, or the board becomes an infinite loop.
    const found = data && !data.stop_hook_active ? nudge(data) : undefined
    if (typeof found === "string") systemMessage(found)
    else if (found) zap(...found)
  } catch {}
}
