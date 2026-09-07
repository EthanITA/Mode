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

function open(row?: JumpRow): void {
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
    open(rows.value[cursor.value]);
  }
}
</script>

<template>
  <div v-if="chrome.jump.open.value">
    <div class="scrim" @click="chrome.jump.close()" />

    <UiSurface
      class="palette"
      pad="none"
      role="dialog"
      aria-label="Jump to a conversation"
      variant="raised"
    >
      <div class="field">
        <input
          ref="field"
          v-model="query"
          class="input"
          type="text"
          placeholder="Jump to a conversation…"
          aria-label="Filter conversations by name"
          @keydown="onKey"
        >
      </div>

      <div class="rows">
        <button
          v-for="(row, at) in rows"
          :key="row.key"
          class="row focusable plain-button"
          type="button"
          :data-on="at === cursor"
          @click="open(row)"
          @mousemove="cursor = at"
        >
          <span class="dot" :data-tint="row.tint" :data-live="row.live" />
          <span class="name">{{ row.name }}</span>
          <span class="where mono-meta">{{ row.where }}</span>
        </button>

        <p v-if="!rows.length" class="none">
          {{ sc.sessions.value.length ? "No conversation matches that." : "No conversation is running." }}
        </p>
      </div>

      <p class="legend mono-meta">↑↓ move · ↵ open · esc close</p>
    </UiSurface>
  </div>
</template>

<style scoped>
.scrim {
  background: color-mix(in oklch, var(--ink) 12%, transparent);
  inset: 0;
  position: fixed;
  z-index: 39;
}

.palette {
  display: flex;
  flex-direction: column;
  left: 50%;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  position: fixed;
  top: 88px;
  transform: translateX(-50%);
  width: 480px;
  z-index: 40;
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
  align-items: center;
  border-radius: 8px;
  display: flex;
  gap: 10px;
  padding: 9px 10px;
  text-align: left;
}

.row[data-on="true"] {
  background: var(--sunken);
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
  color: var(--ink);
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
