<script setup lang="ts">
import TwoSlots from "./TwoSlots.vue"
import PipelineRail from "./PipelineRail.vue"
import GatesList from "./GatesList.vue"
import GroundRules from "./GroundRules.vue"

const { data: why, pending, error } = useWhy()
</script>

<template>
  <section class="why-panel" :data-state="pending ? 'loading' : error ? 'error' : 'ready'">
    <header>
      <h2 class="h2">Why this conversation behaves the way it does</h2>
      <p class="sub">Slots, pipeline, gates and ground rules, as the session sees them.</p>
    </header>

    <p v-if="pending" class="msg">Reading…</p>
    <p v-else-if="error" class="msg" data-tone="error">Could not read the session state.</p>

    <template v-else-if="why">
      <TwoSlots />

      <h3 class="h3">Pipeline</h3>
      <PipelineRail :pipeline="why.pipeline" />

      <h3 class="h3">Gates</h3>
      <GatesList />

      <h3 class="h3">Ground rules</h3>
      <GroundRules />
    </template>
  </section>
</template>

<style scoped>
.why-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.h2 {
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  margin: 0;
}

.sub {
  color: var(--muted);
  font-size: 0.84375rem;
  margin: 0.125rem 0 0;
}

.h3 {
  font-size: 0.78125rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--subtle);
  font-family: var(--mono);
  margin: 0;
}

.msg {
  font-size: 0.875rem;
  color: var(--muted);
  margin: 0;
}

.msg[data-tone="error"] {
  color: var(--error);
}
</style>
