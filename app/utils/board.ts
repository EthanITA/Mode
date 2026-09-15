import type { BoardTask } from "~~/shared/types/board";

export type TaskPriority = 1 | 2 | 3 | 4;

export function isTaskBlocked(task: BoardTask, all: BoardTask[] = []): boolean {
  if (task.done || task.status === "completed") return false;
  if (task.category === "WAIT") return true;
  if (!task.blockedBy || task.blockedBy.length === 0) return false;
  return task.blockedBy.some((id) => {
    const blocker = all.find((t) => t.id === id);
    return !blocker || (!blocker.done && blocker.status !== "completed");
  });
}

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

export interface OrderedTasks {
  tasks: BoardTask[];
  order: string[];
  all?: BoardTask[];
}

export function orderedTasks({ tasks, order, all = tasks }: OrderedTasks): BoardTask[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  // Infinity, not a falsy default: rank 0 is a real position and `!rank` would drop it to the bottom.
  const at = (task: BoardTask): number => rank.get(task.id) ?? Number.POSITIVE_INFINITY;
  return [...tasks].sort((a, b) => {
    const left = at(a);
    const right = at(b);
    return left === right ? compareBoardTasks(a, b, all) : left - right;
  });
}
