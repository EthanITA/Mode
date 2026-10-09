import type { ReviewChange } from "../types/review.ts";

// Past this many edits the two texts are reported as one whole replacement instead of a minimal script.
const MAX_EDITS = 4000;

function split(text: string): string[] {
  if (!text) return [];
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}

// Myers' O(ND) diff over interned lines, after trimming the common head and tail.
function changes(a: readonly string[], b: readonly string[]): ReviewChange[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ids = new Map<string, number>();
  const idOf = (line: string): number => {
    if (!ids.has(line)) ids.set(line, ids.size);
    return ids.get(line)!;
  };
  return shortestScript(a.slice(start, endA).map(idOf), b.slice(start, endB).map(idOf)).map((change) => ({
    oldStart: change.oldStart + start,
    oldEnd: change.oldEnd + start,
    newStart: change.newStart + start,
    newEnd: change.newEnd + start,
  }));
}

function shortestScript(a: readonly number[], b: readonly number[]): ReviewChange[] {
  const n = a.length;
  const m = b.length;
  const whole: ReviewChange[] = [{ oldStart: 0, oldEnd: n, newStart: 0, newEnd: m }];
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0) return whole;
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const isDown = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!);
      let x = isDown ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return whole;
}

function backtrack(trace: readonly Int32Array[], n: number, m: number): ReviewChange[] {
  const edits: { x: number; y: number; isInsert: boolean }[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const band = trace[d]!;
    const at = (k: number): number => band[k + d + 1]!;
    const k = x - y;
    const isDown = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const previousK = isDown ? k + 1 : k - 1;
    const previousX = at(previousK);
    edits.push({ x: previousX, y: previousX - previousK, isInsert: isDown });
    x = previousX;
    y = previousX - previousK;
  }
  const out: ReviewChange[] = [];
  for (const edit of edits.reverse()) {
    const oldEnd = edit.isInsert ? edit.x : edit.x + 1;
    const newEnd = edit.isInsert ? edit.y + 1 : edit.y;
    const last = out.at(-1);
    if (last && last.oldEnd === edit.x && last.newEnd === edit.y) {
      last.oldEnd = oldEnd;
      last.newEnd = newEnd;
    } else out.push({ oldStart: edit.x, oldEnd, newStart: edit.y, newEnd });
  }
  return out;
}

export const Lines = { changes, split };
