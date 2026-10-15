<script lang="ts" setup>
import { ChevronDown, ChevronRight, ChevronUp } from "@lucide/vue";
import { isTaskBlocked, orderedTasks } from "~~/app/utils/board";

const sc = useSidecar();
const board = useBoard(sc.sessionKey);
const chrome = useChrome();

const open = ref(true);
const remembered = ref(true);
const showDone = ref(false);
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
const activeTasks = computed(() => {
  const all = tasks.value;
  return orderedTasks({
    tasks: all.filter((task) => !task.done && task.status !== "completed"),
    order: board.summary.value?.order ?? [],
    all,
  });
});
const doneTasks = computed(() => {
  return tasks.value
    .filter((task) => task.done || task.status === "completed")
    .sort((a, b) => Number(a.id) - Number(b.id));
});
const count = computed(() => board.summary.value?.count ?? 0);
const waiting = computed(() => board.summary.value?.waitingOnUser ?? 0);
const pct = computed(() => {
  const total = tasks.value.length;
  return total ? Math.round(((total - count.value) / total) * 100) : 0;
});

function resetDrag(): void {
  draggedId.value = undefined;
  overId.value = undefined;
  overEnd.value = false;
}

function sequence(dragged: string, beforeId?: string): string[] {
  const ids = activeTasks.value.map((task) => task.id).filter((id) => id !== dragged);
  const at = beforeId ? ids.indexOf(beforeId) : -1;
  const cut = at < 0 ? ids.length : at;
  return [...ids.slice(0, cut), dragged, ...ids.slice(cut)];
}

function onDrop(beforeId: string): void {
  const dragged = draggedId.value;
  if (dragged && dragged !== beforeId) void board.reorder(sequence(dragged, beforeId));
  resetDrag();
}

function onEndDrop(): void {
  const dragged = draggedId.value;
  if (dragged) void board.reorder(sequence(dragged));
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
    :responsive="{ anchorX: 'start', anchorY: 'end', order: 'height', case: open ? 'panel' : 'pill' }"
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
            v-for="task in activeTasks"
            :key="task.id"
            :task="task"
            :agents="agents"
            :blocked="isTaskBlocked(task, tasks)"
            :drop-highlight="overId === task.id"
            @toggle="board.toggleDone(task)"
            @reassign="board.reassign(task, $event)"
            @dragstart="draggedId = task.id"
            @dragover="overId = task.id"
            @dragend="resetDrag"
            @drop="onDrop(task.id)"
          />

          <UiStateMessage v-if="!tasks.length" class="empty">Nothing on the board yet.</UiStateMessage>
          <UiStateMessage v-else-if="!activeTasks.length && doneTasks.length" class="empty">
            All open tasks completed.
          </UiStateMessage>

          <div
            class="add"
            data-tip="Add a task · {enter}"
            :data-drop="overEnd ? '' : undefined"
            @dragover.prevent="overEnd = true"
            @dragleave="overEnd = false"
            @drop.prevent="onEndDrop"
          >
            <span class="spacer-handle" aria-hidden="true" />
            <UiTextInput
              v-model="newTask"
              class="add-input"
              placeholder="Add a task&hellip;"
              variant="bare"
              @keydown="onEnter"
            />
          </div>

          <div v-if="doneTasks.length" class="done-section">
            <button
              v-press
              class="done-toggle plain-button focusable"
              type="button"
              :aria-expanded="showDone"
              title="Toggle completed tasks"
              @click="showDone = !showDone"
            >
              <span class="done-chevron" :data-open="showDone ? '' : undefined">
                <UiIcon :icon="ChevronRight" size="xs" />
              </span>
              <span class="done-title mono-meta">Done</span>
              <span class="done-count mono-meta">{{ doneTasks.length }}</span>
            </button>

            <div v-if="showDone" class="done-items">
              <BoardItem
                v-for="task in doneTasks"
                :key="task.id"
                :task="task"
                :agents="agents"
                @toggle="board.toggleDone(task)"
                @reassign="board.reassign(task, $event)"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #pill>
      <button v-press class="pill focusable" type="button" title="Show the board" @click="open = true">
        Board
        <span class="bar"><i class="fill" :style="{ width: `${pct}%` }" /></span>
        <span class="count mono-meta">{{ count }}</span>
        <span v-if="waiting" class="waiting mono-meta"> <i class="dot" />{{ waiting }} on you </span>
        <span class="chevron"><UiIcon :icon="ChevronUp" size="xs" /></span>
      </button>
    </template>
  </UiSurface>
</template>

<style scoped>
.panel {
  @apply flex max-h-[min(60vh,520px)] w-85 flex-col overflow-hidden;
}

.head {
  @apply flex flex-none items-center gap-2 border-b border-b-border py-2.5 pr-3 pl-3.5;
}

.title {
  @apply text-[14px] font-extrabold tracking-[-0.02em] text-fg;
}

.meta {
  @apply text-muted;
}

.spacer {
  @apply flex-1;
}

.list {
  @apply flex min-h-0 flex-col overflow-y-auto px-1.25 pt-1 pb-0.75;
}

.empty {
  @apply mx-1 my-2.5;
}

.add {
  @apply flex items-center gap-2 border-t-2 border-t-transparent px-2 py-1;
}

.add[data-drop] {
  @apply border-t-primary;
}

.spacer-handle {
  @apply w-3 flex-none;
}

.add-input {
  @apply h-6 flex-1 border-0 bg-transparent px-1 py-0 text-[12.5px] text-fg outline-none;
}

.done-section {
  @apply mt-1.5 flex flex-col border-t border-t-border pt-1;
}

.done-toggle {
  @apply flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-muted;
}

.done-toggle:hover {
  @apply bg-sunken text-fg;
}

.done-chevron {
  @apply inline-flex items-center text-subtle transition-transform duration-(--duration-fast) ease-out;
}

.done-chevron[data-open] {
  @apply rotate-90;
}

.done-title {
  @apply text-[10.5px] text-muted;
}

.done-count {
  @apply rounded-full bg-sunken px-1.5 py-px text-[9.5px] text-subtle;
}

.done-items {
  @apply flex flex-col;
}

/* Resting height must equal --island-row-h: shape="pill" only clips to a full
   circle when the box is no taller than that (see design-system/components/island.md). */
.pill {
  @apply inline-flex h-(--island-row-h) cursor-pointer items-center gap-2.5 border-0 bg-transparent bg-none px-3.5 py-0 text-[12.5px] font-semibold text-fg;
}

.pill:hover {
  @apply text-primary;
}

.bar {
  @apply block h-1 w-8.5 flex-none overflow-hidden rounded-full bg-sunken;
}

.fill {
  @apply block h-full rounded-full bg-fg transition-[width] duration-(--duration-base) ease-out;
}

.count {
  @apply text-muted;
}

.waiting {
  @apply inline-flex items-center gap-1.25 text-warning;
}

.waiting .dot {
  @apply bg-warning;
  --dot-size: 6px;
}

.chevron {
  @apply inline-flex items-center text-muted;
}

@media (prefers-reduced-motion: reduce) {
  .fill,
  .done-chevron {
    @apply transition-none;
  }
}
</style>
