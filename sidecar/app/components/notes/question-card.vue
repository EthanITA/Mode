<script lang="ts" setup>
const { steps } = useScreen();

// The step a question would block is real; the question itself needs the streaming CLI.
const blocked = computed(() => steps.value.find((step) => step.gate && step.state !== "done")?.label);
</script>

<template>
  <section class="ask" data-region="question-card" data-scaffold>
    <header>
      <span class="eyebrow mono-meta">Claude asks<template v-if="blocked"> · blocks {{ blocked }}</template></span>
      <UiScaffoldMark phase="phase 4" why="No streaming CLI holds the conversation yet, so no question can arrive. Drawn so the shape reads." />
    </header>

    <div class="scaffold-body">
      <p class="q">
        <template v-if="blocked">A question that blocks <b>{{ blocked }}</b> would land here.</template>
        <template v-else>A question from Claude would land here, naming the step it blocks.</template>
      </p>
      <label class="opt" data-rec>
        <input type="radio" name="scaffold-answer" disabled />
        <span>The recommended answer</span>
        <span class="rec mono-meta">rec</span>
      </label>
      <label class="opt">
        <input type="radio" name="scaffold-answer" disabled />
        <span>The alternative</span>
      </label>
      <button class="answer" type="button" disabled>Answer and resume</button>
    </div>
  </section>
</template>

<style scoped>
.ask {
  background: var(--primary-soft);
  border: 1px solid color-mix(in oklch, var(--primary) 42%, transparent);
  border-radius: var(--radius-box);
  padding: 13px 14px;
}

header {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 9px;
}

.eyebrow {
  color: var(--primary-deep);
}

.q {
  font-size: 13px;
  margin: 0 0 10px;
}

.opt {
  align-items: center;
  background: color-mix(in oklch, var(--raised) 55%, transparent);
  border: 1px solid transparent;
  border-radius: var(--radius-field);
  cursor: not-allowed;
  display: flex;
  font-size: 13px;
  gap: 9px;
  margin-bottom: 6px;
  padding: 8px 10px;
}

.opt[data-rec] {
  background: var(--raised);
  border-color: color-mix(in oklch, var(--primary) 40%, transparent);
}

.opt input {
  accent-color: var(--primary);
  margin: 0;
}

.rec {
  background: var(--primary);
  border-radius: 999px;
  color: var(--rec-fg);
  margin-left: auto;
  padding: 2px 7px;
}

.answer {
  background: var(--primary);
  border: 0;
  border-radius: 999px;
  color: var(--primary-content);
  cursor: not-allowed;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  margin-top: 4px;
  padding: 7px 15px;
  width: 100%;
}
</style>
