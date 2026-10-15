<script lang="ts" setup>
import type { Axis, Contract } from "~~/shared/types/mode";

const { axis } = defineProps<{ axis: Axis }>();

const emit = defineEmits<{ pick: [command: string] }>();

const sc = useSidecar();
const { session, slots, steps } = useScreen();

const held = computed(() => session.value?.slots[axis]);
const view = computed(() => slots.value.find((slot) => slot.axis === axis));
const list = computed<Contract[]>(() => (axis === "mode" ? sc.contracts.value.modes : sc.contracts.value.styles));

const hovered = ref<string>();
const shown = computed(
  () => list.value.find((row) => row.name === (hovered.value || held.value?.name)) ?? list.value[0],
);

// Only the held contract has a position in the pipeline; every other one is drawn cold.
const at = computed(() =>
  axis === "mode" && shown.value?.name === held.value?.name
    ? steps.value.find((step) => step.state === "current")?.label
    : undefined,
);

function choose(name: string, close: () => void): void {
  emit("pick", `/${axis} ${name}`);
  close();
}

function clear(close: () => void): void {
  emit("pick", `/${axis} off`);
  close();
}
</script>

<template>
  <span class="anchor" :data-region="`${axis}-picker`">
    <UiPopover placement="top" width="w-155" :estimated-height="400" :offset="10">
      <template #trigger>
        <button
          v-press
          class="pill focusable"
          type="button"
          :title="`${axis}: ${view?.summary}`"
          :data-cmt="axis"
          :data-cmt-label="`${axis} · ${held?.name || 'auto'}`"
          :data-cmt-tell="`About the ${axis} this conversation is running in`"
          :data-cmt-excerpt="view?.summary"
        >
          <span class="dot" :data-tint="view?.tint" />
          <span class="name">{{ held?.name || "auto" }}</span>
          <span v-if="view" class="origin mono-meta">{{ sigil(view.how) || view.how }}</span>
        </button>
      </template>

      <template #default="{ close }">
        <div class="menu" @mouseleave="hovered = undefined">
          <div class="head">
            <span class="title">/{{ axis }}</span>
            <span class="hint mono-meta">
              {{ axis === "mode" ? "how the work runs" : "how it sounds" }} · {{ view?.how }}
            </span>
          </div>

          <div class="body">
            <div class="list">
              <UiMenuItem
                v-for="row in list"
                :key="row.name"
                :aria-pressed="row.name === held?.name"
                @click="choose(row.name, close)"
                @mouseenter="hovered = row.name"
                @focus="hovered = row.name"
              >
                <span class="row">
                  <span class="dot" :data-tint="tintOf(row.color, `${row.axis}:${row.name}`)" />
                  <span class="who">{{ row.name }}</span>
                  <span class="summary">{{ row.summary }}</span>
                </span>
              </UiMenuItem>
              <p v-if="!list.length" class="empty mono-meta">no {{ axis }} contract is installed</p>
            </div>

            <div class="pane">
              <ComposerPickerDiagram v-if="shown" :contract="shown" :current="at" />
            </div>
          </div>

          <div class="foot">
            <span class="note mono-meta">set here → the hook confirms on the next turn</span>
            <button v-press class="off focusable" type="button" @click="clear(close)">/{{ axis }} off</button>
          </div>
        </div>
      </template>
    </UiPopover>
  </span>
</template>

<style scoped>
.anchor {
  @apply inline-flex flex-none;
}

.pill {
  @apply inline-flex h-6.5 cursor-pointer items-center gap-1.75 rounded-full border-0 bg-transparent px-2.5 py-0 font-sans typo-caption-strong whitespace-nowrap text-fg;
}

.pill:hover {
  @apply bg-fg/8;
}

.dot {
  @apply size-2 flex-none rounded-full bg-subtle;
}

.dot[data-tint] {
  @apply bg-tint;
}

.origin {
  @apply text-subtle;
}

.menu {
  @apply flex max-w-full flex-col;
}

.head {
  @apply flex items-center gap-2 border-b border-b-border px-3.5 py-2.5;
}

.title {
  @apply typo-body-strong font-bold;
}

.hint {
  @apply text-subtle;
}

.body {
  @apply grid min-h-0 grid-cols-[minmax(0,1fr)_280px];
}

.list {
  @apply flex max-h-[44vh] scrollbar-thin flex-col overflow-y-auto border-r border-r-border p-1.5;
}

.row {
  @apply grid min-w-0 flex-1 grid-cols-[8px_72px_minmax(0,1fr)] items-baseline gap-2.5;
}

.row .dot {
  @apply self-center;
}

.who {
  @apply typo-body-strong text-fg;
}

.summary {
  @apply min-w-0 typo-caption leading-normal text-muted;
}

.empty {
  @apply m-0 p-2.5 text-subtle;
}

.pane {
  @apply max-h-[44vh] scrollbar-thin overflow-y-auto px-3.5 py-3;
}

.foot {
  @apply flex items-center gap-2.5 border-t border-t-border px-3.5 py-2;
}

.note {
  @apply text-subtle;
}

.off {
  @apply ml-auto h-6.5 cursor-pointer rounded-full border border-border bg-raised px-2.5 py-0 font-sans typo-caption-strong text-muted;
}

.off:hover {
  @apply border-fg text-fg;
}
</style>
