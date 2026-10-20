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
// Only a diff that was waited on fades in, so stepping through turns already read stays instant.
const waited = ref(body.kind === "reading");
watch(
  () => body.kind,
  (kind) => {
    if (kind === "reading") waited.value = true;
  },
);
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
      <span class="path" :data-tip="homePath(file.path)">{{ shown }}</span>
      <span v-if="file.churn" class="churn mono-meta">
        <span data-tone="add">+{{ file.churn.added }}</span>
        <span data-tone="remove">−{{ file.churn.removed }}</span>
      </span>
      <UiBadge v-if="file.kind === 'created' || file.kind === 'deleted'" size="xs" :tone="file.kind === 'deleted' ? 'error' : 'neutral'">
        {{ file.kind === "created" ? "new" : "deleted" }} in {{ turn.isOpen ? "this work" : "this turn" }}
      </UiBadge>
      <span class="spacer" />
      <UiButton
        :aria-disabled="!plan.isEnabled"
        :data-tip="plan.tip"
        :disabled="isRestoring"
        size="xs"
        variant="outline"
        @click="plan.isEnabled && emit('restore', false)"
      >
        {{ isRestoring ? "Restoring…" : "Restore" }}
      </UiButton>
    </header>

    <UiSurface
      v-if="notice"
      class="notice"
      pad="xs"
      role="status"
      :tone="notice.kind === 'restored' || notice.kind === 'undone' ? 'success' : 'warning'"
      variant="banner"
    >
      <span>{{ said }}</span>
      <UiButton
        v-if="notice.kind === 'restored' && typeof notice.was === 'number'"
        class="act"
        :disabled="isRestoring"
        size="xs"
        variant="outline"
        @click="emit('undo')"
      >
        Undo
      </UiButton>
      <!-- Overwriting work we never wrote is a second, deliberate act, never a retry of the first. -->
      <UiButton
        v-else-if="notice.kind === 'conflict'"
        class="act"
        :disabled="isRestoring"
        size="xs"
        variant="destructive"
        @click="emit('restore', true)"
      >
        Overwrite anyway
      </UiButton>
    </UiSurface>

    <DiffSideBySide
      v-if="paired"
      class="diff"
      :data-waited="waited"
      :file="paired"
      :is-compact="isCompact"
      :is-wrapped="isWrapped"
      is-readonly
    />
    <p v-else-if="body.kind === 'reading'" class="note" aria-busy="true">Reading…</p>
    <p v-else-if="body.kind === 'pending'" class="note">
      Not in the version store yet. It shows up once the store catches up.
    </p>
    <UiSurface v-else-if="note?.tone === 'loud'" class="notice" pad="xs" tone="warning" variant="banner">
      {{ note.text }}
    </UiSurface>
    <p v-else-if="note" class="note">{{ note.text }}</p>
  </section>
</template>

<style scoped>
.file {
  @apply editor-tokens;
}

.head {
  @apply sticky top-0 z-2 flex items-center gap-2 border-t border-b border-t-ed-border border-b-ed-border bg-ed-bar py-1.5 pr-2.5 pl-3.5 text-ed-muted;
}

.icon {
  @apply flex-none;
}

.path {
  @apply min-w-0 truncate font-mono typo-caption-strong text-ed-ink;
}

.churn {
  @apply inline-flex flex-none gap-1.5;
}

[data-tone="add"] {
  @apply text-ed-add-ink;
}

[data-tone="remove"] {
  @apply text-ed-remove-ink;
}

.spacer {
  @apply flex-1;
}

.notice {
  @apply m-2 font-sans typo-body;
}

.act {
  @apply ml-auto;
}

.note {
  @apply m-0 px-3.5 py-2.5 typo-mono-meta leading-normal text-ed-muted;
}

.note[aria-busy="true"] {
  @apply settle-late;
}

.diff[data-waited="true"] {
  @apply settle;
}
</style>
