import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardTask } from "../../shared/types/board.ts";
import { compareBoardTasks, isTaskBlocked, taskPriority } from "./board.ts";

function makeTask(overrides: Partial<BoardTask> & { id: string }): BoardTask {
  return {
    text: `Task ${overrides.id}`,
    category: "AI",
    status: "pending",
    done: false,
    blocks: [],
    blockedBy: [],
    ...overrides,
  };
}

test("taskPriority ranks in progress > todo > blocked > done", () => {
  const tDone = makeTask({ id: "1", done: true, status: "completed" });
  const tProg = makeTask({ id: "2", status: "in_progress" });
  const tTodo = makeTask({ id: "3", status: "pending" });
  const tWait = makeTask({ id: "4", category: "WAIT" });
  const tBlocked = makeTask({ id: "5", blockedBy: ["2"] });

  const all = [tDone, tProg, tTodo, tWait, tBlocked];

  assert.equal(taskPriority(tProg, all), 1);
  assert.equal(taskPriority(tTodo, all), 2);
  assert.equal(taskPriority(tBlocked, all), 3);
  assert.equal(taskPriority(tWait, all), 3);
  assert.equal(taskPriority(tDone, all), 4);
});

test("isTaskBlocked unblocks when prerequisite task is completed", () => {
  const blocker = makeTask({ id: "1", done: true, status: "completed" });
  const dependent = makeTask({ id: "2", blockedBy: ["1"] });

  assert.equal(isTaskBlocked(dependent, [blocker, dependent]), false);
  assert.equal(taskPriority(dependent, [blocker, dependent]), 2);
});

test("isTaskBlocked stays blocked when prerequisite task is unfinished", () => {
  const blocker = makeTask({ id: "1", done: false, status: "in_progress" });
  const dependent = makeTask({ id: "2", blockedBy: ["1"] });

  assert.equal(isTaskBlocked(dependent, [blocker, dependent]), true);
  assert.equal(taskPriority(dependent, [blocker, dependent]), 3);
});

test("compareBoardTasks sorts according to prio and breaks ties by id", () => {
  const tasks: BoardTask[] = [
    makeTask({ id: "1", done: true, status: "completed" }),
    makeTask({ id: "2", status: "pending" }),
    makeTask({ id: "3", status: "in_progress" }),
    makeTask({ id: "4", category: "WAIT" }),
    makeTask({ id: "5", status: "pending", blockedBy: ["3"] }),
    makeTask({ id: "6", status: "in_progress" }),
    makeTask({ id: "7", done: true, status: "completed" }),
  ];

  const sorted = [...tasks].sort((a, b) => compareBoardTasks(a, b, tasks));
  assert.deepEqual(
    sorted.map((t) => t.id),
    ["3", "6", "2", "4", "5", "1", "7"],
  );
});
