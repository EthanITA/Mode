<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core";
import { OneDarkVivid } from "~/utils/monaco/one-dark-vivid";

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
    : "Nothing captured yet. The turn-diff mod records each file as Claude first changes it.";
});

// The popover sits under whatever asked for it, and the tray chip carries the quote and the lines.
function comment(event: MouseEvent, scope: "file" | "lines"): void {
  const here = file.value;
  if (!here) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const lines = picked.value.new.length ? picked.value.new : picked.value.old;
  const source = picked.value.new.length ? here.current : here.original;
  const isFile = scope === "file";
  const where = isFile ? homePath(here.path) : `${Review.spanOf(lines)} of ${homePath(here.path)}`;
  const quote = isFile ? undefined : lines.map((line) => source[line - 1] ?? "").join("\n");
  // The tray hands over a quote with its `path` and `file`, so the lines and the file travel with it.
  chrome.comment.open({
    excerpt: quote,
    file: isFile ? undefined : homePath(here.path),
    kind: isFile ? "file" : "line",
    path: isFile ? undefined : Review.spanOf(lines),
    label: isFile ? basename(here.path) : `${basename(here.path)}:${lines.join(",")}`,
    quote,
    tell: picked.value.new.length || isFile ? `About ${where}:` : `About the removed original ${where}:`,
    x: Math.max(12, Math.min(box.left, window.innerWidth - 432)),
    y: Math.max(12, box.top - 312),
  });
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
        <p v-if="!files.length" class="empty">{{ empty }}</p>
        <ReviewFiles v-else />
      </div>

      <footer v-if="files.length" class="all">
        <button
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
            <UiChip :selected="review.isCompact.value" size="xs" @click="review.isCompact.value = !review.isCompact.value">
              Compact
            </UiChip>
            <UiChip :selected="review.isWrapped.value" size="xs" @click="review.isWrapped.value = !review.isWrapped.value">
              Wrap
            </UiChip>
          </span>
          <button v-press class="action focusable" type="button" @click="comment($event, 'file')">Comment</button>
          <button
            v-press
            class="action focusable"
            type="button"
            data-tone="danger"
            :disabled="!isLive || review.busy.value"
            @click="review.decideFile(false)"
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
            @hunk="(change, isAccept) => review.decideHunk(change, isAccept)"
          />
        </div>

        <footer v-if="review.picks.value.length" class="pickbar">
          <span class="picked">{{ plural(review.picks.value.length, "line") }} picked</span>
          <button v-press class="action focusable" type="button" @click="comment($event, 'lines')">Comment</button>
          <button
            v-press
            class="action focusable"
            type="button"
            data-tone="danger"
            :disabled="!isLive || review.busy.value"
            @click="review.decideLines(false)"
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

      <p v-else class="empty centered">{{ empty }}</p>
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
  padding: 6px 8px 16px;
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
  padding: 8px 12px;
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
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
  padding: 8px;
}

.centered {
  display: grid;
  height: 100%;
  place-items: center;
}
</style>
