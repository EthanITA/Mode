<script setup lang="ts">
import type { Pipeline } from "~~/shared/types/mode"
import { displayStepName, stepState } from "~/composables/pipeline"

const props = defineProps<{ pipeline?: Pipeline }>()
</script>

<template>
  <ol v-if="props.pipeline" class="rail">
    <li
      v-for="step in props.pipeline.steps"
      :key="step"
      :data-state="stepState(props.pipeline, step)"
    >
      <span class="dot"></span>
      <span class="nm">{{ displayStepName(step) }}</span>
    </li>
  </ol>
  <p v-else class="msg">This mode has no pipeline.</p>
</template>

<style scoped>
.msg {
  font-size: 0.875rem;
  color: var(--muted);
  margin: 0;
}

.rail {
  display: flex;
  align-items: flex-start;
  list-style: none;
  margin: 0;
  padding: 0;
}

.rail li {
  flex: 1;
  position: relative;
  padding-top: 1.375rem;
  text-align: center;
}

.rail li::before {
  content: "";
  position: absolute;
  top: 6px;
  left: 50%;
  right: -50%;
  height: 2px;
  background: var(--border-strong);
}

.rail li:last-child::before {
  display: none;
}

.dot {
  position: absolute;
  top: 0;
  left: 50%;
  margin-left: -7px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--raised);
  box-shadow: inset 0 0 0 2px var(--border-strong);
}

.nm {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--subtle);
  display: block;
}

li[data-state="done"]::before {
  background: var(--success);
}

li[data-state="done"] .dot {
  background: var(--success);
  box-shadow: none;
}

li[data-state="done"] .nm {
  color: var(--muted);
}

li[data-state="now"] .dot {
  background: var(--primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent);
}

li[data-state="now"] .nm {
  color: var(--primary-deep);
  font-weight: 500;
}
</style>
