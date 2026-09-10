import type { BoardTask } from "~~/shared/types/board";

export type TaskPriority = 1 | 2 | 3 | 4;

/**
 * A task is blocked when it is waiting on an external dependency (WAIT)
 * or when any prerequisite named in blockedBy has not yet completed.
 */
export function isTaskBlocked(task: BoardTask, all: BoardTask[] = []): boolean {
  if (task.done || task.status === "completed") return false;
  if (task.category === "WAIT") return true;
  if (!task.blockedBy || task.blockedBy.length === 0) return false;
  return task.blockedBy.some((id) => {
    const blocker = all.find((t) => t.id === id);
    return !blocker || (!blocker.done && blocker.status !== "completed");
  });
}

/**
 * Priority tiers:
 * 1: in progress (active execution)
 * 2: todo (actionable pending tasks)
 * 3: blocked (waiting on dependencies or external factors)
 * 4: done (completed receipts)
 */
export function taskPriority(task: BoardTask, all: BoardTask[] = []): TaskPriority {
  if (task.done || task.status === "completed") return 4;
  if (task.status === "in_progress") return 1;
  if (isTaskBlocked(task, all)) return 3;
  return 2;
}

export function compareBoardTasks(a: BoardTask, b: BoardTask, all: BoardTask[] = []): number {
  const prioA = taskPriority(a, all);
  const prioB = taskPriority(b, all);
  if (prioA !== prioB) return prioA - prioB;
  const numA = Number(a.id);
  const numB = Number(b.id);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.id.localeCompare(b.id);
}
