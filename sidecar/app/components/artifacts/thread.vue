<script lang="ts" setup>
import type { ReviewThread } from "#shared/types/artifact"

const { thread } = defineProps<{ thread: ReviewThread }>()

const initial = (by: string): string => (by === "claude" ? "C" : by.charAt(0).toUpperCase())
const displayName = (by: string): string => (by === "claude" ? "Claude" : by)
</script>

<template>
  <article class="thread" :data-status="thread.status">
    <div class="thread-head">
      <span class="chip" :data-status="thread.status">{{ thread.status }}</span>
      <span v-if="thread.anchor?.label" class="at">{{ thread.anchor.label }}</span>
    </div>

    <blockquote v-if="thread.anchor?.quote" class="quote">{{ thread.anchor.quote }}</blockquote>

    <div class="msg" :data-by="thread.by === 'claude' ? 'claude' : 'user'">
      <span class="av">{{ initial(thread.by) }}</span>
      <div>
        <span class="who">{{ displayName(thread.by) }}</span>
        <span class="txt">{{ thread.body }}</span>
      </div>
    </div>

    <div v-for="reply in thread.replies" :key="reply.id" class="msg" :data-by="reply.by === 'claude' ? 'claude' : 'user'">
      <span class="av">{{ initial(reply.by) }}</span>
      <div>
        <span class="who">{{ displayName(reply.by) }}</span>
        <span class="txt">{{ reply.body }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.thread {
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}
.thread:last-child {
  border-bottom: 0;
}

.thread-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
}
.thread-head .at {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--subtle);
  text-transform: uppercase;
  letter-spacing: 0.09em;
}

.chip {
  display: inline-block;
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 99px;
  padding: 2px 9px;
}
.chip[data-status="resolved"] {
  background: var(--success-soft);
  color: var(--success);
}
.chip[data-status="open"] {
  background: var(--warning-soft);
  color: var(--warning);
}

.quote {
  border-left: 2px solid var(--warning);
  padding: 2px 0 2px 10px;
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--muted);
  font-style: italic;
}
.thread[data-status="resolved"] .quote {
  border-left-color: var(--success);
}

.msg {
  display: grid;
  grid-template-columns: 21px minmax(0, 1fr);
  gap: 9px;
  margin-bottom: 9px;
}
.msg .av {
  width: 21px;
  height: 21px;
  border-radius: 99px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 9px;
  background: var(--sunken);
  color: var(--muted);
  border: 1px solid var(--border);
}
.msg[data-by="claude"] .av {
  background: var(--primary-soft);
  color: var(--primary-deep);
  border-color: transparent;
}
.msg .who {
  font-size: 11px;
  font-weight: 700;
  display: block;
  margin-bottom: 1px;
}
.msg .txt {
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted);
}
.msg[data-by="claude"] .txt {
  color: var(--ink);
}
</style>
