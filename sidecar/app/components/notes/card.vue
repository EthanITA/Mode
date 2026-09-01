<script lang="ts" setup>
import type { ReviewThread } from "~~/shared/types/artifact";

const { compact = false, thread } = defineProps<{
  compact?: boolean;
  thread: ReviewThread;
}>();

const age = computed(() => relativeAge(thread.at));
</script>

<template>
  <article class="note" :data-status="thread.status" :data-compact="compact ? '' : undefined">
    <header>
      <span class="who mono-meta">{{ authorOf(thread.by) }}<template v-if="age"> · {{ age }}</template></span>
      <span class="status mono-meta">{{ thread.status }}</span>
    </header>

    <p v-if="thread.anchor?.quote" class="quote">{{ thread.anchor.quote }}</p>
    <p class="body">{{ thread.body }}</p>

    <div v-for="reply in thread.replies" :key="reply.id" class="reply">
      <span class="who mono-meta">{{ authorOf(reply.by) }}<template v-if="reply.at"> · {{ relativeAge(reply.at) }}</template></span>
      <p class="body">{{ reply.body }}</p>
    </div>

    <footer v-if="thread.status === 'open'">
      <button class="act plain-button mono-meta" type="button" disabled title="Read only: the sidecar never writes a note">
        Reply
      </button>
      <button class="act plain-button mono-meta" type="button" disabled title="Read only: the sidecar never resolves a note">
        Resolve
      </button>
    </footer>
  </article>
</template>

<style scoped>
.note {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-box);
  padding: 12px 14px;
}

.note[data-status="resolved"] {
  opacity: 0.62;
}

.note[data-compact] {
  border: 0;
  padding: 0;
}

header {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 7px;
}

.who {
  color: var(--subtle);
}

.status {
  border-radius: 999px;
  flex: none;
  padding: 2px 7px;
}

.note[data-status="open"] .status {
  background: var(--warning-soft);
  color: var(--warning);
}

.note[data-status="resolved"] .status {
  background: var(--success-soft);
  color: var(--success);
}

.quote {
  border-left: 2px solid var(--border-strong);
  color: var(--muted);
  font-size: 12px;
  margin: 0 0 8px;
  padding-left: 9px;
}

.body {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

.reply {
  border-left: 2px solid var(--success);
  margin-top: 10px;
  padding-left: 10px;
}

.reply .who {
  display: block;
  margin-bottom: 4px;
}

footer {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}

.act {
  color: var(--subtle);
  opacity: 0.6;
}
</style>
