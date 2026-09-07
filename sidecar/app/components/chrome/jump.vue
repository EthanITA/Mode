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
const field = useTemplateRef<HTMLInputElement>("field");
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
  field.value?.focus();
});

function go(row?: JumpRow): void {
  if (!row) return;
  chrome.jump.close();
  sc.sessionKey.value = row.key;
  navigateTo(`/c/${row.key}`);
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
      >
        <div class="field">
          <input
            ref="field"
            v-model="query"
            class="input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="jump-rows"
            :aria-activedescendant="active"
            aria-label="Filter conversations by name"
            placeholder="Jump to a conversation…"
            @keydown="onKey"
          >
        </div>

        <div id="jump-rows" class="rows" role="listbox" aria-label="Conversations">
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

        <p class="legend mono-meta">↑↓ move · ↵ open · esc close</p>
      </UiSurface>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  background: color-mix(in oklch, var(--ink) 12%, transparent);
  inset: 0;
  position: fixed;
  z-index: 39;
}

/* The centring transform lives out here, because v-island-pop writes its own onto the element. */
.at {
  left: 50%;
  position: fixed;
  top: 88px;
  transform: translateX(-50%);
  z-index: 40;
}

.palette {
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  width: 480px;
}

.field {
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
}

.input {
  background: none;
  border: 0;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 13.5px;
  height: 34px;
  outline: none;
  padding: 0 6px;
  width: 100%;
}

.rows {
  display: flex;
  flex-direction: column;
  max-height: 46vh;
  overflow-y: auto;
  padding: 6px;
}

.row {
  padding: 9px 10px;
}

.rows :deep([aria-selected="true"]) {
  background: var(--primary-soft);
  color: var(--ink);
}

.dot {
  background: var(--tint);
  border-radius: 999px;
  flex: none;
  height: 8px;
  opacity: 0.4;
  width: 8px;
}

.dot[data-live="true"] {
  opacity: 1;
}

.name {
  flex: 1;
  font-size: 12.5px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.where {
  color: var(--subtle);
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.none {
  color: var(--subtle);
  font-size: 12.5px;
  margin: 0;
  padding: 10px;
}

.legend {
  border-top: 1px solid var(--border);
  color: var(--subtle);
  margin: 0;
  padding: 8px 14px;
  text-transform: none;
}
</style>
