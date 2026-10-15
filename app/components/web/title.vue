<script lang="ts" setup>
import { ChevronLeft, ChevronRight, ExternalLink } from "@lucide/vue";

const { slug } = defineProps<{ slug: string }>();

const sc = useSidecar();
const web = $web();
const field = useTemplateRef<HTMLInputElement>("field");
const scrolled = ref(0);
const { address, cancel, commit, draft, edit, host, isEditing, openOut, page } = useWebAddress({
  focus: () => {
    field.value?.focus();
    field.value?.select();
  },
  slug: () => slug,
});

const title = computed(
  () => web.page?.title || (sc.artifact.value?.slug === slug ? sc.artifact.value.title : "") || page.value,
);
// The host reads quieter than the path, as the design draws it; the field under it carries the caret and the selection.
const lead = computed(() => /^([a-z][a-z0-9+.-]*:\/\/)?[^/?#]*/i.exec(draft.value)?.[0] ?? "");
const tail = computed(() => draft.value.slice(lead.value.length));

function track(): void {
  requestAnimationFrame(() => (scrolled.value = field.value?.scrollLeft ?? 0));
}
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
      <WebFavicon class="icon" :address="draft" :page="web.page" />
      <span class="box">
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
      <WebFavicon class="icon" :address="address" :page="web.page" />
      <span class="title">{{ title }}</span>
      <span class="host">{{ host }}</span>
    </button>
    <ChromeAction :icon="ExternalLink" is-quiet shape="inset" tip="Open in your browser" @click="openOut" />
  </UiSurface>
</template>

<style scoped>
.island {
  @apply flex h-(--island-row-h) w-full items-center gap-0.5 px-1 py-0 transition-shadow duration-(--duration-fast) ease-out;
}

.island[data-editing="true"] {
  @apply ring-3 ring-primary-soft ring-offset-1 ring-offset-primary;
}

.rule {
  @apply mx-1 my-0 h-4.5 w-px flex-none bg-border;
}

.named {
  @apply flex h-8 min-w-0 flex-1 cursor-text items-center gap-2 rounded-full border-0 bg-transparent px-1 py-0 text-left text-fg;
}

.icon {
  @apply text-muted;
}

.title {
  @apply min-w-0 flex-initial truncate text-[13px] font-bold tracking-[-0.01em];
}

.host {
  @apply ml-auto flex-none font-mono typo-meta-strong text-muted;
}

/* The icon sits where it does unedited, so the typed address starts where the title did. */
.edit {
  @apply m-0 flex min-w-0 flex-1 items-center gap-2 self-stretch pl-1;
}

.box {
  @apply relative min-w-0 flex-1 self-stretch;
}

.field,
.mirror {
  @apply font-mono text-[12.5px] font-semibold;
}

/* Its text is drawn by the mirror above it, so only the caret and the selection show from here. */
.field {
  @apply absolute inset-0 size-full border-0 bg-transparent py-0 pr-1 pl-0 text-transparent caret-primary outline-none;
}

.field::selection {
  @apply bg-primary-soft text-transparent;
}

.mirror {
  @apply pointer-events-none absolute inset-y-0 right-1 left-0 flex items-center overflow-hidden whitespace-pre text-fg;
}

/* Same weight as the field, or its glyphs would drift off the caret it draws. */
.lead {
  @apply text-muted;
}
</style>
