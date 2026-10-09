import type { ReviewFile } from "~~/shared/types/review";

// A side with no line on that row holds -1, because 0 is a real line.
export type ReviewRow =
  | { kind: "same"; key: string; old: number; new: number }
  | { kind: "change"; key: string; change: number; old: number; new: number; isFirst: boolean }
  | { kind: "fold"; key: string; count: number };

// 1-based, as the turn-diff mod takes them.
export interface ReviewPicks {
  old: number[];
  new: number[];
}

export type ReviewTreeRow =
  | { kind: "dir"; key: string; name: string; depth: number; count: number; isOpen: boolean }
  | { kind: "file"; key: string; name: string; depth: number; file: ReviewFile };

export interface ReviewTreeOptions {
  files: readonly ReviewFile[];
  collapsed: readonly string[];
}

export interface ReviewRowsOptions {
  file: ReviewFile;
  isCompact: boolean;
  unfolded: readonly string[];
}

const CONTEXT = 3;

function rowKey(old: number, neu: number): string {
  return neu >= 0 ? `n${neu}` : `o${old}`;
}

function rows({ file, isCompact, unfolded }: ReviewRowsOptions): ReviewRow[] {
  const out: ReviewRow[] = [];
  let i = 0;
  let j = 0;
  const same = (count: number, isEnd: boolean): void => {
    const head = i === 0 ? 0 : CONTEXT;
    const tail = isEnd ? 0 : CONTEXT;
    const key = `fold:${i}`;
    const hidden = count - head - tail;
    const folds = isCompact && hidden > 1 && !unfolded.includes(key);
    for (let k = 0; k < count; k++) {
      if (folds && k === head) {
        out.push({ kind: "fold", key, count: hidden });
        i += hidden;
        j += hidden;
        k += hidden - 1;
        continue;
      }
      out.push({ kind: "same", key: `s${i}`, old: i++, new: j++ });
    }
  };
  file.changes.forEach((change, index) => {
    same(change.oldStart - i, false);
    const height = Math.max(change.oldEnd - change.oldStart, change.newEnd - change.newStart);
    for (let k = 0; k < height; k++) {
      const old = change.oldStart + k < change.oldEnd ? change.oldStart + k : -1;
      const neu = change.newStart + k < change.newEnd ? change.newStart + k : -1;
      out.push({ kind: "change", key: rowKey(old, neu), change: index, old, new: neu, isFirst: k === 0 });
    }
    i = change.oldEnd;
    j = change.newEnd;
  });
  same(file.original.length - i, true);
  return out;
}

function picksOf(file: ReviewFile, keys: readonly string[]): ReviewPicks {
  const picked = rows({ file, isCompact: false, unfolded: [] }).filter(
    (row): row is ReviewRow & { kind: "change" } => row.kind === "change" && keys.includes(row.key),
  );
  return {
    old: picked.filter((row) => row.old >= 0).map((row) => row.old + 1),
    new: picked.filter((row) => row.new >= 0).map((row) => row.new + 1),
  };
}

function hunkOf(file: ReviewFile, change: number): ReviewPicks {
  const c = file.changes[change];
  if (!c) return { old: [], new: [] };
  const span = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, k) => from + k + 1);
  return { old: span(c.oldStart, c.oldEnd), new: span(c.newStart, c.newEnd) };
}

function counts(file: ReviewFile): { added: number; removed: number } {
  return file.changes.reduce(
    (sum, c) => ({ added: sum.added + c.newEnd - c.newStart, removed: sum.removed + c.oldEnd - c.oldStart }),
    { added: 0, removed: 0 },
  );
}

function spanOf(lines: readonly number[]): string {
  const sorted = [...lines].sort((a, b) => a - b);
  if (sorted.length === 1) return `line ${sorted[0]}`;
  return `lines ${sorted[0]}-${sorted.at(-1)}`;
}

interface Folder {
  dirs: Map<string, Folder>;
  files: ReviewFile[];
}

function countOf(folder: Folder): number {
  return folder.files.length + [...folder.dirs.values()].reduce((sum, one) => sum + countOf(one), 0);
}

// JetBrains' commit tree: the shared root on top, a folder holding only one folder merged into it as `a/b`.
function tree({ files, collapsed }: ReviewTreeOptions): ReviewTreeRow[] {
  if (!files.length) return [];
  const shared = files
    .map((file) => file.path.split("/").slice(0, -1))
    .reduce((common, parts) => {
      let n = 0;
      while (n < common.length && n < parts.length && common[n] === parts[n]) n++;
      return common.slice(0, n);
    });
  const root: Folder = { dirs: new Map(), files: [] };
  for (const file of files) {
    let folder = root;
    for (const part of file.path.split("/").slice(shared.length, -1)) {
      const next = folder.dirs.get(part) ?? { dirs: new Map(), files: [] };
      folder.dirs.set(part, next);
      folder = next;
    }
    folder.files.push(file);
  }
  const out: ReviewTreeRow[] = [];
  const walk = (folder: Folder, prefix: string, depth: number): void => {
    for (const [first, start] of [...folder.dirs].sort(([a], [b]) => a.localeCompare(b))) {
      let name = first;
      let at = start;
      while (!at.files.length && at.dirs.size === 1) {
        const [[part, only]] = [...at.dirs] as [[string, Folder]];
        name = `${name}/${part}`;
        at = only;
      }
      const key = `${prefix}/${name}`;
      const isOpen = !collapsed.includes(key);
      out.push({ kind: "dir", key, name, depth, count: countOf(at), isOpen });
      if (isOpen) walk(at, key, depth + 1);
    }
    for (const file of [...folder.files].sort((a, b) => a.path.localeCompare(b.path))) {
      out.push({ kind: "file", key: file.path, name: file.path.slice(file.path.lastIndexOf("/") + 1), depth, file });
    }
  };
  const top = shared.join("/") || "/";
  const isOpen = !collapsed.includes(top);
  out.push({ kind: "dir", key: top, name: top, depth: 0, count: files.length, isOpen });
  if (isOpen) walk(root, top, 1);
  return out;
}

export const Review = { counts, hunkOf, picksOf, rows, spanOf, tree };
