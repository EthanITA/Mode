<script lang="ts" setup>
import { Check, ChevronDown, ChevronUp } from "@lucide/vue";
import type { FrameView } from "~/composables/useCanvas";

const { frame } = defineProps<{ frame: FrameView }>();

const emit = defineEmits<{ toggle: [] }>();

const style = computed(() => ({
  height: `${frame.height}px`,
  left: `${frame.x}px`,
  top: `${frame.y}px`,
  width: `${frame.width}px`,
}));
</script>

<template>
  <div :data-status="frame.status" :style="style" class="frame">
    <header
      :data-cmt-label="frame.title"
      :data-cmt-tell="frame.tell"
      class="frame-head"
      data-cmt="task"
    >
      <span class="frame-pip">
        <UiIcon v-if="frame.status === 'done'" :icon="Check" size="xs" />
      </span>
      <span class="frame-turn">{{ frame.turn }}</span>
      <span class="frame-title">{{ frame.title }}</span>
      <span v-if="frame.status === 'working'" class="frame-badge">Claude working</span>
      <span class="frame-count">{{ plural(frame.count, "artifact") }}</span>
      <button
        v-press
        :title="frame.open ? 'Collapse' : 'Expand'"
        class="plain-button focusable frame-toggle"
        type="button"
        @click="emit('toggle')"
      >
        <UiIcon :icon="frame.open ? ChevronUp : ChevronDown" size="xs" />
      </button>
    </header>
  </div>
</template>

<style scoped>
/* The box is decoration over the cards it groups; only the header takes the pointer,
   so a drag across a frame's empty interior still starts a marquee on the canvas. */
.frame {
  border: 1.5px dashed var(--border-strong);
  border-radius: 16px;
  box-sizing: border-box;
  pointer-events: none;
  position: absolute;
}

.frame[data-status="working"] {
  border-color: var(--primary);
}

.frame[data-status="waiting"] {
  border-color: var(--warning);
}

.frame-head {
  align-items: center;
  display: flex;
  gap: 8px;
  height: 42px;
  padding: 0 8px 0 12px;
  pointer-events: auto;
}

.frame-pip {
  align-items: center;
  background: var(--sunken);
  border-radius: 999px;
  display: grid;
  flex: none;
  height: 18px;
  place-items: center;
  width: 18px;
}

.frame[data-status="done"] .frame-pip {
  color: var(--success);
}

.frame[data-status="working"] .frame-pip {
  background: var(--primary);
}

.frame[data-status="waiting"] .frame-pip {
  background: var(--warning);
}

.frame-turn {
  color: var(--muted);
  flex: none;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
}

.frame-title {
  flex: 1;
  font-family: var(--sans);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame-badge {
  align-items: center;
  background: var(--primary-soft);
  border-radius: 999px;
  color: var(--primary-deep);
  display: inline-flex;
  flex: none;
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  height: 20px;
  padding: 0 8px;
  white-space: nowrap;
}

.frame-count {
  color: var(--subtle);
  flex: none;
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
}

.frame-toggle {
  align-items: center;
  border-radius: 999px;
  color: var(--muted);
  display: grid;
  flex: none;
  height: 24px;
  place-items: center;
  width: 24px;
}

.frame-toggle:hover {
  background: var(--sunken);
  color: var(--ink);
}
</style>
