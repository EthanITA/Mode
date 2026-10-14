<script lang="ts" setup>
import { File as FileIcon } from "@lucide/vue";
import type { FileBody, RestoreNotice } from "~/composables/useHistory";
import type { RestorePlan, Turn, TurnFile } from "~/utils/turns";

const {
  file,
  turn,
  body,
  plan,
  notice,
  cwd,
  isRestoring = false,
  isCompact = true,
  isWrapped = true,
} = defineProps<{
  file: TurnFile;
  turn: Turn;
  body: FileBody;
  plan: RestorePlan;
  notice?: RestoreNotice;
  cwd?: string;
  isRestoring?: boolean;
  isCompact?: boolean;
  isWrapped?: boolean;
}>();
const emit = defineEmits<{ restore: [force: boolean]; undo: [] }>();

const point = computed(() => Turns.pointOf(turn));
const shown = computed(() =>
  cwd && file.path.startsWith(`${cwd}/`) ? file.path.slice(cwd.length + 1) : homePath(file.path),
);
const paired = computed(() => (body.kind === "paired" ? body.file : undefined));
const note = computed(() => (body.kind === "reading" || body.kind === "pending" ? undefined : Diff.stateNote(body)));

const said = computed(() => {
  if (!notice) return "";
  switch (notice.kind) {
    case "restored":
      return `Put ${file.name} back the way it was before ${point.value}.`;
    case "undone":
      return `${file.name} is back to what it was before the restore.`;
    case "conflict":
      return `${file.name} changed outside this conversation since, by hand or from another session. Restoring overwrites that.`;
    case "failed":
      return `Couldn't restore ${file.name}, because ${notice.reason}.`;
  }
});

const tell = computed(() => {
  const churn = file.churn
    ? `+${file.churn.added} −${file.churn.removed} in ${point.value}`
    : `changed in ${point.value}`;
  return `About ${homePath(file.path)}, ${churn}:`;
});
</script>

<template>
  <section class="file" :data-path="file.path" :data-kind="file.kind">
    <header
      class="head"
      data-cmt="file"
      :data-cmt-label="file.name"
      :data-cmt-tell="tell"
      :data-cmt-excerpt="homePath(file.path)"
    >
      <UiIcon class="icon" :icon="FileIcon" size="xs" />
      <span class="path" :title="homePath(file.path)">{{ shown }}</span>
      <span v-if="file.churn" class="churn mono-meta">
        <span data-tone="add">+{{ file.churn.added }}</span>
        <span data-tone="remove">−{{ file.churn.removed }}</span>
      </span>
      <span v-if="file.kind === 'created' || file.kind === 'deleted'" class="chip mono-meta">
        {{ file.kind === "created" ? "new" : "deleted" }} in {{ turn.isOpen ? "this work" : "this turn" }}
      </span>
      <span class="spacer" />
      <button
        v-press
        class="restore focusable"
        type="button"
        :aria-disabled="!plan.isEnabled"
        :data-tip="plan.tip"
        :disabled="isRestoring"
        @click="plan.isEnabled && emit('restore', false)"
      >
        {{ isRestoring ? "Restoring…" : "Restore" }}
      </button>
    </header>

    <div v-if="notice" class="notice" :data-kind="notice.kind" role="status">
      <span>{{ said }}</span>
      <button
        v-if="notice.kind === 'restored' && typeof notice.was === 'number'"
        v-press
        class="act focusable"
        type="button"
        :disabled="isRestoring"
        @click="emit('undo')"
      >
        Undo
      </button>
      <!-- Overwriting work we never wrote is a second, deliberate act, never a retry of the first. -->
      <button
        v-else-if="notice.kind === 'conflict'"
        v-press
        class="act focusable"
        type="button"
        data-tone="warn"
        :disabled="isRestoring"
        @click="emit('restore', true)"
      >
        Overwrite anyway
      </button>
    </div>

    <DiffSideBySide v-if="paired" :file="paired" :is-compact="isCompact" :is-wrapped="isWrapped" is-readonly />
    <p v-else-if="body.kind === 'reading'" class="note" aria-busy="true">Reading…</p>
    <p v-else-if="body.kind === 'pending'" class="note">
      Not in the version store yet. It shows up once the store catches up.
    </p>
    <p v-else-if="note" class="note" :data-tone="note.tone">{{ note.text }}</p>
  </section>
</template>

<style scoped>
.head {
  align-items: center;
  background: var(--ed-bar);
  border-bottom: 1px solid var(--ed-border);
  border-top: 1px solid var(--ed-border);
  color: var(--ed-muted);
  display: flex;
  gap: 8px;
  padding: 6px 10px 6px 14px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.icon {
  flex: none;
}

.path {
  color: var(--ed-ink);
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.churn {
  display: inline-flex;
  flex: none;
  gap: 6px;
}

[data-tone="add"] {
  color: var(--ed-add-ink);
}

[data-tone="remove"] {
  color: var(--ed-remove-ink);
}

.chip {
  border: 1px solid var(--ed-button);
  border-radius: 999px;
  color: var(--ed-muted);
  flex: none;
  padding: 0 6px;
  text-transform: none;
}

.file[data-kind="deleted"] .chip {
  color: var(--ed-remove-ink);
}

.spacer {
  flex: 1;
}

.restore,
.act {
  background: var(--ed-button);
  border: 1px solid var(--ed-button);
  border-radius: 999px;
  color: var(--ed-ink);
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  transition: border-color var(--duration-fast) var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .restore:not([aria-disabled="true"]):hover,
  .act:hover {
    border-color: var(--ed-muted);
  }
}

/* Still focusable and still tipped, so the reason it is off stays one hover away. */
.restore[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.45;
}

.restore:disabled,
.act:disabled {
  cursor: progress;
}

.notice {
  align-items: center;
  background: color-mix(in oklch, var(--ed-warn) 14%, var(--ed-bg));
  color: var(--ed-warn);
  display: flex;
  font-family: var(--sans);
  font-size: 12.5px;
  gap: 10px;
  line-height: 1.5;
  padding: 8px 14px;
}

.notice[data-kind="restored"],
.notice[data-kind="undone"] {
  background: color-mix(in oklch, var(--ed-add-ink) 12%, var(--ed-bg));
  color: var(--ed-add-ink);
}

.act {
  margin-left: auto;
}

.act[data-tone="warn"] {
  background: var(--ed-warn);
  border-color: var(--ed-warn);
  color: var(--ed-bg);
}

.note {
  color: var(--ed-muted);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
  padding: 10px 14px;
}

/* A gap we could not fill never renders as a quiet nothing. */
.note[data-tone="loud"] {
  border-left: 3px solid var(--ed-warn);
  color: var(--ed-warn);
  font-family: var(--sans);
  font-size: 12.5px;
}
</style>
