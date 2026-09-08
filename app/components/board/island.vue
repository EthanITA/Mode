<script lang="ts" setup>
import { ChevronDown, ChevronUp } from "@lucide/vue";

const sc = useSidecar();
const board = useBoard(sc.sessionKey);
const chrome = useChrome();

const open = ref(true);
const remembered = ref(true);
const newTask = ref("");
const draggedId = ref<string>();
const overId = ref<string>();
const overEnd = ref(false);

watch(
  () => chrome.islands.shelved.value,
  (on) => {
    if (on) {
      remembered.value = open.value;
      open.value = false;
      return;
    }
    open.value = remembered.value;
  },
  { immediate: true },
);

const agents = computed(() => sc.sessions.value.find((session) => session.key === sc.sessionKey.value)?.agents ?? []);
const tasks = computed(() => board.summary.value?.tasks ?? []);
const count = computed(() => board.summary.value?.count ?? 0);
const waiting = computed(() => board.summary.value?.waitingOnMarco ?? 0);
const pct = computed(() => {
  const total = tasks.value.length;
  return total ? Math.round(((total - count.value) / total) * 100) : 0;
});

function resetDrag(): void {
  draggedId.value = undefined;
  overId.value = undefined;
  overEnd.value = false;
}

function onDrop(beforeId: string): void {
  const dragged = tasks.value.find((task) => task.id === draggedId.value);
  if (dragged && dragged.id !== beforeId) void board.reorder(dragged, beforeId);
  resetDrag();
}

function onEndDrop(): void {
  const dragged = tasks.value.find((task) => task.id === draggedId.value);
  if (dragged) void board.reorder(dragged, undefined);
  resetDrag();
}

function submitTask(): void {
  const text = newTask.value.trim();
  if (!text) return;
  newTask.value = "";
  void board.addTask(text);
}

function onEnter(event: KeyboardEvent): void {
  if (event.key === "Enter") submitTask();
}
</script>

<template>
  <UiSurface
    v-island-pop
    class="board"
    data-region="board-island"
    variant="glass-liquid"
    :shape="open ? 'island' : 'pill'"
    pad="none"
    :responsive="{ anchorX: 'end', anchorY: 'end', order: 'height', case: open ? 'panel' : 'pill' }"
  >
    <template #panel>
      <div class="panel">
        <header class="head">
          <span class="title">Board</span>
          <span class="meta mono-meta">{{ count }} open &middot; shared</span>
          <span class="spacer" />
          <UiIconButton :icon="ChevronDown" label="Minimize" size="sm" @click="open = false" />
        </header>

        <div class="list">
          <BoardItem
            v-for="task in tasks"
            :key="task.id"
            :task="task"
            :agents="agents"
            :drop-highlight="overId === task.id"
            @toggle="board.toggleDone(task)"
            @reassign="board.reassign(task, $event)"
            @dragstart="draggedId = task.id"
            @dragover="overId = task.id"
            @dragend="resetDrag"
            @drop="onDrop(task.id)"
          />

          <p v-if="!tasks.length" class="empty">Nothing on the board yet.</p>

          <div
            class="add"
            :data-drop="overEnd ? '' : undefined"
            @dragover.prevent="overEnd = true"
            @dragleave="overEnd = false"
            @drop.prevent="onEndDrop"
          >
            <span class="spacer-handle" aria-hidden="true" />
            <UiTextInput
              v-model="newTask"
              class="add-input"
              placeholder="Add a task&hellip; &#8629;"
              variant="bare"
              @keydown="onEnter"
            />
          </div>
        </div>
      </div>
    </template>

    <template #pill>
      <button v-press class="pill focusable" type="button" title="Show the board" @click="open = true">
        Board
        <span class="bar"><i class="fill" :style="{ width: `${pct}%` }" /></span>
        <span class="count mono-meta">{{ count }}</span>
        <span v-if="waiting" class="waiting mono-meta">
          <i class="dot" />{{ waiting }} on Marco
        </span>
        <span class="chevron"><UiIcon :icon="ChevronUp" size="xs" /></span>
      </button>
    </template>
  </UiSurface>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  max-height: min(60vh, 520px);
  overflow: hidden;
  width: 340px;
}

.head {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 10px 12px 10px 14px;
}

.title {
  font-size: 12.5px;
  font-weight: 700;
}

.meta {
  color: var(--muted);
}

.spacer {
  flex: 1;
}

.list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 6px 4px;
}

.empty {
  color: var(--subtle);
  font-size: 12.5px;
  margin: 10px 4px;
}

.add {
  align-items: center;
  border-top: 2px solid transparent;
  display: flex;
  gap: 8px;
  padding: 4px 8px;
}

.add[data-drop] {
  border-top-color: var(--primary);
}

.spacer-handle {
  flex: none;
  width: 12px;
}

.add-input {
  background: transparent;
  border: 0;
  color: var(--ink);
  flex: 1;
  font-size: 12.5px;
  height: 30px;
  outline: none;
  padding: 0 4px;
}

/* Resting height must equal --island-row-h: shape="pill" only clips to a full
   circle when the box is no taller than that (see design-system/components/island.md). */
.pill {
  align-items: center;
  background: none;
  border: 0;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 12.5px;
  font-weight: 600;
  gap: 10px;
  height: var(--island-row-h);
  padding: 0 14px;
}

.pill:hover {
  color: var(--primary);
}

.bar {
  background: var(--sunken);
  border-radius: 999px;
  display: block;
  flex: none;
  height: 4px;
  overflow: hidden;
  width: 34px;
}

.fill {
  background: var(--ink);
  border-radius: 999px;
  display: block;
  height: 100%;
  transition: width var(--duration-base) var(--ease-out);
}

.count {
  color: var(--muted);
}

.waiting {
  align-items: center;
  color: var(--warning);
  display: inline-flex;
  gap: 5px;
}

.waiting .dot {
  --dot-size: 6px;

  background: var(--warning);
}

.chevron {
  align-items: center;
  color: var(--muted);
  display: inline-flex;
}

@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
}
</style>
