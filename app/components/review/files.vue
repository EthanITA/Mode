<script lang="ts" setup>
const review = useReview();

const files = computed(() =>
  (review.snapshot.value?.files ?? []).map((file) => ({
    ...file,
    churn: Review.counts(file),
    dir: homePath(file.path.slice(0, file.path.lastIndexOf("/"))),
  })),
);
</script>

<template>
  <ul class="files" data-region="review-files-list">
    <li v-for="file in files" :key="file.path">
      <button
        v-press
        class="file focusable"
        type="button"
        :data-selected="file.path === review.file.value?.path"
        @click="review.selected.value = file.path"
      >
        <span class="name">{{ basename(file.path) }}</span>
        <span class="dir mono-meta">{{ file.dir }}</span>
        <span class="meta">
          <span v-for="turn in file.turns" :key="turn" class="turn mono-meta">T{{ turn }}</span>
          <span v-if="file.isNew" class="tag mono-meta" data-tag="new">new</span>
          <span v-if="file.isDeleted" class="tag mono-meta" data-tag="deleted">deleted</span>
          <span class="churn mono-meta">
            <span data-mark="add">+{{ file.churn.added }}</span>
            <span data-mark="remove">−{{ file.churn.removed }}</span>
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.files {
  display: flex;
  flex-direction: column;
  gap: 2px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.file {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-field);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font: inherit;
  gap: 3px;
  padding: 8px 10px;
  text-align: left;
  width: 100%;
}

.file:hover {
  background: var(--sunken);
}

.file[data-selected="true"] {
  background: var(--raised);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.name {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.dir {
  color: var(--subtle);
  overflow-wrap: anywhere;
  text-transform: none;
}

.meta {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.turn {
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0 5px;
  text-transform: none;
}

.tag {
  border-radius: 999px;
  padding: 0 7px;
}

.tag[data-tag="new"] {
  background: var(--primary-soft);
  color: var(--primary-deep);
}

.tag[data-tag="deleted"] {
  background: var(--error-soft);
  color: var(--error);
}

.churn {
  display: inline-flex;
  gap: 5px;
  text-transform: none;
}

.churn [data-mark="add"] {
  color: var(--success);
}

.churn [data-mark="remove"] {
  color: var(--error);
}
</style>
