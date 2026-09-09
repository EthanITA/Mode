<script lang="ts" setup>
import { Check, Zap } from "@lucide/vue";
import type { FastModelReply, FastModelRequest } from "~~/shared/types/models";
import type { ArtifactReviewReply, ReviewThread } from "~~/shared/types/artifact";
import type { TrayItem, TrayReply } from "~/composables/useTray";

const { item, live = true, slug, thread } = defineProps<{
  item?: TrayItem;
  live?: boolean;
  slug: string;
  thread?: ReviewThread;
}>();

const emit = defineEmits<{ reload: [] }>();

const chrome = useChrome();
const tray = useTray();
const sc = useSidecar();
const draft = ref("");
const busy = ref<"ask" | "reply" | "resolve">();

const quote = computed(() => item?.quote || thread?.anchor?.quote || item?.block || thread?.anchor?.text);
const label = computed(() => thread?.anchor?.label || item?.source);
const body = computed(() => item?.text || thread?.body || "");
const replies = computed<Array<{ at: string; by: string; id: string; text: string }>>(() => {
  const fromItem = (item?.replies ?? []).map((row) => ({ at: row.at, by: row.by, id: row.id, text: row.text }));
  const fromThread = (thread?.replies ?? []).map((row) => ({ at: row.at, by: row.by, id: row.id, text: row.body }));
  if (fromItem.length) return fromItem;
  return fromThread;
});

function failStatus(error: unknown): number {
  if (typeof error !== "object" || !error) return 0;
  const rec = error as { response?: { status?: unknown }; status?: unknown; statusCode?: unknown };
  if (typeof rec.statusCode === "number") return rec.statusCode;
  if (typeof rec.status === "number") return rec.status;
  if (typeof rec.response?.status === "number") return rec.response.status;
  return 0;
}

function toastFail(error: unknown): void {
  const status = failStatus(error);
  if (status === 503) chrome.toast("No model credential is configured", "warning");
  else if (status === 502) chrome.toast("Both models failed", "destructive");
  else chrome.toast("That note could not be sent", "destructive");
}

function filePath(): string | undefined {
  return item?.file || sc.artifact.value?.path;
}

function elementPath(): string | undefined {
  return item?.path || thread?.anchor?.sel;
}

function elementText(): string {
  return item?.block || thread?.anchor?.text || quote.value || "";
}

function modelContext(): string {
  return [elementText(), elementPath(), filePath()].filter(Boolean).join("\n");
}

async function refresh(threads: ReviewThread[]): Promise<void> {
  if (!sc.artifact.value) return;
  sc.artifact.value = { ...sc.artifact.value, threads };
}

async function onReply(text: string): Promise<void> {
  if (busy.value) return;
  busy.value = "reply";
  try {
    if (item) {
      const next: TrayReply = {
        at: new Date().toISOString(),
        by: "user",
        id: crypto.randomUUID(),
        text,
      };
      tray.patch(item.id, { replies: [...(item.replies ?? []), next] });
    }
    const id = item?.thread || thread?.id;
    if (id) {
      const got = await $fetch<ArtifactReviewReply>(`/api/artifacts/${slug}/review`, {
        body: { action: "reply", body: text, by: "user", id },
        method: "POST",
      });
      await refresh(got.threads);
    }
    draft.value = "";
  } catch (error) {
    toastFail(error);
  } finally {
    busy.value = undefined;
  }
}

async function ask(): Promise<void> {
  if (busy.value) return;
  busy.value = "ask";
  const history = replies.value.map((row) => ({
    role: (row.by === "user" ? "user" : "assistant") as "assistant" | "user",
    text: row.text,
  }));
  try {
    const request = {
      context: modelContext(),
      history: [{ role: "user", text: body.value }, ...history],
      instruction: draft.value.trim() || body.value,
      selection: elementText(),
      task: "chat",
    } satisfies FastModelRequest;
    const reply = await $fetch<FastModelReply>("/api/models/fast", { body: request, method: "POST" });
    const said = reply.kind === "answer" ? reply.text : reply.replacement;
    const by = reply.by;
    if (item) {
      tray.patch(item.id, {
        replies: [
          ...(item.replies ?? []),
          { at: new Date().toISOString(), by, id: crypto.randomUUID(), text: said },
        ],
      });
    }
    const id = item?.thread || thread?.id;
    if (id) {
      const got = await $fetch<ArtifactReviewReply>(`/api/artifacts/${slug}/review`, {
        body: { action: "reply", body: said, by, id },
        method: "POST",
      });
      await refresh(got.threads);
    }
    draft.value = "";
  } catch (error) {
    toastFail(error);
  } finally {
    busy.value = undefined;
  }
}

async function resolve(): Promise<void> {
  if (busy.value) return;
  busy.value = "resolve";
  try {
    const id = item?.thread || thread?.id;
    if (id) {
      const got = await $fetch<ArtifactReviewReply>(`/api/artifacts/${slug}/review`, {
        body: { action: "resolve", id },
        method: "POST",
      });
      await refresh(got.threads);
    }
    if (item) tray.remove(item.id);
  } catch (error) {
    toastFail(error);
  } finally {
    busy.value = undefined;
  }
}
</script>

<template>
  <UiSurface
    class="card"
    data-region="comment-card"
    pad="none"
    variant="raised"
    :data-busy="busy"
    :data-live="live"
  >
    <p v-if="label" class="where mono-meta">{{ label }}</p>
    <blockquote v-if="quote" class="quote">{{ quote }}</blockquote>
    <Prose class="body" :value="body" />

    <div v-for="row in replies" :key="row.id" class="reply" data-region="comment-reply" :data-by="row.by">
      <span class="who mono-meta">{{ row.by }}</span>
      <Prose class="body" :value="row.text" />
    </div>

    <ReadCompose v-model="draft" :disabled="!!busy" placeholder="Reply…" @save="onReply" />

    <footer>
      <UiIconButton :icon="Zap" label="Ask AI" size="xs" :disabled="!!busy" @click="ask">Ask AI</UiIconButton>
      <UiIconButton :icon="Check" label="Resolve" size="xs" :disabled="!!busy" @click="resolve">Resolve</UiIconButton>
    </footer>
  </UiSurface>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  width: 280px;
}

.card[data-busy] {
  opacity: 0.72;
}

.where {
  color: var(--subtle);
  margin: 0;
}

.quote {
  background: var(--sunken);
  border-left: 2px solid var(--primary);
  border-radius: 0 6px 6px 0;
  color: var(--muted);
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.5;
  margin: 0;
  padding: 6px 10px;
}

.body {
  margin: 0;
  min-width: 0;
}

.reply {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.reply[data-by="haiku"],
.reply[data-by="gemini"],
.reply[data-by="claude"] {
  border-left: 2px solid var(--success);
  padding-left: 8px;
}

.who {
  color: var(--subtle);
}

footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
