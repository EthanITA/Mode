<script lang="ts" setup>
import { AppWindow, ArrowRight, Keyboard, Terminal } from "@lucide/vue";
import type { ListeningState } from "~/components/listening/tag.vue";

const { state = "listening" } = defineProps<{ state?: ListeningState }>();

const sc = useSidecar();
const { rows } = useDesk();

const last = computed(() => sc.sessions.value.find((session) => session.key === sc.sessionKey.value));
const hasOthers = computed(() => rows.value.some((row) => row.key !== last.value?.key));
const lastLabel = computed(() => {
  const ago = last.value && ageOf(last.value);
  return ago ? `Last conversation · ${ago}` : "Last conversation";
});

function resume(key: string): void {
  sc.sessionKey.value = key;
  void navigateTo(`/c/${key}`);
}
</script>

<template>
  <main class="stage" data-region="listening-stage">
    <div class="column">
      <!-- Down, nothing on offer works without the server, so the screen says only that. -->
      <div v-if="state === 'reconnecting'" class="lead" role="alert">
        <ListeningTag state="reconnecting" />
        <h1 class="title">Reconnecting…</h1>
        <p class="hint">
          Can't reach the sidecar server, retrying every few seconds. If it stays down, run
          <code>sidecar</code> in a terminal.
        </p>
      </div>

      <template v-else>
        <div class="lead">
          <ListeningTag />
          <h1 class="title">Waiting for Claude Code</h1>
          <p class="hint">The sidecar follows whichever conversation Claude Code points it at.</p>
        </div>

        <UiSurface v-if="last" class="last" data-region="listening-last" pad="none" variant="raised">
          <div class="last-text">
            <span class="eyebrow mono-meta">{{ lastLabel }}</span>
            <span class="last-name">{{ nameOf(last) }}</span>
            <span class="last-place mono-meta">{{ placeOf(last) }}</span>
          </div>
          <button v-press class="resume focusable" type="button" @click="resume(last.key)">
            Resume
            <UiIcon :icon="ArrowRight" size="xs" />
          </button>
        </UiSurface>

        <div class="ways">
          <span v-if="sc.ready.value" class="eyebrow mono-meta">
            {{ last ? "Or point it from Claude Code" : "Point it from Claude Code" }}
          </span>
          <div class="way">
            <span class="way-icon"><UiIcon :icon="Terminal" size="xs" /></span>
            <span>Run <code>/sidecar</code> in a conversation</span>
          </div>
          <div class="way">
            <span class="way-icon"><UiIcon :icon="Keyboard" size="xs" /></span>
            <span>Type in a conversation's prompt</span>
          </div>
          <div class="way">
            <span class="way-icon"><UiIcon :icon="AppWindow" size="xs" /></span>
            <span>Bring a conversation to the front in Terminal</span>
          </div>
        </div>

        <template v-if="last">
          <NuxtLink v-if="hasOthers" class="desk-link focusable" data-region="listening-desk" to="/desk">
            Pick another conversation on the Desk
          </NuxtLink>
          <span
            v-else
            aria-disabled="true"
            class="desk-link focusable"
            data-region="listening-desk"
            data-tip="No other conversations yet. Start one in Claude Code and it shows up here."
            data-tip-align="start"
            data-tip-side="top"
            role="link"
            tabindex="0"
          >
            Pick another conversation on the Desk
          </span>
        </template>
      </template>
    </div>
  </main>
</template>

<style scoped>
/* Margin auto centres the column and still lets a short window scroll it from the top. */
.stage {
  @apply absolute inset-0 grid overflow-y-auto;
}

.column {
  @apply m-auto flex w-110 max-w-[calc(100%_-_2_*_var(--gutter))] flex-col gap-6 px-0 py-(--stage-top);
}

.lead {
  @apply flex flex-col gap-2.5;
}

.title {
  @apply m-0 typo-heading-xl font-extrabold text-fg;
}

.hint {
  @apply m-0 typo-body-md text-pretty text-muted;
}

code {
  @apply rounded-md bg-sunken px-1.5 py-px font-mono typo-caption text-fg;
}

.last {
  @apply flex items-center gap-3.5 p-4;
}

.last-text {
  @apply flex min-w-0 flex-1 flex-col gap-1;
}

.eyebrow {
  @apply text-subtle;
}

.last-name {
  @apply truncate typo-heading-md;
}

.last-place {
  @apply truncate text-subtle normal-case;
}

.resume {
  @apply inline-flex h-8.5 flex-none cursor-pointer items-center gap-1.5 rounded-full border-0 bg-primary px-4 py-0 typo-body-strong text-primary-content;
}

.ways {
  @apply flex flex-col gap-2.5;
}

.way {
  @apply flex items-center gap-3 typo-body;
}

.way-icon {
  @apply grid size-7 flex-none place-items-center rounded-full bg-sunken text-muted;
}

.desk-link {
  @apply self-start rounded-sm typo-body-strong text-primary-deep no-underline;
}

.desk-link:hover {
  @apply text-primary underline;
}

.desk-link[aria-disabled="true"] {
  @apply cursor-not-allowed text-subtle no-underline;
}
</style>
