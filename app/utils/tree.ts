import type { TreeEntry } from "~~/shared/types/tree";

export interface PathTree {
  root: string;
  children: Map<string, TreeEntry[]>;
}

interface Folder {
  dirs: Map<string, Folder>;
  files: string[];
}

function byName(a: TreeEntry, b: TreeEntry): number {
  return a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1;
}

// JetBrains' commit tree: the shared folder on top, and a folder that only holds one folder merged into it as `a/b`.
function fromPaths(paths: readonly string[]): PathTree | undefined {
  if (!paths.length) return undefined
  const shared = paths
    .map((path) => path.split("/").slice(0, -1))
    .reduce((common, parts) => {
      let n = 0;
      while (n < common.length && n < parts.length && common[n] === parts[n]) n++;
      return common.slice(0, n);
    });
  const root = shared.join("/") || "/";
  const top: Folder = { dirs: new Map(), files: [] };
  for (const path of paths) {
    let folder = top;
    for (const part of path.split("/").slice(shared.length, -1)) {
      const next = folder.dirs.get(part) ?? { dirs: new Map(), files: [] };
      folder.dirs.set(part, next);
      folder = next;
    }
    folder.files.push(path);
  }
  const children = new Map<string, TreeEntry[]>();
  const walk = (folder: Folder, at: string): void => {
    const entries: TreeEntry[] = [];
    for (const [first, start] of folder.dirs) {
      let name = first;
      let inner = start;
      while (!inner.files.length && inner.dirs.size === 1) {
        const [[part, only]] = [...inner.dirs] as [[string, Folder]];
        name = `${name}/${part}`;
        inner = only;
      }
      const path = `${at === "/" ? "" : at}/${name}`;
      entries.push({ name, path, kind: "dir" });
      walk(inner, path);
    }
    for (const path of folder.files) entries.push({ name: path.slice(path.lastIndexOf("/") + 1), path, kind: "file" });
    children.set(at, entries.sort(byName));
  };
  walk(top, root);
  return { root, children };
}

export const Tree = { fromPaths };
