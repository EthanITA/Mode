<script lang="ts" setup>
import type { ReviewThread, ThreadReply } from "~~/shared/types/artifact";
import type { Pin } from "~/utils/anchors";

const { adrift = false, pin, slug } = defineProps<{ adrift?: boolean; pin: Pin; slug: string }>();

const emit = defineEmits<{ close: [] }>();

const chrome = useChrome();
const tray = useTray();
const at = ref(0);
const draft = ref("");

const thread = computed<ReviewThread | undefined>(() => pin.threads[Math.min(at.value, pin.threads.length - 1)]);

const messages = computed<ThreadReply[]>(() => {
  const one = thread.value;
  if (!one) return [];
  return [{ at: one.at, body: one.body, by: one.by, id: one.id }, ...one.replies];
});

// Two intents on one thread need two ids, or hitting Resolve would swallow a reply already waiting.
const replyId = computed(() => `reply:${thread.value?.id ?? ""}`);
const resolveId = computed(() => `resolve:${thread.value?.id ?? ""}`);

const replyQueued = computed(() => tray.items.value.some((item) => item.id === replyId.value));
const resolveQueued = computed(() => tray.items.value.some((item) => item.id === resolveId.value));

const where = computed(() => {
  if (adrift) return `${plural(pin.threads.length, "note")} · the text they quote is gone from this version`;
  return pin.label || "somewhere on the page";
});

function initialOf(by: string): string {
  return authorOf(by).charAt(0).toUpperCase();
}

function step(by: number): void {
  at.value = (at.value + by + pin.threads.length) % pin.threads.length;
  draft.value = "";
}

function reply(): void {
  const text = draft.value.trim();
  const one = thread.value;
  if (!text || !one) return;
  tray.add({ id: replyId.value, kind: "reply", quote: one.anchor?.quote, source: slug, text });
  draft.value = "";
  chrome.toast("In the tray · sends with your next turn");
}

// Nothing here writes the artifact, so resolving is a sentence for the next turn rather than a state flip.
function resolve(): void {
  const one = thread.value;
  if (!one) return;
  tray.add({ id: resolveId.value, kind: "reply", quote: one.anchor?.quote, source: slug, text: `Resolve note ${one.n}.` });
  chrome.toast("Resolve is in the tray · sends with your next turn");
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  reply();
}
</script>

<template>
  <div v-if="thread" class="thread" data-region="read-thread">
    <p class="where mono-meta">{{ where }}</p>

    <header>
      <span class="title">Comment</span>
      <span class="meta mono-meta">note {{ thread.n }} · {{ relativeAge(thread.at) }} · {{ thread.status }}</span>
      <span class="spacer" />
      <span v-if="pin.threads.length > 1" class="pager">
        <button
          v-press
          class="plain-button focusable mono-meta"
          type="button"
          aria-label="Previous note"
          @click="step(-1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6" /></svg>
        </button>
        <span class="mono-meta">{{ at + 1 }}/{{ pin.threads.length }}</span>
        <button v-press class="plain-button focusable mono-meta" type="button" aria-label="Next note" @click="step(1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </span>
      <button
        v-if="thread.status === 'open'"
        v-press
        class="resolve focusable"
        type="button"
        :data-queued="resolveQueued ? '' : undefined"
        @click="resolve"
      >
        {{ resolveQueued ? "Resolve queued" : "Resolve" }}
      </button>
    </header>

    <blockquote v-if="thread.anchor?.quote" class="quote">{{ thread.anchor.quote }}</blockquote>
    <p v-if="pin.weak" class="warn mono-meta">this quote appears more than once — the pill sits on the first</p>

    <div v-for="message in messages" :key="message.id" class="message">
      <span class="who" :data-you="authorOf(message.by) === 'you' ? '' : undefined">{{ initialOf(message.by) }}</span>
      <div class="said">
        <p class="body">{{ message.body }}</p>
        <span class="meta mono-meta">{{ authorOf(message.by) }} · {{ relativeAge(message.at) }}</span>
      </div>
    </div>

    <p v-if="replyQueued || resolveQueued" class="queued mono-meta">
      in the tray · sends with your next turn
    </p>

    <UiTextarea v-model="draft" auto-fit placeholder="Reply to Claude…" :rows="2" @keydown="onKey" />

    <footer>
      <span class="hint mono-meta">↵ adds to the tray · esc close</span>
      <button v-press class="ghost focusable" type="button" @click="emit('close')">Close</button>
      <button v-press class="solid focusable" type="button" :disabled="!draft.trim()" @click="reply">Reply</button>
    </footer>
  </div>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}

.where {
  color: var(--subtle);
  margin: 0;
}

header {
  align-items: center;
  display: flex;
  gap: 8px;
}

.title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.meta {
  color: var(--subtle);
}

.spacer {
  flex: 1;
}

.pager {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
  gap: 6px;
}

.pager svg {
  fill: none;
  height: 12px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  width: 12px;
}

.resolve {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-selector);
  color: var(--success);
  cursor: pointer;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 10px;
  transition: border-color var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}

.resolve:hover {
  border-color: var(--success);
}

/* Queued is not resolved: it reads as pending until the turn that writes it lands. */
.resolve[data-queued] {
  border-style: dashed;
  color: var(--primary);
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

.warn {
  color: var(--warning);
  margin: 0;
}

.message {
  display: flex;
  gap: 10px;
}

.who {
  align-items: center;
  background: var(--primary-soft);
  border-radius: var(--radius-selector);
  color: var(--primary);
  display: grid;
  flex: none;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  height: 18px;
  margin-top: 2px;
  place-items: center;
  width: 18px;
}

.who[data-you] {
  background: var(--warning-soft);
  color: var(--warning);
}

.said {
  min-width: 0;
}

.body {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

.queued {
  color: var(--primary);
  margin: 0;
}

footer {
  align-items: center;
  display: flex;
  gap: 10px;
}

.hint {
  color: var(--subtle);
  margin-right: auto;
}

.ghost,
.solid {
  border-radius: var(--radius-field);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
}

.ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
}

.solid {
  background: var(--ink);
  border: 0;
  color: var(--canvas);
}

.solid:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .resolve {
    transition: none;
  }
}
</style>
