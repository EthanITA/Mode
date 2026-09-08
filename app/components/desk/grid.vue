<script lang="ts" setup>
const sc = useSidecar();
const { cards, meta } = useDeskCards();
loadDeskBoards();

const emit = defineEmits<{ open: [key: string] }>();

function open(key: string, artifacts: string[]): void {
  markDeskSeen(key, artifacts);
  emit("open", key);
}
</script>

<template>
  <div class="desk" data-region="desk">
    <div class="wrap">
      <div class="title-row">
        <h1>Conversations</h1>
        <span class="meta mono-meta">{{ meta }}</span>
      </div>

      <div class="grid">
        <DeskCard
          v-for="card in cards"
          :key="card.key"
          :card="card"
          @open="open(card.key, sc.sessions.value.find((s) => s.key === card.key)?.artifacts ?? [])"
        />
      </div>

      <p v-if="!cards.length" class="empty">No conversation has been seen yet. One appears here as soon as it runs.</p>
    </div>
  </div>
</template>

<style scoped>
.desk {
  box-sizing: border-box;
  inset: 0;
  overflow: auto;
  padding: 88px 40px 60px;
  position: absolute;
}

.wrap {
  margin: 0 auto;
  max-width: 1120px;
}

.title-row {
  align-items: baseline;
  display: flex;
  gap: 12px;
  margin: 0 0 20px;
}

.title-row h1 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0;
}

.meta {
  color: var(--muted);
}

.grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.empty {
  color: var(--muted);
  font-size: 13px;
}
</style>
