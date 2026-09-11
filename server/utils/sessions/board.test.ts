import assert from "node:assert/strict"
import { test } from "node:test"
import type { BoardTask } from "../../../shared/types/board.ts"
import { compareBoardTasks, isTaskBlocked, subjectOf, taskPriority } from "./board.ts"

function makeTask(overrides: Partial<BoardTask> & { id: string }): BoardTask {
  return {
    text: `Task ${overrides.id}`,
    category: "AI",
    status: "pending",
    done: false,
    blocks: [],
    blockedBy: [],
    ...overrides,
  }
}

test("subjectOf parses stamped subjects with id and category", () => {
  assert.deepEqual(subjectOf("#1 [AI] Setup database"), { category: "AI", text: "Setup database" })
  assert.deepEqual(subjectOf("#2 [USER] Choose design system"), { category: "USER", text: "Choose design system" })
  assert.deepEqual(subjectOf("#3 [WAIT] Await PR review"), { category: "WAIT", text: "Await PR review" })
})

test("subjectOf parses subjects without id", () => {
  assert.deepEqual(subjectOf("[AI] Setup database"), { category: "AI", text: "Setup database" })
  assert.deepEqual(subjectOf("[USER] Review changes"), { category: "USER", text: "Review changes" })
  assert.deepEqual(subjectOf("[WAIT] CI run"), { category: "WAIT", text: "CI run" })
})

test("subjectOf parses subjects with id but no category", () => {
  assert.deepEqual(subjectOf("#4 Setup database"), { category: "AI", text: "Setup database" })
})

test("subjectOf parses plain subjects without id or category", () => {
  assert.deepEqual(subjectOf("Setup database"), { category: "AI", text: "Setup database" })
})

test("subjectOf preserves lone id subject when no description follows", () => {
  assert.deepEqual(subjectOf("#5"), { category: "AI", text: "#5" })
})

test("taskPriority ranks in progress > todo > blocked > done", () => {
  const tDone = makeTask({ id: "1", done: true, status: "completed" })
  const tProg = makeTask({ id: "2", status: "in_progress" })
  const tTodo = makeTask({ id: "3", status: "pending" })
  const tWait = makeTask({ id: "4", category: "WAIT" })
  const tBlocked = makeTask({ id: "5", blockedBy: ["2"] })

  const all = [tDone, tProg, tTodo, tWait, tBlocked]

  assert.equal(taskPriority(tProg, all), 1)
  assert.equal(taskPriority(tTodo, all), 2)
  assert.equal(taskPriority(tBlocked, all), 3)
  assert.equal(taskPriority(tWait, all), 3)
  assert.equal(taskPriority(tDone, all), 4)
})

test("compareBoardTasks sorts according to prio and breaks ties by id", () => {
  const tasks: BoardTask[] = [
    makeTask({ id: "1", done: true, status: "completed" }),
    makeTask({ id: "2", status: "pending" }),
    makeTask({ id: "3", status: "in_progress" }),
    makeTask({ id: "4", category: "WAIT" }),
    makeTask({ id: "5", status: "pending", blockedBy: ["3"] }),
    makeTask({ id: "6", status: "in_progress" }),
    makeTask({ id: "7", done: true, status: "completed" }),
  ]

  const sorted = [...tasks].sort((a, b) => compareBoardTasks(a, b, tasks))
  assert.deepEqual(
    sorted.map((t) => t.id),
    ["3", "6", "2", "4", "5", "1", "7"],
  )
})
