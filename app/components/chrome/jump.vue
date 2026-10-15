<script lang="ts" setup>
import type { Tint } from "~/utils/tint";

interface JumpRow {
  key: string;
  live: boolean;
  name: string;
  tint: Tint;
  where: string;
}

const sc = useSidecar();
const chrome = useChrome();

const query = ref("");
const cursor = ref(0);
const field = useTemplateRef<HTMLElement>("field");
let cameFrom: HTMLElement | undefined;

const rows = computed<JumpRow[]>(() => {
  const needle = query.value.trim().toLowerCase();
  return sc.sessions.value
    .map((session) => ({
      key: session.key,
      live: session.live,
      name: nameOf(session),
      tint: tintOf(session.color, session.key),
      where: homePath(session.cwd),
    }))
    .filter((row) => !needle || `${row.name} ${row.where}`.toLowerCase().includes(needle));
});

const active = computed(() => {
  const row = rows.value[cursor.value];
  return row && `jump-${row.key}`;
});

// The five-second poll can shrink the list out from under the cursor mid-type.
watch(rows, () => (cursor.value = Math.min(cursor.value, Math.max(rows.value.length - 1, 0))));

watch(chrome.jump.open, async (on) => {
  if (!on) {
    cameFrom?.focus();
    cameFrom = undefined;
    return;
  }
  cameFrom = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  query.value = "";
  cursor.value = 0;
  await nextTick();
  field.value?.querySelector("input")?.focus();
});

function go(row?: JumpRow): void {
  if (!row) return;
  chrome.jump.close();
  sc.sessionKey.value = row.key;
  // Switching conversations is not a step to come back from, so the sidecar keeps no trail of them.
  void navigateTo(`/c/${row.key}`, { replace: true });
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    cursor.value = Math.min(cursor.value + 1, rows.value.length - 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    cursor.value = Math.max(cursor.value - 1, 0);
  } else if (event.key === "Enter") {
    event.preventDefault();
    go(rows.value[cursor.value]);
  }
}
</script>

<template>
  <div v-if="chrome.jump.open.value">
    <div class="scrim" @click="chrome.jump.close()" />

    <div class="at">
      <UiSurface
        v-island-pop="'top center'"
        class="palette"
        data-region="jump-palette"
        pad="none"
        variant="raised"
        role="dialog"
        aria-label="Jump to a conversation"
        data-tip="Close · {esc}"
      >
        <div ref="field" class="field">
          <UiTextInput
            v-model="query"
            aria-controls="jump-rows"
            aria-expanded="true"
            :aria-activedescendant="active"
            aria-label="Filter conversations by name"
            placeholder="Jump to a conversation…"
            role="combobox"
            type="search"
            variant="bare"
            @keydown="onKey"
          />
        </div>

        <div
          id="jump-rows"
          class="rows"
          role="listbox"
          aria-label="Conversations"
          :data-tip="rows.length ? 'Open · {enter}, {up down} moves' : undefined"
        >
          <UiMenuItem
            v-for="(row, at) in rows"
            :id="`jump-${row.key}`"
            :key="row.key"
            :aria-selected="at === cursor"
            class="row"
            role="option"
            @click="go(row)"
            @mousemove="cursor = at"
          >
            <span class="dot" :data-live="row.live" :data-tint="row.tint" />
            <span class="name">{{ row.name }}</span>
            <span class="where mono-meta">{{ row.where }}</span>
          </UiMenuItem>

          <p v-if="!rows.length" class="none">
            {{ sc.sessions.value.length ? "No conversation matches that." : "No conversation is running." }}
          </p>
        </div>
      </UiSurface>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  @apply fixed inset-0 z-39 bg-fg/12;
}

/* The centring transform lives out here, because v-island-pop writes its own onto the element. */
.at {
  @apply fixed top-22 left-1/2 z-40 -translate-x-1/2;
}

.palette {
  @apply flex w-120 max-w-[calc(100vw_-_32px)] flex-col overflow-hidden;
}

.field {
  @apply flex h-12.5 items-center border-b border-b-border px-4 py-0;
}

.rows {
  @apply flex max-h-[46vh] flex-col overflow-y-auto p-1.5;
}

.row {
  @apply px-2.5 py-2.25;
}

.rows :deep([aria-selected="true"]) {
  @apply bg-primary-soft text-fg;
}

.dot {
  @apply size-2 flex-none rounded-full bg-tint opacity-40;
}

.dot[data-live="true"] {
  @apply opacity-100;
}

.name {
  @apply min-w-0 flex-1 truncate text-[12.5px] font-semibold;
}

.where {
  @apply max-w-[45%] flex-none truncate text-subtle normal-case;
}

.none {
  @apply m-0 p-2.5 text-[12.5px] text-subtle;
}
</style>
