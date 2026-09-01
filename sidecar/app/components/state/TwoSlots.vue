<script setup lang="ts">
import type { Contract, Slot } from "~~/shared/types/mode"

type AxisRow = {
  key: "mode" | "style"
  label: string
  slot?: Slot
  options: Contract[]
}

const { data: why } = useWhy()
const { data: contracts, pending, error } = useContracts()

const rows = computed<AxisRow[]>(() => [
  { key: "mode", label: "mode", slot: why.value?.slots.mode, options: contracts.value?.modes ?? [] },
  { key: "style", label: "style", slot: why.value?.slots.style, options: contracts.value?.styles ?? [] },
])

function isCurrent(row: AxisRow, name: string): boolean {
  return row.slot?.name === name
}
</script>

<template>
  <section class="two-slots" :data-state="pending ? 'loading' : error ? 'error' : 'ready'">
    <p v-if="pending" class="msg">Reading contracts…</p>
    <p v-else-if="error" class="msg" data-tone="error">Contracts unavailable.</p>

    <template v-else>
      <div v-for="row in rows" :key="row.key" class="axis">
        <div class="axis-head">
          <span class="axis-name">{{ row.label }}</span>
          <span v-if="row.slot?.name" class="holds">
            holding <b>{{ row.slot.name }}</b>, {{ row.slot.how }}
          </span>
          <span v-else class="holds" data-tone="unset">unset</span>
          <span class="count">{{ row.options.length }} contracts</span>
        </div>

        <ul class="opts">
          <li class="opt" data-special="true">
            <span class="dot"></span>
            <span class="name">off</span>
            <span class="sum">No contract on this axis.</span>
          </li>
          <li class="opt" data-special="true">
            <span class="dot"></span>
            <span class="name">auto</span>
            <span class="sum">Left open. The next message picks it, and the pick shows as chosen.</span>
          </li>
          <li
            v-for="opt in row.options"
            :key="opt.name"
            class="opt"
            :data-current="isCurrent(row, opt.name) || undefined"
          >
            <span class="dot"></span>
            <span class="name">{{ opt.name }}</span>
            <span class="sum">{{ opt.summary ?? "—" }}</span>
            <span v-if="isCurrent(row, opt.name)" class="state-badge">{{ row.slot?.how }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.two-slots {
  display: flex;
  flex-direction: column;
  gap: 1.375rem;
}

.msg {
  font-size: 0.875rem;
  color: var(--muted);
  margin: 0;
}

.msg[data-tone="error"] {
  color: var(--error);
}

.axis-head {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0 0.125rem 0.625rem;
  border-bottom: 1px solid var(--border);
}

.axis-name {
  font-family: var(--mono);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--subtle);
}

.holds {
  font-size: 0.8125rem;
  color: var(--muted);
}

.holds b {
  color: var(--ink);
  font-family: var(--mono);
  font-weight: 500;
}

.holds[data-tone="unset"] {
  font-family: var(--mono);
  font-style: italic;
}

.count {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 0.6875rem;
  color: var(--subtle);
}

.opts {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.1875rem;
}

.opt {
  display: grid;
  grid-template-columns: 14px 92px 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-field);
  border: 1px solid transparent;
}

.opt[data-special="true"] .name,
.opt[data-special="true"] .sum {
  color: var(--subtle);
}

.opt[data-current] {
  background: var(--primary-soft);
  border-color: color-mix(in srgb, var(--primary) 32%, transparent);
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1.5px var(--border-strong);
}

.opt[data-current] .dot {
  background: var(--primary);
  box-shadow: none;
}

.name {
  font-family: var(--mono);
  font-size: 0.78125rem;
  font-weight: 500;
}

.opt[data-current] .name {
  color: var(--primary-deep);
}

.sum {
  color: var(--muted);
  font-size: 0.78125rem;
  line-height: 1.45;
}

.opt[data-current] .sum {
  color: var(--ink);
}

.state-badge {
  font-family: var(--mono);
  font-size: 0.625rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
  white-space: nowrap;
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary-deep);
}
</style>
