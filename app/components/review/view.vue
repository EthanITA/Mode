<script lang="ts" setup>
import { Redo2, Undo2 } from "@lucide/vue";
import { useEventListener, useLocalStorage } from "@vueuse/core";
import { OneDarkVivid } from "~/utils/monaco/one-dark-vivid";
import type { ReviewPicks, ReviewRowRejected } from "~/utils/review";

const SIDE = 300;

const sc = useSidecar();
const chrome = useChrome();
const review = useReview();
const side = useLocalStorage("sc:pane:review", SIDE);

review.listen();

const files = computed(() => review.snapshot.value?.files ?? []);
const file = computed(() => review.file.value);
const isLive = computed(() => !!review.snapshot.value?.live);
const churn = computed(() => (file.value ? Review.counts(file.value) : undefined));
const picked = computed(() => (file.value ? Review.picksOf(file.value, review.picks.value) : { old: [], new: [] }));

const empty = computed(() => {
  if (!sc.sessionKey.value) return "No conversation is selected.";
  if (!review.snapshot.value) return "Reading the review…";
  return review.snapshot.value.turn
    ? "Every change is approved. The review is clean."
    : "Nothing captured yet. The sidecar mod records each file as Claude first changes it.";
});
const isReading = computed(() => !!sc.sessionKey.value && !review.snapshot.value);

// The popover sits under whatever asked for it.
function spotNear(event: MouseEvent): { x: number; y: number } {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return {
    x: Math.max(12, Math.min(box.left, window.innerWidth - 432)),
    y: Math.max(12, Math.min(box.top - 312, window.innerHeight - 312)),
  };
}

// The tray chip carries the quote and the lines.
function comment(event: MouseEvent, lines?: ReviewPicks, isRejected = false): void {
  const here = file.value;
  if (!here) return;
  const isNew = !!lines?.new.length;
  const span = lines && (isNew ? lines.new : lines.old);
  const source = isNew ? here.current : here.original;
  const where = span ? `${Review.spanOf(span)} of ${homePath(here.path)}` : homePath(here.path);
  const quote = span?.map((line) => source[line - 1] ?? "").join("\n");
  const about = span && !isNew ? `the removed original ${where}` : where;
  // The tray hands over a quote with its `path` and `file`, so the lines and the file travel with it.
  chrome.comment.open({
    excerpt: quote,
    file: span ? homePath(here.path) : undefined,
    kind: span ? "line" : "file",
    path: span ? Review.spanOf(span) : undefined,
    label: span ? `${basename(here.path)}:${span.join(",")}` : basename(here.path),
    quote,
    tell: isRejected ? `I rejected ${about}, because:` : `About ${about}:`,
    ...spotNear(event),
  });
}

function rejectedRow({ event, path, count }: ReviewRowRejected): void {
  const isFile = files.value.some((one) => one.path === path);
  const about = isFile ? homePath(path) : `${homePath(path)}/ (${plural(count, "file")})`;
  chrome.comment.open({
    kind: "file",
    label: isFile ? basename(path) : `${basename(path)}/`,
    tell: `I rejected ${about}, because:`,
    ...spotNear(event),
  });
}

// Captured, so a diff pane's own Monaco never takes ⌘Z, and the comment box keeps it for its text.
useEventListener(
  window,
  "keydown",
  (event: KeyboardEvent) => {
    if (event.key === "Escape" && review.confirming.value) {
      review.confirming.value = undefined;
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (target?.closest("input, textarea, [contenteditable]") && !target.closest(".monaco-editor")) return;
    event.preventDefault();
    event.stopPropagation();
    if (isLive.value && !review.busy.value) void review.travel(event.shiftKey ? "redo" : "undo");
  },
  { capture: true },
);

function rejectLines(event: MouseEvent): void {
  const lines = picked.value;
  void review.decideLines(false);
  comment(event, lines, true);
}

function decideHunk(change: number, isAccept: boolean, event: MouseEvent): void {
  const here = file.value;
  if (!here) return;
  void review.decideHunk(change, isAccept);
  if (!isAccept) comment(event, Review.hunkOf(here, change), true);
}

// The first press only arms the confirm, so the composer waits for the one that rejects.
function rejectFile(event: MouseEvent): void {
  const isConfirmed = review.confirming.value === file.value?.path;
  void review.decideFile(false);
  if (isConfirmed) comment(event, undefined, true);
}
</script>

<template>
  <section class="review" data-region="review" :style="{ '--side-w': `${side}px` }">
    <UiSurface class="pane" data-region="review-files" pad="none" variant="raised">
      <header class="bar">
        <span class="title">To review</span>
        <span class="meta mono-meta">{{ plural(files.length, "file") }}</span>
      </header>

      <div class="scroll" data-scroll="files">
        <UiStateMessage v-if="!files.length" class="empty" :kind="isReading ? 'loading' : 'empty'">{{
          empty
        }}</UiStateMessage>
        <ReviewFiles v-else @rejected="rejectedRow" />
      </div>

      <footer v-if="files.length || review.snapshot.value?.undo || review.snapshot.value?.redo" class="all">
        <ChromeAction
          v-if="review.snapshot.value?.undo"
          data-region="review-undo"
          :icon="Undo2"
          shape="pill"
          :tip="`Undo ${review.snapshot.value.undo} · ⌘Z`"
          @click="review.travel('undo')"
        />
        <ChromeAction
          v-if="review.snapshot.value?.redo"
          data-region="review-redo"
          :icon="Redo2"
          shape="pill"
          :tip="`Redo ${review.snapshot.value.redo} · ⌘⇧Z`"
          @click="review.travel('redo')"
        />
        <span class="spacer" />
        <button
          v-if="files.length"
          v-press
          class="action focusable"
          type="button"
          data-tone="danger"
          :disabled="!isLive || review.busy.value"
          @click="review.decideAll(false)"
        >
          {{ review.confirming.value === "*" ? "Reject all? Press again" : "Reject all" }}
        </button>
        <button
          v-if="files.length"
          v-press
          class="action focusable"
          type="button"
          data-tone="primary"
          :disabled="!isLive || review.busy.value"
          @click="review.decideAll(true)"
        >
          Approve all
        </button>
      </footer>
    </UiSurface>

    <PaneResizer v-model="side" :initial="SIDE" label="Resize the file list" />

    <UiSurface class="pane" data-region="review-changes" pad="none" variant="raised">
      <template v-if="file">
        <header
          class="bar"
          data-cmt="file"
          :data-cmt-label="basename(file.path)"
          :data-cmt-tell="`About ${homePath(file.path)}:`"
          :data-cmt-excerpt="homePath(file.path)"
        >
          <span class="title path">{{ homePath(file.path) }}</span>
          <span v-if="churn" class="churn mono-meta">
            <span data-mark="add">+{{ churn.added }}</span>
            <span data-mark="remove">−{{ churn.removed }}</span>
          </span>
          <span class="spacer" />
          <span class="toggle">
            <UiChip
              :selected="review.isCompact.value"
              size="xs"
              @click="review.isCompact.value = !review.isCompact.value"
            >
              Compact
            </UiChip>
            <UiChip
              :selected="review.isWrapped.value"
              size="xs"
              @click="review.isWrapped.value = !review.isWrapped.value"
            >
              Wrap
            </UiChip>
          </span>
          <button v-press class="action focusable" type="button" @click="comment($event)">Comment</button>
          <button
            v-press
            class="action focusable"
            type="button"
            data-tone="danger"
            :disabled="!isLive || review.busy.value"
            @click="rejectFile"
          >
            {{ review.confirming.value === file.path ? "Reject? Press again" : "Reject file" }}
          </button>
          <button
            v-press
            class="action focusable"
            type="button"
            data-tone="primary"
            :disabled="!isLive || review.busy.value"
            @click="review.decideFile(true)"
          >
            Approve file
          </button>
        </header>

        <p v-if="!isLive" class="notice" role="status">
          This conversation isn't running, so nothing here can be applied. Resume it to act on the review.
        </p>

        <div class="heads mono-meta" :style="OneDarkVivid.cssVars">
          <span>{{ file.isNew ? "Did not exist" : "Original, as last approved" }}</span>
          <span>{{ file.isDeleted ? "Deleted on disk" : "Now on disk" }}</span>
        </div>

        <div class="diff">
          <DiffSideBySide
            :key="file.path"
            :file="file"
            is-fill
            :is-compact="review.isCompact.value"
            :is-wrapped="review.isWrapped.value"
            :is-busy="!isLive || review.busy.value"
            :picks="review.picks.value"
            @update:picks="review.picks.value = $event"
            @hunk="decideHunk"
          />
        </div>

        <footer v-if="review.picks.value.length" class="pickbar">
          <span class="picked">{{ plural(review.picks.value.length, "line") }} picked</span>
          <button v-press class="action focusable" type="button" @click="comment($event, picked)">Comment</button>
          <button
            v-press
            class="action focusable"
            type="button"
            data-tone="danger"
            :disabled="!isLive || review.busy.value"
            @click="rejectLines"
          >
            Reject lines
          </button>
          <button
            v-press
            class="action focusable"
            type="button"
            data-tone="primary"
            :disabled="!isLive || review.busy.value"
            @click="review.decideLines(true)"
          >
            Accept lines
          </button>
          <button v-press class="action focusable" type="button" @click="review.picks.value = []">Clear</button>
        </footer>
      </template>

      <UiStateMessage v-else align="center" :kind="isReading ? 'loading' : 'empty'">{{ empty }}</UiStateMessage>
    </UiSurface>
  </section>
</template>

<style scoped>
/* The middle track is the resizer's; half the face caps a width remembered from a wider window. */
.review {
  column-gap: 8px;
  display: grid;
  grid-template-columns: min(var(--side-w), 50%) 0 minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.bar {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
}

.title {
  font-size: 12.5px;
  font-weight: 700;
}

.path {
  font-family: var(--mono);
  overflow-wrap: anywhere;
}

.meta {
  color: var(--muted);
  text-transform: none;
}

.spacer {
  flex: 1;
}

.toggle {
  display: inline-flex;
  flex: none;
  gap: 4px;
}

.churn {
  display: inline-flex;
  gap: 6px;
  text-transform: none;
}

.churn [data-mark="add"] {
  color: var(--success);
}

.churn [data-mark="remove"] {
  color: var(--error);
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.scroll[data-scroll="files"] {
  padding: 6px 8px var(--float-clear);
}

/* The editor owns its scrolling, so this only gives it the pane's remaining height. */
.diff {
  flex: 1;
  min-height: 0;
}

.heads {
  background: var(--ed-bar);
  border-bottom: 1px solid var(--ed-border);
  color: var(--ed-muted);
  display: grid;
  flex: none;
  grid-template-columns: 1fr 1fr;
  padding: 5px 0 5px 54px;
  text-transform: none;
}

.all,
.pickbar {
  align-items: center;
  border-top: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 6px;
  padding: 8px 12px calc(8px + var(--float-clear));
}

.all {
  justify-content: flex-end;
}

.picked {
  color: var(--primary-deep);
  font-size: 12.5px;
  font-weight: 600;
  margin-right: auto;
}

.action {
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 11px;
}

.action:hover:not(:disabled) {
  border-color: var(--ink);
}

.action[data-tone="danger"] {
  color: var(--error);
}

.action[data-tone="primary"] {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-content);
}

.action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.notice {
  background: var(--warning-soft);
  color: var(--warning);
  flex: none;
  font-size: 12.5px;
  margin: 0;
  padding: 9px 14px;
}

.empty {
  padding: 8px;
}
</style>
