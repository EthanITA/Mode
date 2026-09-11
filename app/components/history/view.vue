<script lang="ts" setup>
const sc = useSidecar();
const history = useHistory();
const restoring = ref<string>();

const firstFresh = computed(() => history.turns.value.find((one) => one.fresh)?.receipt.turn);

const selectedTurn = computed(() => history.turns.value.find((one) => one.receipt.turn === history.selected.value));

const subtitle = computed(() => {
  if (!selectedTurn.value) return "";
  const count = history.files.value.length;
  return count ? plural(count, "file") : "no files changed";
});

async function restore(path: string, force?: boolean): Promise<void> {
  restoring.value = path;
  await history.restore(path, force);
  restoring.value = undefined;
}

const restoreMessage = computed(() => {
  const done = history.restored.value;
  if (!done) return "";
  if (done.restored) return `Restored ${basename(done.path)} to turn ${done.turn}.`;
  // The store refuses only when disk matches no version it holds, so this is never our own earlier restore.
  if (history.forceable.value) {
    return `${basename(done.path)} on disk is not any version this conversation stored. Something outside this conversation — a hand edit, or another session — has changed it since. Restoring will overwrite that work.`;
  }
  return `Could not restore ${basename(done.path)} — ${done.reason || "no reason was given"}`;
});
</script>

<template>
  <section class="history" data-region="history">
    <UiSurface class="pane" data-region="history-turns" pad="none" variant="raised">
      <header class="bar">
        <span class="title">Turns</span>
        <span class="meta mono-meta">{{ plural(history.turns.value.length, "turn") }}</span>
      </header>
      <div class="scroll" data-scroll="turns">
        <p v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</p>
        <p v-else-if="history.loading.value" class="empty">Reading the receipts…</p>
        <p v-else-if="history.error.value" class="failure" role="alert">{{ history.error.value }}</p>
        <p v-else-if="!history.turns.value.length" class="empty">No turns have been recorded for this conversation.</p>

        <template v-for="turn in history.turns.value" :key="turn.receipt.turn">
          <p v-if="turn.receipt.turn === firstFresh" class="divider mono-meta">new since you looked</p>
          <HistoryTurn
            :selected="turn.receipt.turn === history.selected.value"
            :turn="turn"
            @select="history.selected.value = turn.receipt.turn"
          />
        </template>
      </div>
    </UiSurface>

    <UiSurface class="pane" data-region="history-changes" pad="none" variant="raised">
      <header class="bar">
        <span class="title">Changes</span>
        <span class="meta mono-meta">{{ subtitle }}</span>
        <span class="spacer" />
        <span class="toggle">
          <UiChip :selected="history.compare.value === 'head'" size="xs" @click="history.compare.value = 'head'">
            vs head
          </UiChip>
          <UiChip :selected="history.compare.value === 'next'" size="xs" @click="history.compare.value = 'next'">
            vs next
          </UiChip>
        </span>
      </header>

      <div class="scroll" data-scroll="changes">
        <p v-if="history.capped.value" class="notice" role="status">
          The version store hit its size budget for this conversation, so some files were never kept. Anything missing
          below is missing from the store, not from the conversation.
        </p>

        <div v-if="history.restored.value" class="notice" :data-ok="history.restored.value.restored" role="status">
          <span>{{ restoreMessage }}</span>
          <!-- Overwriting work we never wrote is a second, deliberate act, never a retry of the first. -->
          <button
            v-if="history.forceable.value"
            v-press
            class="overwrite focusable"
            type="button"
            @click="restore(history.restored.value.path, true)"
          >
            Overwrite anyway
          </button>
        </div>

        <p v-if="!selectedTurn" class="empty">Pick a turn to see what it changed.</p>
        <p v-else-if="history.diffing.value" class="empty">Reading the diffs…</p>
        <p v-else-if="!history.files.value.length" class="empty">
          {{ selectedTurn.inFlight ? "This work" : `Turn ${selectedTurn.receipt.turn}` }} touched no files. It read and
          reasoned, but nothing on disk moved.
        </p>

        <HistoryFile
          v-for="file in history.files.value"
          :key="file.path"
          :compare="history.compare.value"
          :file="file"
          :restoring="restoring === file.path"
          @restore="restore(file.path)"
        />
      </div>
    </UiSurface>
  </section>
</template>

<style scoped>
.history {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.bar {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 10px 14px;
}

.title {
  font-size: 12.5px;
  font-weight: 700;
}

.meta {
  color: var(--muted);
  text-transform: none;
}

.spacer {
  flex: 1;
}

.toggle {
  display: inline-flex;
  flex: none;
  gap: 4px;
}

.scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.scroll[data-scroll="turns"] {
  gap: 2px;
  padding: 6px 8px 16px;
}

.divider {
  align-items: center;
  color: var(--primary);
  display: flex;
  gap: 10px;
  margin: 10px 0 4px;
  text-transform: none;
}

.divider::before,
.divider::after {
  background: var(--primary);
  content: "";
  flex: 1;
  height: 1px;
}

.empty {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
  padding: 2px;
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  color: var(--error);
  font-size: 13px;
  margin: 0;
  padding: 9px 13px;
}

.notice {
  align-items: flex-start;
  background: var(--warning-soft);
  border-radius: var(--radius-field);
  color: var(--warning);
  display: flex;
  font-size: 12.5px;
  gap: 10px;
  line-height: 1.5;
  margin: 0;
  padding: 9px 13px;
}

.overwrite {
  background: var(--warning);
  border: 0;
  border-radius: 999px;
  color: var(--canvas);
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  margin-left: auto;
  padding: 4px 11px;
}

.notice[data-ok="true"] {
  background: var(--success-soft);
  color: var(--success);
}
</style>
