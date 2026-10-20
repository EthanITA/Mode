<script lang="ts" setup>
import { ContextMenu, useShortcuts } from "@cela/design";
import { Maximize2, Trash2 } from "@lucide/vue";
import type { DeskRow } from "~/composables/useDesk";

const emit = defineEmits<{ back: []; open: [key: string]; remove: [row: DeskRow] }>();

const sc = useSidecar();
const chrome = useChrome();
const { rows, needs, working } = useDesk();

// -1 until a key or the pointer picks a row, so nothing reads as hovered on arrival.
const cursor = ref(-1);
const menuEl = useTemplateRef<InstanceType<typeof ContextMenu>>("menuEl");
const target = ref<DeskRow>();
// Reset on open: a menu that reopens still armed would delete on a single press.
const isArming = ref(false);

const heading = computed(() =>
  needs.value
    ? `${plural(needs.value, "conversation")} ${needs.value === 1 ? "needs" : "need"} you`
    : "Nothing needs you",
);

// Counts only the working lane, since a finished conversation is not working on its own.
const hint = computed(() => {
  if (!rows.value.length) return "No conversations yet. Start one in Claude Code and it shows up here.";
  const n = working.value;
  const own = n === 1 ? "is working on its own." : "are working on their own.";
  if (needs.value) return n ? `${n === 1 ? "1 other" : `${n} others`} ${own}` : "";
  const calm = "Anything that stops for you comes to the top.";
  return n ? `${plural(n, "conversation")} ${own} ${calm}` : calm;
});

const active = computed(() => {
  const row = rows.value[cursor.value];
  return row && `desk-${row.key}`;
});

// The five-second poll can shrink the list out from under the cursor.
watch(rows, () => (cursor.value = Math.min(cursor.value, rows.value.length - 1)));

function move(step: number): void {
  if (!rows.value.length) return;
  const from = cursor.value < 0 && step < 0 ? rows.value.length : cursor.value;
  cursor.value = Math.min(Math.max(from + step, 0), rows.value.length - 1);
  void nextTick(() => active.value && document.getElementById(active.value)?.scrollIntoView({ block: "nearest" }));
}

// False hands Enter back, so a focused button such as Back still activates.
function openPicked(): boolean {
  const row = rows.value[cursor.value];
  if (!row || document.activeElement?.closest("button, a[href], [role='link']")) return false;
  emit("open", row.key);
  return true;
}

function onMenu(event: MouseEvent, row: DeskRow): void {
  target.value = row;
  isArming.value = false;
  menuEl.value?.openAt(event.clientX, event.clientY);
}

function askRemove(row: DeskRow, close: () => void): void {
  if (!isArming.value) {
    isArming.value = true;
    return;
  }
  isArming.value = false;
  close();
  emit("remove", row);
}

useShortcuts(
  {
    ArrowDown: { repeat: true, run: () => move(1) },
    ArrowUp: { repeat: true, run: () => move(-1) },
    Enter: openPicked,
    Escape: () => {
      if (!chrome.dismiss()) emit("back");
    },
  },
  { when: () => !sc.failure.value },
);
</script>

<template>
  <main class="stage" data-region="desk">
    <div class="column">
      <div class="lead">
        <ListeningTag />
        <h1 class="title">{{ heading }}</h1>
        <p v-if="hint" class="hint">{{ hint }}</p>
      </div>

      <div
        v-if="rows.length"
        class="rows"
        role="listbox"
        aria-label="Conversations"
        data-tip="Open · {enter}, {up down} moves"
        :aria-activedescendant="active"
      >
        <div
          v-for="(row, at) in rows"
          :id="`desk-${row.key}`"
          :key="row.key"
          class="row"
          role="option"
          data-region="desk-row"
          data-cmt="conversation"
          :aria-selected="at === cursor"
          :data-cmt-label="row.title"
          :data-cmt-tell="`the ${row.title} conversation on the desk`"
          @click="emit('open', row.key)"
          @contextmenu.prevent="onMenu($event, row)"
          @mousemove="cursor = at"
        >
          <div class="row-head">
            <span class="dot" :data-live="row.live" :data-tint="row.tint" />
            <span class="name">{{ row.title }}</span>
            <span v-if="row.ago" class="ago">{{ row.ago }}</span>
          </div>
          <p class="about">{{ row.about }}</p>
        </div>
      </div>
    </div>

    <UiContextMenu ref="menuEl" data-region="desk-menu" label="Conversation" width="w-64">
      <template #default="{ close }">
        <p class="menu-head mono-meta">{{ target?.title }}</p>
        <template v-if="target">
          <UiMenuItem
            :icon="Maximize2"
            @click="
              emit('open', target.key);
              close();
            "
            >Open</UiMenuItem
          >
          <UiMenuItem :icon="Trash2" tone="destructive" @click="askRemove(target, close)">
            {{ isArming ? "Press again to delete" : "Delete" }}
          </UiMenuItem>
        </template>
      </template>
    </UiContextMenu>
  </main>
</template>

<style scoped>
/* Margin auto centres the column and still lets a long desk scroll it from the top. */
.stage {
  @apply absolute inset-0 grid overflow-y-auto;
}

.column {
  @apply m-auto flex w-120 max-w-[calc(100%_-_2_*_var(--gutter))] flex-col gap-6 px-0 py-(--stage-top);
}

.lead {
  @apply flex flex-col gap-2.5;
}

.title {
  @apply m-0 typo-heading-xl font-extrabold text-fg;
}

.hint {
  @apply m-0 typo-body-md text-muted;
}

.rows {
  @apply flex flex-col gap-0.5;
}

.row {
  @apply -mx-2 my-0 flex cursor-pointer flex-col gap-0.5 rounded-field p-2;
}

.row[aria-selected="true"] {
  @apply bg-sunken;
}

.row-head {
  @apply flex min-w-0 items-center gap-3 typo-body;
}

.dot {
  @apply size-2 bg-tint opacity-40;
}

.dot[data-live="true"] {
  @apply opacity-100;
}

.name {
  @apply min-w-0 flex-1 truncate font-semibold text-fg;
}

.ago {
  @apply flex-none typo-mono-meta text-muted;
}

.about {
  @apply m-0 line-clamp-2 pl-5 typo-body text-muted;
}

.menu-head {
  @apply truncate px-2.5 pt-1.5 pb-1 text-subtle;
}
</style>
