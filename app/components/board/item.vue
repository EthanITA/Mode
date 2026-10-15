<script lang="ts" setup>
import type { BoardTask } from "~~/shared/types/board";
import type { SessionAgent } from "~~/shared/types/session";

const {
  task,
  agents,
  dropHighlight = false,
  blocked = false,
} = defineProps<{
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

const expanded = ref(false);

const ownerAgent = computed<SessionAgent | undefined>(() =>
  task.category === "USER" ? undefined : agents.find((agent) => agent.name === task.owner),
);
// UiPerson's "no hue" rule isn't reachable through plain UiAvatar's variant set, so initials
// carry the distinction between agents; only the user gets the ink-fill "secondary" variant.
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
  if (task.category === "USER") return "You";
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

    <span v-if="task.category === 'WAIT'" class="tag mono-meta">wait</span>
    <span v-else-if="blocked && !task.done" class="tag mono-meta">blocked</span>

    <button
      class="text plain-button focusable"
      type="button"
      :data-done="task.done ? '' : undefined"
      :data-expanded="expanded"
      :title="task.text"
      @click="expanded = !expanded"
    >
      {{ task.text }}
    </button>

    <BoardOwnerMenu :agents="agents" @pick="$emit('reassign', $event)">
      <span v-flip="task.owner" class="owner-mark" :title="`Owner: ${ownerLabel}`">
        <UiAvatar
          v-if="task.category === 'USER' || ownerAgent"
          :initials="ownerInitials"
          :variant="task.category === 'USER' ? 'secondary' : 'neutral'"
          size="xs"
        />
        <span v-else class="claude-avatar"><i class="claude-mark" /></span>
      </span>
    </BoardOwnerMenu>
  </div>
</template>

<style scoped>
.row {
  @apply flex items-center gap-1.75 rounded-lg border-t-2 border-t-transparent px-1.5 py-0.5;
}

.row[data-drop] {
  @apply border-t-primary;
}

.row:hover {
  @apply bg-sunken;
}

.handle {
  @apply inline-grid flex-none cursor-grab grid-cols-[repeat(2,2px)] gap-0.5 opacity-0 transition-opacity duration-(--duration-fast) ease-out;
}

.row:hover .handle {
  @apply opacity-100;
}

.pip {
  @apply size-0.5 rounded-full bg-subtle;
}

.box {
  @apply grid size-3.25 flex-none items-center justify-center rounded-sm border-2 border-border-strong;
}

.box[aria-pressed="true"] {
  @apply border-primary bg-primary;
}

.box[data-in-progress] {
  @apply border-primary;
}

.progress-dot {
  @apply size-1 rounded-full bg-primary;
}

.box svg {
  @apply size-2 fill-none stroke-primary-content stroke-3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.id {
  @apply flex-none text-muted tabular-nums;
}

.id[data-done] {
  @apply text-subtle;
}

.tag {
  @apply flex-none text-warning;
}

.text {
  @apply min-w-0 flex-1 truncate text-left typo-body leading-tight text-fg;
}

.text[data-expanded="true"] {
  @apply overflow-visible text-clip whitespace-normal;
}

.text[data-done] {
  @apply text-muted line-through;
}

.owner-mark {
  @apply inline-flex flex-none;
}

.owner-mark :deep([data-size="xs"]) {
  @apply size-4 typo-mono-pico font-sans;
}

.claude-avatar {
  @apply inline-flex size-4 flex-none items-center justify-center rounded-full border border-border-strong bg-sunken;
}

/* mask-image, not an <img>: the source SVG's own fill can't reach a token, but the mask's alpha
   channel lets this element's background paint it, so the glyph follows the theme like everything else. */
.claude-mark {
  @apply block size-2.25 bg-muted mask-[url(/assets/entity-static.svg)] mask-contain mask-center mask-no-repeat;
}
</style>
