<script lang="ts" setup>
import type { BoardTask } from "~~/shared/types/board";
import type { SessionAgent } from "~~/shared/types/session";

const { task, agents, dropHighlight = false, blocked = false } = defineProps<{
  task: BoardTask;
  agents: SessionAgent[];
  dropHighlight?: boolean;
  blocked?: boolean;
}>();

defineEmits<{
  toggle: [];
  reassign: [owner: string];
  dragstart: [];
  dragover: [];
  dragend: [];
  drop: [];
}>();

const ownerAgent = computed<SessionAgent | undefined>(() =>
  task.category === "USER" ? undefined : agents.find((agent) => agent.name === task.owner),
);
// UiPerson's "no hue" rule isn't reachable through plain UiAvatar's variant set, so initials
// carry the distinction between agents; only self (Marco) gets the ink-fill "secondary" variant.
const ownerInitials = computed(() => {
  if (task.category === "USER") return "ME";
  return (ownerAgent.value?.name ?? "")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
});
const ownerLabel = computed(() => {
  if (task.category === "USER") return "Marco";
  return ownerAgent.value?.name ?? "Claude";
});
const taskId = computed(() => (task.id.startsWith("#") ? task.id : `#${task.id}`));
const blockedTitle = computed(() => {
  if (task.blockedBy.length) return `Blocked by #${task.blockedBy.join(", #")}`;
  if (task.category === "WAIT") return "Waiting on external dependency";
  return undefined;
});
const commentTell = computed(() => `On task ${taskId.value}, ${task.text}`);
const commentLabel = computed(() => `${taskId.value} ${task.text}`);
</script>

<template>
  <div
    class="row"
    draggable="true"
    data-cmt="task"
    :data-cmt-id="task.id"
    :data-cmt-label="commentLabel"
    :data-cmt-tell="commentTell"
    :data-drop="dropHighlight ? '' : undefined"
    :title="blockedTitle"
    @dragstart="$emit('dragstart')"
    @dragover.prevent="$emit('dragover')"
    @dragend="$emit('dragend')"
    @drop.prevent="$emit('drop')"
  >
    <span class="handle" aria-hidden="true">
      <i v-for="n in 6" :key="n" class="pip" />
    </span>

    <button
      v-press
      class="box plain-button focusable"
      type="button"
      :aria-pressed="task.done"
      :data-in-progress="task.status === 'in_progress' && !task.done ? '' : undefined"
      @click="$emit('toggle')"
    >
      <svg v-if="task.done" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span v-else-if="task.status === 'in_progress'" class="progress-dot" />
    </button>

    <span class="id mono-meta" :data-done="task.done ? '' : undefined">{{ taskId }}</span>

    <span class="text" :data-done="task.done ? '' : undefined">{{ task.text }}</span>

    <BoardOwnerMenu :agents="agents" @pick="$emit('reassign', $event)">
      <UiChip size="xs" :title="`Owner: ${ownerLabel}`" :data-category="task.category">
        <span v-if="task.category === 'WAIT'" class="waiting mono-meta">wait</span>
        <span v-else-if="blocked && !task.done" class="blocked mono-meta">blocked</span>
        <span v-flip="task.owner" class="owner-mark">
          <UiAvatar
            v-if="task.category === 'USER' || ownerAgent"
            :initials="ownerInitials"
            :variant="task.category === 'USER' ? 'secondary' : 'neutral'"
            size="xs"
          />
          <span v-else class="claude-avatar"><i class="claude-mark" /></span>
        </span>
      </UiChip>
    </BoardOwnerMenu>
  </div>
</template>

<style scoped>
.row {
  align-items: flex-start;
  border-radius: 8px;
  border-top: 2px solid transparent;
  display: flex;
  gap: 8px;
  padding: 7px 8px;
}

.row[data-drop] {
  border-top-color: var(--primary);
}

.row:hover {
  background: var(--sunken);
}

.handle {
  display: inline-grid;
  flex: none;
  gap: 2px;
  grid-template-columns: repeat(2, 3px);
  margin-top: 5px;
  cursor: grab;
}

.pip {
  background: var(--subtle);
  border-radius: 999px;
  height: 3px;
  width: 3px;
}

.box {
  align-items: center;
  border: 1.5px solid var(--border-strong);
  border-radius: 4px;
  box-sizing: border-box;
  display: grid;
  flex: none;
  height: 15px;
  justify-content: center;
  margin-top: 2px;
  width: 15px;
}

.box[aria-pressed="true"] {
  background: var(--primary);
  border-color: var(--primary);
}

.box[data-in-progress] {
  border-color: var(--primary);
}

.progress-dot {
  background: var(--primary);
  border-radius: 999px;
  height: 5px;
  width: 5px;
}

.box svg {
  fill: none;
  height: 9px;
  stroke: var(--primary-content);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
  width: 9px;
}

.id {
  color: var(--muted);
  flex: none;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}

.id[data-done] {
  color: var(--subtle);
}

.text {
  color: var(--ink);
  flex: 1;
  font-size: 12.5px;
  line-height: 1.45;
  min-width: 0;
}

.text[data-done] {
  color: var(--muted);
  text-decoration: line-through;
}

.waiting,
.blocked {
  color: var(--warning);
}

.owner-mark {
  display: inline-flex;
}

.claude-avatar {
  align-items: center;
  background: var(--sunken);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  height: 20px;
  justify-content: center;
  width: 20px;
}

/* mask-image, not an <img>: the source SVG's own fill can't reach a token, but the mask's alpha
   channel lets this element's background paint it, so the glyph follows the theme like everything else. */
.claude-mark {
  background-color: var(--muted);
  display: block;
  height: 11px;
  width: 11px;
  -webkit-mask-image: url(/assets/entity-static.svg);
  -webkit-mask-position: center;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-image: url(/assets/entity-static.svg);
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}
</style>
