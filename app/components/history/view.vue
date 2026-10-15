<script lang="ts" setup>
import { useShortcuts } from "@cela/design";
import { ChevronDown, ChevronUp, FoldVertical, TextWrap } from "@lucide/vue";
import { useNow } from "@vueuse/core";
import { OneDarkVivid } from "~/utils/monaco/one-dark-vivid";

const sc = useSidecar();
const shown = useFaceShown();
const history = useHistory();
const review = useReview();
const now = useNow({ interval: 30_000 });
const { initial: sideInitial, width: side } = usePaneWidth();

const isChangesOnly = ref(false);
// The turn picked when changes only went on stays listed until the reader moves.
const kept = ref<number>();
const inView = ref<string>();
const isAskOpen = ref(false);
const isReplyOpen = ref(false);
const listEl = useTemplateRef<HTMLElement>("listEl");
const bodyEl = useTemplateRef<HTMLElement>("bodyEl");

const turn = computed(() => history.picked.value);
const cwd = computed(() => sc.sessions.value.find((one) => one.key === sc.sessionKey.value)?.cwd);
const asked = computed(() => history.turns.value.filter((one) => !one.isOpen).length);

const visible = computed(() =>
  history.turns.value.filter(
    (one) => !isChangesOnly.value || one.files.length || one.state !== "done" || one.turn === kept.value,
  ),
);

// The divider sits under the turns that landed since the reader last looked, and only when some did.
const dividerAt = computed(() => {
  const seen = history.seen.value;
  const [first] = visible.value;
  if (!seen || !first || first.turn <= seen) return undefined;
  return visible.value.find((one) => one.turn <= seen)?.turn;
});

const at = computed(() => visible.value.findIndex((one) => one.turn === turn.value?.turn));
const isNewest = computed(() => at.value <= 0);
const isOldest = computed(() => at.value < 0 || at.value >= visible.value.length - 1);

const eyebrow = computed(() => {
  const one = turn.value;
  if (!one) return "";
  const age = relativeAge(new Date(one.at).toISOString(), now.value.getTime());
  const when = age === "just now" ? age : `${age} ago`;
  return `${one.isOpen ? `After turn ${one.turn - 1}` : `Turn ${one.turn}`} · ${when}`;
});

const sides = computed(() => {
  const point = turn.value?.isOpen ? "this work" : `turn ${turn.value?.turn}`;
  return [`Before ${point}`, `After ${point}`];
});

const quiet = computed(() => {
  const one = turn.value;
  if (!one || one.files.length) return "";
  const label = one.isOpen ? "This work" : `Turn ${one.turn}`;
  if (one.state === "running") return `${label} is still running. Its changes show up here as Claude makes them.`;
  if (one.state === "waiting") return `${label} is waiting on you. Its changes show up here as Claude makes them.`;
  // Receipts only see deletes done with rm, so a command may have written what History can't show.
  if (one.commands)
    return `Claude made no edits in this turn. It ran ${plural(one.commands, "command")}, and History can't see what a command writes.`;
  return "No files changed in this turn. Claude read and answered.";
});

function pick(next: number): void {
  kept.value = undefined;
  history.pick(next);
}

function step(by: number): void {
  const rows = visible.value;
  const next = rows[Math.min(Math.max(Math.max(at.value, 0) + by, 0), rows.length - 1)];
  if (next && next.turn !== turn.value?.turn) pick(next.turn);
}

function toggleChanges(): void {
  kept.value = isChangesOnly.value ? undefined : turn.value?.turn;
  isChangesOnly.value = !isChangesOnly.value;
}

function showFile(path: string): void {
  const body = bodyEl.value;
  const section = body?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
  if (!body || !section) return;
  body.scrollTop = section.offsetTop;
  inView.value = path;
}

// Follows whichever file header the diff has scrolled under, so the list marks what is on screen.
function onScroll(): void {
  const body = bodyEl.value;
  if (!body) return;
  let current = turn.value?.files[0]?.path;
  for (const section of body.querySelectorAll<HTMLElement>("[data-path]")) {
    if (section.offsetTop > body.scrollTop + 4) break;
    current = section.dataset.path;
  }
  inView.value = current;
}

watch(
  () => turn.value?.turn,
  () => {
    isAskOpen.value = false;
    isReplyOpen.value = false;
    inView.value = turn.value?.files[0]?.path;
    void nextTick(() => {
      if (bodyEl.value) bodyEl.value.scrollTop = 0;
      listEl.value?.querySelector("[aria-current='true']")?.scrollIntoView({ block: "nearest" });
    });
  },
  { immediate: true },
);

useShortcuts(
  {
    ArrowDown: { repeat: true, run: () => step(1) },
    ArrowUp: { repeat: true, run: () => step(-1) },
    J: { repeat: true, run: () => step(1) },
    K: { repeat: true, run: () => step(-1) },
  },
  { when: () => shown.value && !sc.failure.value },
);
</script>

<template>
  <section class="history" data-region="history" :style="{ '--side-w': `${side}px` }">
    <UiSurface class="pane" data-region="history-turns" pad="none" variant="raised">
      <header class="bar">
        <span class="title">Turns</span>
        <span class="meta mono-meta">{{ plural(asked, "turn") }}</span>
        <span class="spacer" />
        <UiChip
          v-if="history.turns.value.length"
          :selected="isChangesOnly"
          size="xs"
          :title="isChangesOnly ? 'Show every turn' : 'Hide turns that changed nothing'"
          @click="toggleChanges"
        >
          changes only
        </UiChip>
      </header>

      <div ref="listEl" v-fade="history.loading.value" class="scroll" data-scroll="turns">
        <UiStateMessage v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</UiStateMessage>
        <UiStateMessage v-else-if="history.loading.value" class="empty" kind="loading">
          Reading the turns…
        </UiStateMessage>
        <UiStateMessage v-else-if="history.error.value" class="empty" kind="error">
          Couldn't read this conversation's turns.
          <template #action>
            <button v-press class="again focusable" type="button" :title="history.error.value" @click="history.retry()">
              Try again
            </button>
          </template>
        </UiStateMessage>
        <UiStateMessage v-else-if="!history.turns.value.length" class="empty">
          No turns have been recorded for this conversation.
        </UiStateMessage>
        <UiStateMessage v-else-if="!visible.length" class="empty">No turn has changed a file yet.</UiStateMessage>

        <template v-for="one in visible" :key="one.turn">
          <p v-if="one.turn === dividerAt" class="divider mono-meta">new since you looked</p>
          <HistoryTurn
            :in-view="inView"
            :is-picked="one.turn === turn?.turn"
            :now="now.getTime()"
            :turn="one"
            @file="showFile"
            @pick="pick(one.turn)"
          />
        </template>
      </div>
    </UiSurface>

    <PaneResizer v-model="side" :initial="sideInitial" label="Resize the turns pane" />

    <UiSurface v-fade="!!turn" class="pane" data-region="history-changes" pad="none" variant="raised">
      <template v-if="turn">
        <header class="bar" data-layout="stacked">
          <div class="line">
            <span class="eyebrow mono-meta">{{ eyebrow }}</span>
            <span v-for="agent in turn.agents" :key="agent" class="agent mono-meta">{{ authorOf(agent) }}</span>
            <span class="spacer" />
            <ChromeAction
              class="step"
              :disabled="isNewest"
              :icon="ChevronUp"
              shape="pill"
              tip="Newer turn · {K}"
              @click="step(-1)"
            />
            <ChromeAction
              class="step"
              :disabled="isOldest"
              :icon="ChevronDown"
              shape="pill"
              tip="Older turn · {J}"
              @click="step(1)"
            />
          </div>
          <button
            v-if="turn.prompt"
            class="ask plain-button"
            type="button"
            :aria-expanded="isAskOpen"
            @click="isAskOpen = !isAskOpen"
          >
            {{ turn.prompt }}
          </button>
          <p v-else class="ask" data-open="true">Agents kept working after turn {{ turn.turn - 1 }}</p>
          <div v-if="turn.reply" class="say">
            <span class="mark" aria-hidden="true">C</span>
            <button
              class="reply plain-button"
              type="button"
              :aria-expanded="isReplyOpen"
              @click="isReplyOpen = !isReplyOpen"
            >
              {{ turn.reply }}
            </button>
          </div>
          <div class="line">
            <HistoryMeta :turn="turn" />
            <span class="spacer" />
            <span v-if="turn.files.length" class="group">
              <ChromeAction
                :icon="FoldVertical"
                :is-on="review.isCompact.value"
                shape="pill"
                tip="Hide unchanged lines"
                @click="review.isCompact.value = !review.isCompact.value"
              />
              <ChromeAction
                :icon="TextWrap"
                :is-on="review.isWrapped.value"
                shape="pill"
                tip="Wrap long lines"
                @click="review.isWrapped.value = !review.isWrapped.value"
              />
            </span>
          </div>
        </header>

        <p v-if="history.capped.value" class="notice" role="status">
          The version store hit its size budget for this conversation, so some files were never kept. Anything missing
          below is missing from the store, not from the conversation.
        </p>

        <template v-if="turn.files.length">
          <div class="heads mono-meta" :style="OneDarkVivid.cssVars">
            <span>{{ sides[0] }}</span>
            <span>{{ sides[1] }}</span>
          </div>
          <div ref="bodyEl" class="changes" :style="OneDarkVivid.cssVars" @scroll.passive="onScroll">
            <HistoryFile
              v-for="file in turn.files"
              :key="file.path"
              :body="history.bodyOf(file)"
              :cwd="cwd"
              :file="file"
              :is-compact="review.isCompact.value"
              :is-restoring="history.restoring.value === file.path"
              :is-wrapped="review.isWrapped.value"
              :notice="history.notices.value[file.path]"
              :plan="history.planOf(file)"
              :turn="turn"
              @restore="(force) => history.restore(file, force)"
              @undo="history.undo(file)"
            />
          </div>
        </template>
        <div v-else class="quiet">
          <span v-if="turn.state !== 'done'" class="pulse dot" :data-tone="turn.state" aria-hidden="true" />
          <p>{{ quiet }}</p>
        </div>
      </template>

      <UiStateMessage v-else-if="history.loading.value" align="center" kind="loading"
        >Reading the turns…</UiStateMessage
      >
      <UiStateMessage v-else align="center">Pick a turn to see what it changed.</UiStateMessage>
    </UiSurface>
  </section>
</template>

<style scoped>
/* The middle track is the resizer's; half the face caps a width remembered from a wider window. */
.history {
  @apply grid h-full min-h-0 grid-cols-pane gap-x-2;
}

.pane {
  @apply flex min-h-0 flex-col overflow-hidden;
}

.bar {
  @apply flex flex-none items-center gap-2 border-b border-b-border py-2.5 pr-2.5 pl-3.5;
}

.bar[data-layout="stacked"] {
  @apply flex-col items-stretch px-3.5 pt-3 pb-2.5;
}

.line {
  @apply flex min-h-6.5 min-w-0 items-center gap-2;
}

.title {
  @apply typo-body-strong font-bold;
}

.meta {
  @apply text-muted normal-case;
}

.spacer {
  @apply flex-1;
}

.group {
  @apply inline-flex flex-none gap-1;
}

.eyebrow {
  @apply text-subtle;
}

.agent {
  @apply rounded-full bg-primary-soft px-1.75 py-px text-primary-deep normal-case;
}

.step:disabled {
  @apply cursor-default opacity-35;
}

/* Prompts run to 400 characters and replies have no bound, so both fold to three lines until asked. */
.ask,
.reply {
  @apply m-0 line-clamp-3 text-left text-pretty wrap-anywhere whitespace-pre-line;
}

.ask[aria-expanded="true"],
.reply[aria-expanded="true"],
.ask[data-open="true"] {
  @apply line-clamp-none;
}

.ask {
  @apply typo-heading-md text-fg;
}

p.ask {
  @apply text-muted;
}

.say {
  @apply flex max-w-220 gap-2;
}

.mark {
  @apply mt-px flex size-4.5 flex-none items-center justify-center rounded-full bg-primary-soft typo-mono-micro font-semibold text-primary-deep;
}

.reply {
  @apply typo-body text-muted;
}

.scroll {
  @apply flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1.5 pb-(--float-clear);
}

/* A column flex item shrinks by default, so long content squeezed every row instead of scrolling. */
.scroll > * {
  @apply shrink-0;
}

.divider {
  @apply mx-0 mt-2 mb-1.5 flex items-center gap-2.5 text-primary normal-case;
}

.divider::before,
.divider::after {
  @apply h-px flex-1 bg-primary content-[''];
}

.empty {
  @apply p-0.5;
}

.again {
  @apply mt-2 cursor-pointer rounded-full border border-border-strong bg-raised px-2.75 py-1 typo-caption-strong text-fg;
}

.notice {
  @apply m-0 flex-none bg-warning-soft px-3.5 py-2.25 typo-body text-warning;
}

.heads {
  @apply grid flex-none grid-cols-2 border-b border-b-ed-border bg-ed-bar py-1.25 pr-0 pl-13.5 text-ed-muted normal-case;
}

.changes {
  @apply relative min-h-0 flex-1 overflow-y-auto bg-ed-bg pb-(--float-clear);
}

.quiet {
  @apply flex flex-1 items-center justify-center gap-2.5 p-6 typo-body text-pretty text-muted;
}

.quiet p {
  @apply m-0 max-w-90 text-center;
}

.pulse {
  @apply breathe bg-primary;
  --dot-size: 8px;
}

/* Waiting on a person is not work in progress, so it holds still. */
.pulse[data-tone="waiting"] {
  @apply animate-none bg-warning;
}
</style>
