import type { ComputedRef } from "vue";

export type TrayKind = "comment" | "element" | "reply" | "task";

export interface TrayItem {
  id: string;
  kind: TrayKind;
  quote?: string;
  source?: string;
  text: string;
}

export interface TrayDraft {
  /** Pass the identity you already own — a thread, a task row — and a re-drop replaces rather than duplicates. */
  id?: string;
  kind: TrayKind;
  quote?: string;
  source?: string;
  text: string;
}

export interface TrayHandover {
  settle: () => void;
  text: string;
}

export interface Tray {
  add: (draft: TrayDraft) => string | undefined;
  count: ComputedRef<number>;
  handOver: (prompt: string) => TrayHandover;
  items: ComputedRef<TrayItem[]>;
  remove: (id: string) => void;
}

function line(item: TrayItem): string {
  if (item.kind === "task") return `Task: ${item.text}`;
  const at = item.quote ? `“${item.quote}”` : item.source;
  return at ? `${at} — ${item.text}` : item.text;
}

export function useTray(): Tray {
  const sc = useSidecar();
  const held = useState<Record<string, TrayItem[]>>("sc:tray", () => ({}));

  // Chips belong to the conversation they were made in; the session poll can swap the key under them.
  const items = computed<TrayItem[]>(() => {
    const key = sc.sessionKey.value;
    return (key && held.value[key]) || [];
  });

  const count = computed(() => items.value.length);

  function write(key: string, bucket: TrayItem[]): void {
    held.value = { ...held.value, [key]: bucket };
  }

  function add(draft: TrayDraft): string | undefined {
    const key = sc.sessionKey.value;
    if (!key) return undefined;
    const id = draft.id || crypto.randomUUID();
    const item: TrayItem = { ...draft, id };
    const bucket = items.value;
    const known = bucket.some((row) => row.id === id);
    write(key, known ? bucket.map((row) => (row.id === id ? item : row)) : [...bucket, item]);
    return id;
  }

  function remove(id: string): void {
    const key = sc.sessionKey.value;
    if (!key) return;
    write(
      key,
      items.value.filter((row) => row.id !== id),
    );
  }

  function handOver(prompt: string): TrayHandover {
    const key = sc.sessionKey.value;
    const going = items.value;
    const sent = new Set(going.map((row) => row.id));
    const text = [prompt.trim(), ...going.map(line)].filter(Boolean).join("\n");

    // Settles only what this turn carried: a chip dropped while the post was in flight rides the next one.
    function settle(): void {
      if (!key) return;
      write(
        key,
        (held.value[key] ?? []).filter((row) => !sent.has(row.id)),
      );
    }

    return { settle, text };
  }

  return { add, count, handOver, items, remove };
}
