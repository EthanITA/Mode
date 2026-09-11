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
const shown = computed(() => list.value.find((row) => row.name === (hovered.value || held.value?.name)) ?? list.value[0]);

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
    <UiPopover placement="top" width="w-[620px]" :estimated-height="400" :offset="10">
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
  display: inline-flex;
  flex: none;
}

.pill {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 600;
  gap: 7px;
  height: 26px;
  padding: 0 10px;
  white-space: nowrap;
}

.pill:hover {
  background: color-mix(in oklch, var(--ink) 8%, transparent);
}

.dot {
  background: var(--tint, var(--subtle));
  border-radius: 999px;
  flex: none;
  height: 8px;
  width: 8px;
}

.origin {
  color: var(--subtle);
}

.menu {
  display: flex;
  flex-direction: column;
  max-width: 100%;
}

.head {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 8px;
  padding: 10px 14px;
}

.title {
  font-size: 12.5px;
  font-weight: 700;
}

.hint {
  color: var(--subtle);
}

.body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 0;
}

.list {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  max-height: 44vh;
  overflow-y: auto;
  padding: 6px;
  scrollbar-width: thin;
}

.row {
  align-items: baseline;
  display: grid;
  flex: 1;
  gap: 10px;
  grid-template-columns: 8px 72px minmax(0, 1fr);
  min-width: 0;
}

.row .dot {
  align-self: center;
}

.who {
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
}

.summary {
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.45;
  min-width: 0;
}

.empty {
  color: var(--subtle);
  margin: 0;
  padding: 10px;
}

.pane {
  max-height: 44vh;
  overflow-y: auto;
  padding: 12px 14px;
  scrollbar-width: thin;
}

.foot {
  align-items: center;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 10px;
  padding: 8px 14px;
}

.note {
  color: var(--subtle);
}

.off {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-family: var(--sans);
  font-size: 11.5px;
  font-weight: 600;
  height: 26px;
  margin-left: auto;
  padding: 0 10px;
}

.off:hover {
  border-color: var(--ink);
  color: var(--ink);
}
</style>
