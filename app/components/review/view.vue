<script lang="ts" setup>
import { Eye, FoldVertical, Link2, Redo2, TextWrap, Undo2 } from "@lucide/vue";
import { useEventListener } from "@vueuse/core";
import { OneDarkVivid } from "~/utils/monaco/one-dark-vivid";
import type { ReviewPicks, ReviewRowRejected } from "~/utils/review";

const sc = useSidecar();
const chrome = useChrome();
const shown = useFaceShown();
const review = useReview();
const { initial: sideInitial, width: side } = usePaneWidth();

review.listen();

const files = computed(() => review.snapshot.value?.files ?? []);
const file = computed(() => review.file.value);
const isLive = computed(() => !!review.snapshot.value?.live);
const churn = computed(() => (file.value ? Review.counts(file.value) : undefined));
const preview = $preview();
const zoom = ref(1);
const kind = computed(() => (file.value ? Preview.kindOf(file.value.path) : undefined));
const isPreviewing = computed(() => !!kind.value && preview.inReview);
// Each side's address carries its content id, so a frame reloads only when that side really changed.
const sides = computed(() => {
  const here = file.value;
  const conversation = sc.sessionKey.value;
  if (!here || !conversation) return undefined;
  return {
    before: here.isNew
      ? { empty: "Nothing to draw, the file did not exist yet." }
      : { src: Preview.srcOf({ conversation, isOriginal: true, path: here.path, version: here.blob }) },
    after: here.isDeleted
      ? { empty: "Nothing to draw, the file is gone from disk." }
      : { src: Preview.srcOf({ conversation, path: here.path, version: here.hash }) },
  };
});

watch(
  () => file.value?.path,
  () => {
    zoom.value = 1;
  },
);

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
    if (!shown.value) return;
    if (event.key === "Escape" && review.confirming.value) {
      review.confirming.value = undefined;
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return;
    // An unsaved edit keeps ⌘Z for the editor's own undo.
    if (review.isDirty.value) return;
    const target = event.target instanceof Element ? event.target : undefined;
    // A side question card sits inside the editor's DOM, yet its ⌘Z belongs to its own field or its Undo.
    if (target?.closest("[data-region='side-question']")) return;
    if (target?.closest("input, textarea, [contenteditable]") && !target.closest(".monaco-editor")) return;
    event.preventDefault();
    event.stopPropagation();
    if (isLive.value && !review.busy.value) void review.travel(event.shiftKey ? "redo" : "undo");
  },
  { capture: true },
);

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

      <div v-fade="isReading" class="scroll" data-scroll="files">
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
          :tip="`Undo ${review.snapshot.value.undo} · {cmd Z}`"
          @click="review.travel('undo')"
        />
        <ChromeAction
          v-if="review.snapshot.value?.redo"
          data-region="review-redo"
          :icon="Redo2"
          shape="pill"
          :tip="`Redo ${review.snapshot.value.redo} · {cmd shift Z}`"
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

    <PaneResizer v-model="side" :initial="sideInitial" label="Resize the file list" />

    <UiSurface v-fade="isReading" class="pane" data-region="review-changes" pad="none" variant="raised">
      <template v-if="file">
        <header
          class="bar"
          data-layout="stacked"
          data-cmt="file"
          :data-cmt-label="basename(file.path)"
          :data-cmt-tell="`About ${homePath(file.path)}:`"
          :data-cmt-excerpt="homePath(file.path)"
        >
          <div class="line">
            <span class="title path" :title="homePath(file.path)">{{ homePath(file.path) }}</span>
            <span v-if="churn" class="churn mono-meta">
              <span data-mark="add">+{{ churn.added }}</span>
              <span data-mark="remove">−{{ churn.removed }}</span>
            </span>
          </div>
          <div class="line" data-split>
            <span class="group">
              <ChromeAction
                v-if="kind"
                data-region="review-preview"
                :icon="Eye"
                :is-on="preview.inReview"
                label="Preview"
                shape="pill"
                tip="Draw both sides rendered · off shows the diff"
                @click="preview.inReview = !preview.inReview"
              />
              <ChromeAction
                v-if="isPreviewing && kind && Preview.isZoomable(kind)"
                :icon="Link2"
                :is-on="preview.isSynced"
                shape="pill"
                tip="Scroll both sides together · pinch zooms both"
                @click="preview.isSynced = !preview.isSynced"
              />
              <template v-if="!isPreviewing">
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
              </template>
            </span>
            <span class="group">
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
            </span>
          </div>
        </header>

        <p v-if="!isLive" class="notice" role="status">
          This conversation isn't running, so nothing here can be applied. Resume it to act on the review.
        </p>

        <div class="heads mono-meta" :data-preview="isPreviewing" :style="OneDarkVivid.cssVars">
          <span>{{ file.isNew ? "Did not exist" : "Original, as last approved" }}</span>
          <span>{{ file.isDeleted ? "Deleted on disk" : "Now on disk" }}</span>
        </div>

        <div class="diff">
          <PreviewPair
            v-if="isPreviewing && kind && sides"
            :key="file.path"
            v-model:zoom="zoom"
            :after="sides.after"
            :before="sides.before"
            :is-synced="preview.isSynced"
            :kind="kind"
          />
          <DiffSideBySide
            v-else
            :key="file.path"
            :file="file"
            is-fill
            :is-compact="review.isCompact.value"
            :is-wrapped="review.isWrapped.value"
            :is-busy="!isLive || review.busy.value"
            @hunk="decideHunk"
          />
        </div>
      </template>

      <UiStateMessage v-else align="center" :kind="isReading ? 'loading' : 'empty'">{{ empty }}</UiStateMessage>
    </UiSurface>
  </section>
</template>

<style scoped>
/* The middle track is the resizer's; half the face caps a width remembered from a wider window. */
.review {
  @apply grid h-full min-h-0 grid-cols-pane gap-x-2;
}

.pane {
  @apply flex min-h-0 flex-col overflow-hidden;
}

.bar {
  @apply flex flex-none flex-wrap items-center gap-2 border-b border-b-border px-3.5 py-2.5;
}

.title {
  @apply typo-body-strong font-bold;
}

.bar[data-layout="stacked"] {
  @apply flex-col items-stretch gap-1.5;
}

.line {
  @apply flex min-w-0 items-center gap-2;
}

.line[data-split] {
  @apply justify-between;
}

/* One line however long the path, so the row of buttons under it never moves. */
.path {
  @apply min-w-0 truncate font-mono;
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

.churn {
  @apply inline-flex gap-1.5 normal-case;
}

.churn [data-mark="add"] {
  @apply text-success;
}

.churn [data-mark="remove"] {
  @apply text-error;
}

.scroll {
  @apply min-h-0 flex-1 overflow-auto;
}

.scroll[data-scroll="files"] {
  @apply px-2 pt-1.5 pb-(--float-clear);
}

/* The editor owns its scrolling, so this only gives it the pane's remaining height. */
.diff {
  @apply min-h-0 flex-1;
}

.heads {
  @apply grid flex-none grid-cols-2 border-b border-b-ed-border bg-ed-bar py-1.25 pr-0 pl-13.5 text-ed-muted normal-case;
}

/* The rendered sides have no line-number gutter, so each label starts at its own half. */
.heads[data-preview="true"] {
  @apply gap-x-px pl-0;
}

.heads[data-preview="true"] span {
  @apply pl-3.5;
}

.all {
  @apply flex flex-none items-center justify-end gap-1.5 border-t border-t-border px-3 pt-2 pb-[calc(8px_+_var(--float-clear))];
}

.action {
  @apply flex-none cursor-pointer rounded-full border border-border-strong bg-raised px-2.75 py-1 typo-caption-strong text-fg;
}

.action:hover:not(:disabled) {
  @apply border-fg;
}

.action[data-tone="danger"] {
  @apply text-error;
}

.action[data-tone="primary"] {
  @apply border-primary bg-primary text-primary-content;
}

.action:disabled {
  @apply cursor-not-allowed opacity-50;
}

.notice {
  @apply m-0 flex-none bg-warning-soft px-3.5 py-2.25 typo-body text-warning;
}

.empty {
  @apply p-2;
}
</style>
