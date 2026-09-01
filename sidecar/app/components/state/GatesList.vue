<script setup lang="ts">
const { data: why, pending, error } = useWhy()
</script>

<template>
  <section class="gates" :data-state="pending ? 'loading' : error ? 'error' : 'ready'">
    <p v-if="pending" class="msg">Reading gates…</p>
    <p v-else-if="error" class="msg" data-tone="error">Gates unavailable.</p>
    <p v-else-if="!why?.gates.length" class="msg">No gates on this contract.</p>
    <ul v-else class="list">
      <li v-for="gate in why.gates" :key="gate.name" class="gate" :data-state="gate.state">
        <span class="dot"></span>
        <span class="name">{{ gate.name }}</span>
        <span class="badge">{{ gate.state }}</span>
        <span class="reason">{{ gate.reason }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gates {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.msg {
  font-size: 0.875rem;
  color: var(--muted);
  margin: 0;
}

.msg[data-tone="error"] {
  color: var(--error);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.gate {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-field);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: none;
  background: var(--success);
}

.gate[data-state="shut"] .dot {
  background: var(--error);
}

.name {
  font-family: var(--mono);
  font-size: 0.8125rem;
}

.badge {
  font-family: var(--mono);
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--success-soft);
  color: var(--success);
}

.gate[data-state="shut"] .badge {
  background: var(--error-soft);
  color: var(--error);
}

.reason {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.8125rem;
  text-align: right;
}
</style>
