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
  display: grid;
  inset: 0;
  overflow-y: auto;
  position: absolute;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: auto;
  max-width: calc(100% - 2 * var(--gutter));
  padding: var(--stage-top) 0;
  width: 440px;
}

.lead {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.title {
  color: var(--ink);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
  margin: 0;
}

.hint {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.55;
  margin: 0;
  text-wrap: pretty;
}

code {
  background: var(--sunken);
  border-radius: 6px;
  color: var(--ink);
  font-family: var(--mono);
  font-size: 12px;
  padding: 1px 6px;
}

.last {
  align-items: center;
  border-radius: 20px;
  display: flex;
  gap: 14px;
  padding: 16px;
}

.last-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.eyebrow {
  color: var(--subtle);
}

.last-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.last-place {
  color: var(--subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.resume {
  align-items: center;
  background: var(--primary);
  border: 0;
  border-radius: 999px;
  color: var(--primary-content);
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
}

.ways {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.way {
  align-items: center;
  display: flex;
  font-size: 13px;
  gap: 12px;
}

.way-icon {
  background: var(--sunken);
  border-radius: 999px;
  color: var(--muted);
  display: grid;
  flex: none;
  height: 28px;
  place-items: center;
  width: 28px;
}

.desk-link {
  align-self: flex-start;
  border-radius: 4px;
  color: var(--primary-deep);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.desk-link:hover {
  color: var(--primary);
  text-decoration: underline;
}

.desk-link[aria-disabled="true"] {
  color: var(--subtle);
  cursor: not-allowed;
  text-decoration: none;
}
</style>
