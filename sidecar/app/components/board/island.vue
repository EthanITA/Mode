<script lang="ts" setup>
import { ChevronDown } from "@lucide/vue";

const sc = useSidecar();
const board = useBoard(sc.sessionKey);

const open = ref(true);
const newTask = ref("");
const draggedId = ref<string>();
const overId = ref<string>();
const overEnd = ref(false);

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
  <div class="dock" data-region="board-island">
    <UiSurface v-if="open" v-island-pop variant="glass-liquid" shape="island" pad="none" class="panel">
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
          <input
            v-model="newTask"
            class="add-input"
            placeholder="Add a task&hellip; &#8629;"
            @keydown="onEnter"
          />
        </div>
      </div>
    </UiSurface>

    <button v-else v-press class="pill focusable" type="button" title="Show the board" @click="open = true">
      Board
      <span class="bar"><i class="fill" :style="{ width: `${pct}%` }" /></span>
      <span class="count mono-meta">{{ count }}</span>
      <span v-if="waiting" class="waiting mono-meta">
        <i class="dot" />{{ waiting }} on Marco
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
    </button>
  </div>
</template>

<style scoped>
.dock {
  bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  position: fixed;
  right: 16px;
  z-index: 20;
}

.panel {
  display: flex;
  flex-direction: column;
  max-height: min(60vh, 520px);
  overflow: hidden;
  width: 340px;
  max-width: calc(100vw - 32px);
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

.pill {
  align-items: center;
  background: var(--glass-liquid-bg, var(--raised));
  border: 0;
  border-radius: 999px;
  box-shadow: var(--shadow-lg);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 12.5px;
  font-weight: 600;
  gap: 10px;
  height: 40px;
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

.pill svg {
  fill: none;
  height: 13px;
  stroke: var(--muted);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
  width: 13px;
}
</style>
