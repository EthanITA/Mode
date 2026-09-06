<script lang="ts" setup>
const sc = useSidecar();
const convo = useConversation();
const scroller = ref<HTMLElement>();

watch(
  () => convo.turns.value.length,
  () => {
    const box = scroller.value;
    if (box) box.scrollTop = box.scrollHeight;
  },
  { flush: "post" },
);
</script>

<template>
  <section class="conversation" data-region="session-conversation">
    <div ref="scroller" class="turns">
      <p v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</p>
      <p v-else-if="convo.loading.value" class="empty">Reading the conversation…</p>
      <p v-else-if="!convo.turns.value.length" class="empty">Nothing in this conversation yet.</p>

      <article
        v-for="(turn, index) in convo.turns.value"
        :key="`${turn.at}:${turn.role}:${index}`"
        class="turn"
        :data-role="turn.role"
      >
        <span class="who mono-meta">
          {{ turn.role === "user" ? "you" : "claude" }}
          · {{ relativeAge(new Date(turn.at).toISOString()) }}
        </span>
        <p class="text">{{ turn.text }}</p>
      </article>
    </div>

    <p v-if="convo.error.value" class="failure" role="alert">{{ convo.error.value }}</p>

    <form
      class="composer"
      :data-live="convo.live.value ? '' : undefined"
      :data-sending="convo.sending.value ? '' : undefined"
      @submit.prevent="convo.send"
    >
      <input
        v-model="convo.draft.value"
        class="prompt focusable"
        type="text"
        :disabled="!convo.live.value || convo.sending.value"
        :placeholder="
          convo.live.value ? 'Write back to this session' : 'This session is not live, so you cannot write to it'
        "
        :aria-label="
          convo.live.value ? 'Message this session' : 'This session is not live, so you cannot write to it'
        "
      />
      <button
        class="send focusable"
        type="submit"
        :disabled="!convo.live.value || convo.sending.value || !convo.draft.value.trim()"
      >
        Send
      </button>
    </form>
  </section>
</template>

<style scoped>
.conversation {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.turns {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}

.empty {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}

.turn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 92%;
}

.turn[data-role="assistant"] {
  align-self: flex-start;
}

.turn[data-role="user"] {
  align-items: flex-end;
  align-self: flex-end;
}

.who {
  color: var(--subtle);
}

.text {
  background: var(--sunken);
  border-radius: var(--radius-box);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  padding: 8px 12px;
  white-space: pre-wrap;
}

.turn[data-role="user"] .text {
  background: var(--primary-soft);
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  color: var(--error);
  font-size: 13px;
  margin: 0 14px 10px;
  padding: 9px 13px;
}

.composer {
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  padding: 10px 14px;
}

.prompt {
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--ink);
  flex: 1;
  font: inherit;
  font-size: 12.5px;
  min-width: 0;
  padding: 7px 13px;
}

.prompt:disabled {
  color: var(--muted);
  cursor: not-allowed;
}

.send {
  background: var(--primary);
  border: 0;
  border-radius: 999px;
  color: var(--primary-content);
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 15px;
}

.send:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
