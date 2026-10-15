import type { MaybeRefOrGetter } from "vue";
import type { MaybeComputed } from "~/composables/useSidecar";
import type { TreeEntry, TreeListing } from "~~/shared/types/tree";

/** What `<FileTree>` reads, whichever way the files were found. */
export interface TreeSource {
  root: MaybeComputed<string>;
  childrenOf: (dir: string) => TreeEntry[] | undefined;
  open: (dir: string) => void;
}

// An empty key or root means no conversation is picked yet.
export interface FolderTreeOptions {
  key: MaybeRefOrGetter<string>;
  root: MaybeRefOrGetter<string>;
  showIgnored: MaybeRefOrGetter<boolean>;
}

export interface FolderTree extends TreeSource {
  refresh: () => void;
}

// A whole folder, listed one directory at a time as it opens, so node_modules costs nothing until asked.
export function useFolderTree({ key, root, showIgnored }: FolderTreeOptions): FolderTree {
  const listed = shallowRef(new Map<string, TreeEntry[]>());
  const asked = new Set<string>();

  async function load(dir: string): Promise<void> {
    const at = toValue(key);
    if (!at) return;
    asked.add(dir);
    try {
      const got = await $fetch<TreeListing | undefined>(`/api/sessions/${encodeURIComponent(at)}/tree`, {
        query: { dir, ignored: toValue(showIgnored) ? "1" : "0" },
      });
      if (got) listed.value = new Map(listed.value).set(dir, got.entries);
    } catch {
      asked.delete(dir);
    }
  }

  function refresh(): void {
    for (const dir of [...asked]) void load(dir);
  }

  watch([() => toValue(key), () => toValue(showIgnored)], () => {
    const open = [...asked];
    asked.clear();
    listed.value = new Map();
    for (const dir of open) void load(dir);
  });

  return {
    childrenOf: (dir) => listed.value.get(dir),
    open: (dir) => {
      if (!asked.has(dir)) void load(dir);
    },
    refresh,
    root: computed(() => toValue(root) || undefined),
  };
}

// A fixed set of files, laid out as the folders they sit in.
export function usePathsTree(paths: MaybeRefOrGetter<readonly string[]>): TreeSource {
  const tree = computed(() => Tree.fromPaths(toValue(paths)));
  return {
    childrenOf: (dir) => tree.value?.children.get(dir),
    open: () => undefined,
    root: computed(() => tree.value?.root),
  };
}
