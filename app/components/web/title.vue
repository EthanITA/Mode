<script lang="ts" setup>
import { ChevronLeft, ChevronRight, ExternalLink, Globe } from "@lucide/vue";

const { slug } = defineProps<{ slug: string }>();

const sc = useSidecar();
const web = $web();
const field = useTemplateRef<HTMLInputElement>("field");
const scrolled = ref(0);
const isIconBroken = ref(false);
const { cancel, commit, draft, edit, host, isEditing, openOut, page } = useWebAddress({
  focus: () => {
    field.value?.focus();
    field.value?.select();
  },
  slug: () => slug,
});

const icon = computed(() => (isIconBroken.value ? undefined : web.page?.icon));
const title = computed(
  () => web.page?.title || (sc.artifact.value?.slug === slug ? sc.artifact.value.title : "") || page.value,
);
// The host reads quieter than the path, as the design draws it; the field under it carries the caret and the selection.
const lead = computed(() => /^([a-z][a-z0-9+.-]*:\/\/)?[^/?#]*/i.exec(draft.value)?.[0] ?? "");
const tail = computed(() => draft.value.slice(lead.value.length));

function track(): void {
  requestAnimationFrame(() => (scrolled.value = field.value?.scrollLeft ?? 0));
}

watch(
  () => web.page?.icon,
  () => (isIconBroken.value = false),
);
</script>

<template>
  <UiSurface
    class="island"
    data-region="title-island"
    :data-editing="isEditing"
    pad="none"
    shape="pill"
    variant="glass-liquid"
  >
    <ChromeAction
      data-region="web-back"
      :icon="ChevronLeft"
      :is-disabled="!web.history.back"
      shape="inset"
      tip="Back · {cmd [}"
      @click="web.step(-1)"
    />
    <ChromeAction
      data-region="web-forward"
      :icon="ChevronRight"
      :is-disabled="!web.history.forward"
      shape="inset"
      tip="Forward · {cmd ]}"
      @click="web.step(1)"
    />
    <span class="rule" />
    <form v-if="isEditing" class="edit" data-region="web-address" @submit.prevent="commit">
      <input
        ref="field"
        v-model="draft"
        aria-label="Address"
        autocomplete="off"
        class="field"
        inputmode="url"
        spellcheck="false"
        type="text"
        @blur="cancel"
        @input="track"
        @keydown.esc.prevent.stop="cancel"
        @keyup="track"
        @scroll="track"
        @select="track"
      />
      <span class="mirror" aria-hidden="true">
        <span class="line" :style="{ translate: `${-scrolled}px 0` }"
          ><span class="lead">{{ lead }}</span
          >{{ tail }}</span
        >
      </span>
    </form>
    <button
      v-else
      v-press
      class="named focusable"
      type="button"
      data-region="web-address"
      data-tip="Show the URL · {cmd L}"
      @click="edit"
    >
      <img v-if="icon" alt="" class="icon" :src="icon" @error="isIconBroken = true" />
      <UiIcon v-else class="icon glyph" :icon="Globe" size="sm" />
      <span class="title">{{ title }}</span>
      <span class="host">{{ host }}</span>
    </button>
    <ChromeAction :icon="ExternalLink" is-quiet shape="inset" tip="Open in your browser" @click="openOut" />
  </UiSurface>
</template>

<style scoped>
.island {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  gap: 2px;
  height: var(--island-row-h);
  padding: 0 4px;
  transition: box-shadow var(--duration-fast) var(--ease-out);
  width: 100%;
}

.island[data-editing="true"] {
  box-shadow:
    0 0 0 1px var(--primary),
    0 0 0 4px var(--primary-soft);
}

.rule {
  background: var(--border);
  flex: none;
  height: 18px;
  margin: 0 4px;
  width: 1px;
}

.named {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: var(--ink);
  cursor: text;
  display: flex;
  flex: 1;
  gap: 8px;
  height: 32px;
  min-width: 0;
  padding: 0 4px;
  text-align: left;
}

.icon {
  border-radius: 4px;
  flex: none;
  height: 14px;
  object-fit: contain;
  width: 14px;
}

.glyph {
  color: var(--muted);
}

.title {
  flex: 0 1 auto;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host {
  color: var(--muted);
  flex: none;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  margin-left: auto;
}

.edit {
  align-self: stretch;
  flex: 1;
  margin: 0;
  min-width: 0;
  position: relative;
}

.field,
.mirror {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
}

/* Its text is drawn by the mirror above it, so only the caret and the selection show from here. */
.field {
  background: transparent;
  border: 0;
  box-sizing: border-box;
  caret-color: var(--primary);
  color: transparent;
  height: 100%;
  inset: 0;
  outline: none;
  padding: 0 4px;
  position: absolute;
  width: 100%;
}

.field::selection {
  background: var(--primary-soft);
  color: transparent;
}

.mirror {
  align-items: center;
  color: var(--ink);
  display: flex;
  inset: 0 4px;
  overflow: hidden;
  pointer-events: none;
  position: absolute;
  white-space: pre;
}

/* Same weight as the field, or its glyphs would drift off the caret it draws. */
.lead {
  color: var(--muted);
}
</style>
