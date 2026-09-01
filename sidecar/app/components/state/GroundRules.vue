<script setup lang="ts">
const { data: why, pending, error } = useWhy()
</script>

<template>
  <section class="rules" :data-state="pending ? 'loading' : error ? 'error' : 'ready'">
    <p v-if="pending" class="msg">Reading ground rules…</p>
    <p v-else-if="error" class="msg" data-tone="error">Ground rules unavailable.</p>

    <template v-else-if="why">
      <div v-if="why.rules.told.length" class="chips">
        <span v-for="name in why.rules.told" :key="name" class="chip">{{ name }}</span>
      </div>
      <p v-else class="msg">None told yet this conversation.</p>

      <ul v-if="why.rules.waiting.length" class="waiting">
        <li v-for="w in why.rules.waiting" :key="w.name">
          <span class="name">{{ w.name }}</span>
          <span v-if="w.until" class="until">until {{ w.until }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.rules {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.msg {
  font-size: 0.875rem;
  color: var(--muted);
  margin: 0;
}

.msg[data-tone="error"] {
  color: var(--error);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.chip {
  font-family: var(--mono);
  font-size: 0.71875rem;
  background: var(--success-soft);
  color: var(--success);
  border-radius: 999px;
  padding: 0.1875rem 0.625rem;
}

.waiting {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.waiting li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-family: var(--mono);
  font-size: 0.75rem;
  background: var(--warning-soft);
  color: var(--warning);
  border-radius: 999px;
  padding: 0.1875rem 0.625rem;
  width: fit-content;
}

.until {
  color: var(--muted);
  font-family: var(--sans);
}
</style>
