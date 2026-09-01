<script lang="ts" setup>
const TABS = ["notes", "pipeline", "history"] as const;
type PanelTab = (typeof TABS)[number];

const sc = useSidecar();
const { ground, liveState, noteGroups, openNotes, steps, why } = useScreen();

const tab = ref<PanelTab>("notes");

function ordinal(index: number): string {
  return `§${String(index + 1).padStart(2, "0")}`;
}
</script>

<template>
  <aside class="panel">
    <header class="head">
      <div class="tabs" data-region="panel-tabs" role="tablist" aria-label="Conversation">
        <button
          v-for="name in TABS"
          :key="name"
          class="tab focusable plain-button"
          type="button"
          role="tab"
          :data-active="name === tab ? '' : undefined"
          :aria-selected="name === tab"
          @click="tab = name"
        >
          {{ name }}<span v-if="name === 'notes' && openNotes" class="count">{{ openNotes }}</span>
          <span v-if="name === 'history'" class="ver mono-meta">v—</span>
        </button>
      </div>

      <span class="state mono-meta" :data-live="liveState.running ? '' : undefined">
        <span class="dot" />
        {{ liveState.label }}
      </span>
    </header>

    <div class="body">
      <template v-if="tab === 'notes'">
        <NotesQuestionCard />

        <div class="notes" data-region="notes">
          <section v-for="(group, index) in noteGroups" :key="group.label" class="group">
            <h3 class="mono-meta">{{ ordinal(index) }} · {{ group.label }}</h3>
            <NotesCard v-for="thread in group.threads" :key="thread.id" :thread="thread" />
          </section>

          <p v-if="!noteGroups.length" class="empty">
            <template v-if="sc.artifact.value">
              No notes on <b>{{ sc.artifact.value.title || sc.artifact.value.slug }}</b> yet. Notes appear here once the
              page carries a comment layer and you leave one on it.
            </template>
            <template v-else>Mount an artifact to see its notes.</template>
          </p>
        </div>
      </template>

      <template v-else-if="tab === 'pipeline'">
        <ol v-if="steps.length" class="run">
          <li v-for="step in steps" :key="step.label" class="run-step" :data-state="step.state">
            <span class="pip" />
            <span class="label">{{ step.label }}</span>
            <span v-if="step.gate" class="gate mono-meta">waits on a decision</span>
          </li>
        </ol>
        <p v-else class="empty">The mode slot holds no contract, so there is no pipeline to run.</p>

        <h3 class="mono-meta section">gates</h3>
        <ul v-if="why?.gates.length" class="gates">
          <li v-for="gate in why.gates" :key="gate.name" :data-state="gate.state">
            <span class="mono-meta name">{{ gate.name }}</span>
            <span class="reason">{{ gate.reason }}</span>
          </li>
        </ul>
        <p v-else class="empty">No gate is declared by this mode.</p>
      </template>

      <template v-else>
        <div class="history" data-scaffold>
          <div class="scaffold-body">
            <p class="empty">Every earlier version of this artifact would be listed here, newest first.</p>
          </div>
          <UiScaffoldMark
            phase="not real"
            why="No version store exists and git cannot supply one, so there is no history to list."
          />
        </div>
      </template>
    </div>

    <footer class="strip" data-region="panel-footer">
      <PipelineSlotChips />
      <span class="ground mono-meta" :title="`${ground.told} of ${ground.total} ground rules have been told to this session`">
        ground · {{ ground.told }}/{{ ground.total }}
      </span>
      <input
        class="prompt"
        data-region="prompt-input"
        type="text"
        placeholder="Read only — sending arrives in phase 4"
        disabled
        aria-label="Prompt (unavailable until phase 4)"
      />
    </footer>
  </aside>
</template>

<style scoped>
.panel {
  background: var(--raised);
  border-left: 1px solid var(--border);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-width: 0;
}

.head {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 14px;
}

.tabs {
  display: flex;
  gap: 3px;
  min-width: 0;
}

.tab {
  align-items: center;
  border-radius: 999px;
  color: var(--muted);
  display: flex;
  font-size: 12.5px;
  gap: 6px;
  padding: 5px 11px;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.tab:hover {
  background: var(--sunken);
  color: var(--ink);
}

.tab[data-active] {
  background: var(--secondary);
  color: var(--canvas);
  font-weight: 600;
}

.count {
  background: color-mix(in oklch, var(--canvas) 28%, transparent);
  border-radius: 999px;
  font-size: 11px;
  padding: 0 5px;
}

.ver {
  opacity: 0.55;
}

.state {
  align-items: center;
  color: var(--subtle);
  display: flex;
  flex: none;
  gap: 5px;
}

.state .dot {
  --dot-size: 6px;

  background: var(--subtle);
}

.state[data-live] {
  color: var(--success);
}

.state[data-live] .dot {
  animation: breathe 2.4s var(--ease-in-out) infinite;
  background: var(--success);
}

@keyframes breathe {
  50% {
    opacity: 0.35;
  }
}

.body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 14px;
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group h3,
.section {
  color: var(--subtle);
  margin: 0 0 8px;
}

.group > .note + .note {
  margin-top: 8px;
}

.empty {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}

.run {
  list-style: none;
  margin: 0;
  padding: 0;
}

.run-step {
  align-items: center;
  color: var(--subtle);
  display: flex;
  font-size: 13px;
  gap: 9px;
  padding: 5px 0;
}

.run-step .pip {
  background: currentColor;
  border-radius: 999px;
  flex: none;
  height: 6px;
  opacity: 0.4;
  width: 6px;
}

.run-step[data-state="done"] {
  color: var(--muted);
}

.run-step[data-state="done"] .pip {
  background: var(--success);
  opacity: 1;
}

.run-step[data-state="current"] {
  color: var(--ink);
  font-weight: 600;
}

.run-step[data-state="current"] .pip {
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 22%, transparent);
  opacity: 1;
}

.gate {
  color: var(--warning);
  margin-left: auto;
}

.gates {
  list-style: none;
  margin: 0;
  padding: 0;
}

.gates li {
  border-left: 2px solid var(--border-strong);
  margin-bottom: 9px;
  padding-left: 10px;
}

.gates li[data-state="shut"] {
  border-color: var(--warning);
}

.gates li[data-state="open"] {
  border-color: var(--success);
}

.gates .name {
  color: var(--ink);
  display: block;
  margin-bottom: 2px;
}

.gates .reason {
  color: var(--muted);
  font-size: 12.5px;
}

.history {
  align-items: flex-start;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.strip {
  align-items: center;
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
}

.ground {
  color: var(--subtle);
  cursor: help;
}

.prompt {
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  cursor: not-allowed;
  flex: 1 1 100%;
  font: inherit;
  font-size: 12.5px;
  min-width: 0;
  padding: 7px 13px;
}

@media (prefers-reduced-motion: reduce) {
  .tab {
    transition: none;
  }

  .state[data-live] .dot {
    animation: none;
  }
}
</style>
