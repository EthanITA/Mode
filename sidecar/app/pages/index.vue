<script lang="ts" setup>
const sc = useSidecar();

loadSidecar();
</script>

<template>
  <div class="shell" :data-panel="sc.panelOpen.value ? 'open' : 'closed'">
    <header class="rail">
      <SessionTabs />
    </header>

    <main class="stage">
      <ArtifactPage />
    </main>

    <aside class="side">
      <NotesPanel />
    </aside>

    <template v-if="!sc.panelOpen.value">
      <div class="float float-left">
        <SessionCapsule />
      </div>
      <div class="float float-right">
        <SessionAwaiting />
      </div>
    </template>

    <p v-if="sc.failure.value" class="failure" role="alert">
      The sidecar server did not answer: {{ sc.failure.value }}
    </p>
  </div>
</template>

<style scoped>
.shell {
  background: var(--canvas);
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--panel-w);
  grid-template-rows: var(--rail-h) minmax(0, 1fr);
  height: 100vh;
  transition:
    grid-template-columns var(--duration-base) var(--ease-out),
    grid-template-rows var(--duration-base) var(--ease-out);
}

.shell[data-panel="closed"] {
  grid-template-columns: minmax(0, 1fr) 0;
  grid-template-rows: 0 minmax(0, 1fr);
}

.rail {
  grid-column: 1 / -1;
  min-width: 0;
  overflow: hidden;
}

.stage {
  min-width: 0;
  overflow-y: auto;
  /* Leaves the gutter its margin, so a marker never lands under the page. */
  padding: 0 calc(var(--gutter-w) + 12px);
}

.side {
  min-width: 0;
  overflow: hidden;
}

.float {
  position: fixed;
  top: 16px;
  z-index: 20;
}

.float-left {
  left: 16px;
}

.float-right {
  right: 16px;
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  bottom: 16px;
  color: var(--error);
  font-size: 13px;
  left: 16px;
  margin: 0;
  padding: 9px 13px;
  position: fixed;
  z-index: 30;
}

@media (prefers-reduced-motion: reduce) {
  .shell {
    transition: none;
  }
}
</style>
