import type { ComputedRef } from "vue";

export type TrayKind = "comment" | "element" | "reply" | "task";

export interface TrayChatLine {
  role: "assistant" | "user";
  text: string;
}

export interface TrayReply {
  at: string;
  by: string;
  id: string;
  text: string;
}

export interface TrayItem {
  block?: string;
  chat?: TrayChatLine[];
  file?: string;
  id: string;
  kind: TrayKind;
  mark?: string;
  path?: string;
  quote?: string;
  replies?: TrayReply[];
  source?: string;
  text: string;
  thread?: string;
  top?: number;
}

export interface TrayDraft {
  /** `<intent>:<entity>`, never the bare entity: two intents on one thread must coexist, a re-drop of one replace. */
  block?: string;
  chat?: TrayChatLine[];
  file?: string;
  id?: string;
  kind: TrayKind;
  mark?: string;
  path?: string;
  quote?: string;
  replies?: TrayReply[];
  source?: string;
  text: string;
  thread?: string;
  top?: number;
}

export interface TrayHandover {
  settle: () => void;
  text: string;
}

export interface Tray {
  add: (draft: TrayDraft) => string | undefined;
  count: ComputedRef<number>;
  handOver: (prompt: string, id?: string) => TrayHandover;
  items: ComputedRef<TrayItem[]>;
  patch: (id: string, next: Partial<Omit<TrayItem, "id">>) => void;
  remove: (id: string) => void;
}

function line(item: TrayItem): string {
  if (item.kind === "task") return `Task: ${item.text}`;
  const at = item.quote ? `“${item.quote}”` : item.source;
  const where = [item.path, item.file].filter(Boolean).join(" in ");
  const loc = [at, where].filter(Boolean).join(" · ");
  const head = loc ? `${loc} — ${item.text}` : item.text;
  const extra = [
    ...(item.replies ?? []).map((reply) => `${reply.by}: ${reply.text}`),
    ...(item.chat ?? []).map((turn) => `${turn.role}: ${turn.text}`),
  ];
  if (!extra.length) return head;
  return `${head}\n${extra.join("\n")}`;
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

  function patch(id: string, next: Partial<Omit<TrayItem, "id">>): void {
    const key = sc.sessionKey.value;
    if (!key) return;
    write(
      key,
      items.value.map((row) => (row.id === id ? { ...row, ...next, id } : row)),
    );
  }

  function handOver(prompt: string, id?: string): TrayHandover {
    const key = sc.sessionKey.value;
    const going = id ? items.value.filter((row) => row.id === id) : items.value;
    const sent = new Set(going.map((row) => row.id));
    const text = [prompt.trim(), ...going.map(line)].filter(Boolean).join("\n");

    // Settles only what this turn carried: a chip dropped while the post was in flight rides the next one.
    function settle(): void {
      if (!key) return;
      write(
        key,
        (held.value[key] ?? []).filter((row) => !sent.has(row.id) || row.kind === "comment"),
      );
    }

    return { settle, text };
  }

  return { add, count, handOver, items, patch, remove };
}
