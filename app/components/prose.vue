<script lang="ts">
import { createMarkdownParser } from "comark";
import taskList from "comark/plugins/task-list";
import type { MarkdownDocument as Tree } from "comark";
import ProseLink from "./prose-link.vue";

const parse = createMarkdownParser({
  // Turns arrive whole over SSE; autoClose only mangles multi-line emphasis into a stray `**`.
  autoClose: false,
  plugins: [taskList()],
  // No html plugin: turn text is untrusted and its XML wrappers must stay literal.
  registerDefaultPlugins: false,
});

const COMPONENTS = { a: ProseLink };
</script>

<script lang="ts" setup>
const { value } = defineProps<{ value: string }>();

const tree = shallowRef<Tree>();

watch(
  () => value,
  async (next) => {
    const parsed = await parse(next);
    if (next === value) tree.value = parsed;
  },
  { immediate: true },
);
</script>

<template>
  <div class="prose">
    <MarkdownDocument v-if="tree" :components="COMPONENTS" :value="tree" />
    <p v-else class="raw">{{ value }}</p>
  </div>
</template>

<style scoped>
.prose {
  font-size: 13px;
  line-height: 1.5;
  min-width: 0;
  overflow-wrap: anywhere;
}

.raw {
  margin: 0;
  white-space: pre-wrap;
}

.prose :deep(> :first-child) {
  margin-top: 0;
}

.prose :deep(> :last-child) {
  margin-bottom: 0;
}

.prose :deep(p) {
  margin: 0 0 8px;
}

.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3),
.prose :deep(h4),
.prose :deep(h5),
.prose :deep(h6) {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.35;
  margin: 12px 0 6px;
}

.prose :deep(h1) {
  font-size: 15px;
}

.prose :deep(h2) {
  font-size: 14px;
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}

.prose :deep(li) {
  margin: 0 0 3px;
}

.prose :deep(li > p) {
  margin: 0;
}

.prose :deep(.contains-task-list) {
  list-style: none;
  padding-left: 2px;
}

.prose :deep(.task-list-item-checkbox) {
  accent-color: var(--primary);
  margin-right: 6px;
  pointer-events: none;
  vertical-align: baseline;
}

.prose :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.prose :deep(a:hover) {
  text-decoration-thickness: 2px;
}

.prose :deep(code) {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-selector);
  font-family: var(--mono);
  font-size: 0.88em;
  padding: 1px 4px;
}

/* The bubble is width-capped, so a long line has to scroll here or it drags the layout wider. */
.prose :deep(pre) {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-field);
  margin: 0 0 8px;
  max-width: 100%;
  overflow-x: auto;
  padding: 8px 10px;
}

.prose :deep(pre code) {
  background: none;
  border: 0;
  padding: 0;
  white-space: pre;
}

.prose :deep(blockquote) {
  border-left: 2px solid var(--border-strong);
  color: var(--muted);
  margin: 0 0 8px;
  padding: 2px 0 2px 10px;
}

.prose :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}

.prose :deep(table) {
  border-collapse: collapse;
  display: block;
  margin: 0 0 8px;
  max-width: 100%;
  overflow-x: auto;
  width: max-content;
}

.prose :deep(th),
.prose :deep(td) {
  border-bottom: 1px solid var(--border);
  padding: 4px 10px 4px 0;
  text-align: left;
  vertical-align: top;
}

.prose :deep(th) {
  color: var(--subtle);
  font-weight: 600;
  white-space: nowrap;
}

.prose :deep(img) {
  border-radius: var(--radius-field);
  max-width: 100%;
}
</style>
