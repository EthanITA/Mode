<script lang="ts" setup>
import { ChevronsLeft, ChevronsRight } from "@lucide/vue";
import type { ReviewRow } from "~/utils/review";
import type { ReviewFile } from "~~/shared/types/review";

type Side = "old" | "new";
type LineRow = ReviewRow & { kind: "change" | "same" };

const { file } = defineProps<{ file: ReviewFile }>();
const review = useReview();

const lang = computed(() => Syntax.languageOf(file.path));
const original = useHighlightedRows(computed(() => file.original.map((text) => ({ text }))), lang);
const current = useHighlightedRows(computed(() => file.current.map((text) => ({ text }))), lang);
const rows = computed(() => Review.rows({ file, isCompact: review.isCompact.value, unfolded: review.unfolded.value }));
const shown = computed(() => homePath(file.path));

let anchor = "";

function pick(key: string, event: MouseEvent): void {
  const held = review.picks.value;
  if (event.shiftKey && anchor) {
    const order = rows.value.filter((row) => row.kind === "change").map((row) => row.key);
    const [from = 0, to = 0] = [order.indexOf(anchor), order.indexOf(key)].sort((a, b) => a - b);
    review.picks.value = [...new Set([...held, ...order.slice(from, to + 1)])];
  } else review.picks.value = held.includes(key) ? held.filter((one) => one !== key) : [...held, key];
  anchor = key;
}

function kindOf(row: LineRow, side: Side): string {
  if (row.kind === "same") return "same";
  if (row[side] < 0) return "blank";
  return side === "old" ? "remove" : "add";
}

function htmlOf(row: LineRow, side: Side): string {
  return (side === "old" ? original.value[row.old] : current.value[row.new]) ?? "";
}

function textOf(row: LineRow, side: Side): string {
  return (side === "old" ? file.original[row.old] : file.current[row.new]) ?? "";
}

function tellOf(row: LineRow, side: Side): string {
  const at = row[side] + 1;
  return side === "old" ? `About original line ${at} of ${shown.value}:` : `About line ${at} of ${shown.value}:`;
}

function isPicked(row: LineRow): boolean {
  return row.kind === "change" && review.picks.value.includes(row.key);
}

function unfold(key: string): void {
  review.unfolded.value = [...review.unfolded.value, key];
}
</script>

<template>
  <div class="sbs" data-region="review-diff" :data-wrap="review.isWrapped.value">
    <template v-for="row in rows" :key="row.key">
      <button v-if="row.kind === 'fold'" v-press class="fold focusable" type="button" @click="unfold(row.key)">
        {{ plural(row.count, "unchanged line") }}
      </button>

      <template v-else>
        <template v-for="side in (['old', 'new'] as const)" :key="side">
          <button
            v-if="row.kind === 'change' && row[side] >= 0"
            class="ln focusable"
            type="button"
            :data-kind="kindOf(row, side)"
            :data-picked="isPicked(row)"
            :aria-label="`Pick line ${row[side] + 1}`"
            @click="pick(row.key, $event)"
          >
            {{ row[side] + 1 }}
          </button>
          <span v-else class="ln" :data-kind="kindOf(row, side)" :data-picked="isPicked(row)">
            {{ row[side] >= 0 ? row[side] + 1 : "" }}
          </span>
          <div v-if="row[side] < 0" class="code" data-kind="blank" :data-picked="isPicked(row)" />
          <div
            v-else
            class="code"
            :data-kind="kindOf(row, side)"
            :data-picked="isPicked(row)"
            data-cmt="line"
            :data-cmt-label="`${basename(file.path)}:${row[side] + 1}`"
            :data-cmt-tell="tellOf(row, side)"
            :data-cmt-excerpt="textOf(row, side)"
            v-html="htmlOf(row, side)"
          />
          <span v-if="side === 'old'" class="mid">
            <template v-if="row.kind === 'change' && row.isFirst">
              <button
                class="hunk focusable"
                type="button"
                title="Reject the hunk: copy the original over it"
                :disabled="review.busy.value"
                @click="review.decideHunk(row.change, false)"
              >
                <UiIcon :icon="ChevronsRight" size="sm" />
              </button>
              <button
                class="hunk focusable"
                type="button"
                title="Accept the hunk into the original"
                :disabled="review.busy.value"
                @click="review.decideHunk(row.change, true)"
              >
                <UiIcon :icon="ChevronsLeft" size="sm" />
              </button>
            </template>
          </span>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* Rows contribute their cells to one grid: a wrapped line grows its whole row, and no-wrap shares one scroll. */
.sbs {
  align-content: start;
  display: grid;
  font-family: var(--mono);
  font-size: 12px;
  grid-template-columns: 44px minmax(0, 1fr) 36px 44px minmax(0, 1fr);
  line-height: 1.7;
}

.sbs[data-wrap="false"] {
  grid-template-columns: 44px max-content 36px 44px max-content;
}

.ln {
  background: none;
  border: 0;
  color: var(--subtle);
  font: inherit;
  font-size: 11px;
  padding: 0 8px;
  text-align: right;
  user-select: none;
}

button.ln {
  cursor: pointer;
}

button.ln:hover {
  color: var(--primary-deep);
  text-decoration: underline;
}

.code {
  min-width: 0;
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.sbs[data-wrap="false"] .code {
  white-space: pre;
  word-break: normal;
}

[data-kind="remove"] {
  background: var(--error-soft);
}

[data-kind="add"] {
  background: var(--success-soft);
}

[data-kind="blank"] {
  background: repeating-linear-gradient(135deg, var(--sunken) 0 6px, transparent 6px 12px);
}

[data-picked="true"] {
  box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--primary) 16%, transparent);
}

.ln[data-picked="true"] {
  color: var(--primary-deep);
  font-weight: 700;
}

.mid {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
}

.hunk {
  align-items: center;
  background: none;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  display: grid;
  height: 20px;
  justify-items: center;
  padding: 0;
  width: 26px;
}

.hunk:hover:not(:disabled) {
  background: var(--primary-soft);
  color: var(--primary-deep);
}

.hunk:disabled {
  cursor: progress;
  opacity: 0.5;
}

.fold {
  background: var(--sunken);
  border: 0;
  border-block: 1px dashed var(--border);
  color: var(--muted);
  cursor: pointer;
  font-family: var(--sans);
  font-size: 11.5px;
  grid-column: 1 / -1;
  padding: 3px;
}

.fold:hover {
  color: var(--primary-deep);
}
</style>
