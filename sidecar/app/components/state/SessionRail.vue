<script setup lang="ts">
import type { SessionSummary } from "~~/shared/types/mode"

const { data: why } = useWhy()
const { data: sessions, pending, error } = useSessions()

const currentId = computed(() => why.value?.session)

// SessionSummary carries no path (D1's session listing has no per-session cwd yet);
// only the current session's own Why response can name its directory.
function label(current: { path: string }): string {
  const parts = current.path.split("/")
  return parts[parts.length - 1] ?? current.path
}

function slotLine(session: SessionSummary): string {
  const mode = session.slots.mode.name ?? "off"
  const style = session.slots.style.name ?? "off"
  return `${mode} ${session.slots.mode.how}, ${style} ${session.slots.style.how}`
}
</script>

<template>
  <details class="rail" :data-state="pending ? 'loading' : error ? 'error' : 'ready'">
    <summary>
      <span class="dot"></span>
      <span class="nm">{{ why ? label(why) : "session" }}</span>
      <span v-if="sessions" class="ct">{{ sessions.length }}</span>
      <span class="caret" aria-hidden="true">›</span>
    </summary>

    <p v-if="pending" class="msg">Reading sessions…</p>
    <p v-else-if="error" class="msg" data-tone="error">Sessions unavailable.</p>
    <ul v-else-if="sessions && sessions.length" class="list">
      <li
        v-for="s in sessions"
        :key="s.session"
        :data-current="s.session === currentId || undefined"
      >
        <span class="dot"></span>
        <span class="sid">{{ s.session }}</span>
        <span class="sl">{{ slotLine(s) }}</span>
      </li>
    </ul>
    <p v-else class="msg">No other sessions running.</p>
  </details>
</template>

<style scoped>
.rail {
  border: 1px solid var(--border);
  border-radius: var(--radius-field);
  background: var(--raised);
}

.rail > summary {
  list-style: none;
  cursor: pointer;
  padding: 0.4375rem 0.625rem;
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  border-radius: var(--radius-field);
}

.rail > summary::-webkit-details-marker {
  display: none;
}

.rail > summary:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: none;
  background: var(--primary);
}

.nm {
  font-size: 0.78125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ct {
  font-family: var(--mono);
  font-size: 0.59375rem;
  color: var(--subtle);
  margin-left: auto;
}

.caret {
  color: var(--subtle);
  display: inline-flex;
  transition: transform var(--duration-fast) var(--ease-out);
}

.rail[open] .caret {
  transform: rotate(90deg);
}

.msg {
  border-top: 1px solid var(--border);
  padding: 0.5rem 0.625rem 0.5625rem;
  font-size: 0.78125rem;
  color: var(--muted);
  margin: 0;
}

.msg[data-tone="error"] {
  color: var(--error);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0.625rem 0.5625rem;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.list li {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.25rem 0;
}

.list .dot {
  background: var(--border-strong);
}

.list li[data-current] .dot {
  background: var(--primary);
}

.sid {
  font-family: var(--mono);
  font-size: 0.625rem;
  color: var(--subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sl {
  font-family: var(--mono);
  font-size: 0.59375rem;
  color: var(--muted);
  margin-left: auto;
  white-space: nowrap;
}
</style>
