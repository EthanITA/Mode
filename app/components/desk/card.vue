<script lang="ts" setup>
import type { DeskCard } from "~/composables/useDesk";

defineProps<{ card: DeskCard }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <UiSurface
    as="button"
    type="button"
    variant="card"
    pad="md"
    interactive
    class="card"
    data-region="desk-card"
    data-cmt="conversation"
    :data-tint="card.tint"
    :data-cmt-label="card.title"
    :data-cmt-tell="`the ${card.title} conversation card`"
    :data-cmt-excerpt="card.cwd"
    @click="$emit('open')"
  >
    <div class="head">
      <span class="dot" :data-live="card.live ? '' : undefined" />
      <span class="title">{{ card.title }}</span>
      <span v-if="card.ago" class="ago mono-meta">{{ card.ago }}</span>
    </div>

    <div class="place mono-meta">
      {{ card.cwd }}<template v-if="card.gitBranch"> · {{ card.gitBranch }}</template>
    </div>

    <div class="badges">
      <span v-if="card.waiting" class="badge" data-tone="waiting">{{ card.waitText }}</span>
      <span v-if="card.hasNew" class="badge" data-tone="new">{{ card.newText }}</span>
      <span v-if="card.running" class="badge" data-tone="running"><span class="write" />running</span>
      <span v-if="card.quiet" class="badge" data-tone="quiet">idle</span>
    </div>

    <div v-if="card.arts.length" class="arts">
      <span v-for="art in card.arts" :key="art.slug" class="art mono-meta">
        <span class="file">{{ art.title }}</span>
        <span v-if="art.isNew" class="dot" />
      </span>
    </div>

    <div class="foot mono-meta">
      <span class="mode-dot" :data-tint="card.modeTint" />
      {{ card.mode }} · {{ card.style }}
      <span class="spacer" />
      <span v-if="card.board !== undefined">board {{ card.board }}</span>
    </div>
  </UiSurface>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
  width: 100%;
}

.head {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.head .dot {
  background: var(--tint);
  flex: none;
  opacity: 0.45;
  transition: opacity var(--duration-press) var(--ease-out);
}

.head .dot[data-live] {
  opacity: 1;
}

.title {
  color: var(--ink);
  flex: 1;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ago {
  color: var(--subtle);
  flex: none;
}

.place {
  color: var(--subtle);
  margin-top: -6px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.badge {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
}

.badge[data-tone="waiting"] {
  background: var(--warning-soft);
  border: 1px solid var(--warning);
  color: var(--warning);
}

.badge[data-tone="new"] {
  background: var(--primary);
  color: var(--primary-content);
}

.badge[data-tone="running"] {
  background: var(--sunken);
  color: var(--muted);
  font-family: var(--mono);
  font-weight: 500;
  text-transform: none;
}

.badge[data-tone="quiet"] {
  border: 1px solid var(--border);
  color: var(--muted);
  font-family: var(--mono);
  font-weight: 500;
  text-transform: none;
}

.write {
  background: var(--primary);
  border-radius: 2px;
  height: 3px;
  width: 10px;
}

.arts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.art {
  align-items: center;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--ink);
  display: inline-flex;
  gap: 6px;
  height: 24px;
  max-width: 100%;
  padding: 0 9px;
  text-transform: none;
}

.art .file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.art .dot {
  background: var(--primary);
  flex: none;
}

.foot {
  align-items: center;
  color: var(--muted);
  display: flex;
  gap: 7px;
}

.mode-dot {
  background: var(--tint);
  flex: none;
}

.spacer {
  flex: 1;
}
</style>
