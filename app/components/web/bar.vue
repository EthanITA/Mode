<script lang="ts" setup>
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw } from "@lucide/vue";
import { parseTarget } from "~~/lib/web/target";

const { conversation, slug } = defineProps<{ conversation: string; slug: string }>();

const REFUSED = "Only http and https addresses open here, such as localhost:3000 or docs.mode.dev.";

const sc = useSidecar();
const chrome = useChrome();
const web = $web();
const follow = $follow();
const field = useTemplateRef<HTMLInputElement>("field");
const isEditing = ref(false);
const isRefused = ref(false);
const isOpening = ref(false);
const draft = ref("");

const address = computed(() => web.page?.url ?? sc.artifact.value?.url);
const host = computed(() => (address.value ? new URL(address.value).host : ""));
const page = computed(() => (address.value ? Web.pageOf(address.value) : ""));
const away = computed(() => Web.elsewhere(sc.artifact.value?.threads ?? [], page.value)[0]);

async function edit(): Promise<void> {
  draft.value = address.value ?? "";
  isRefused.value = false;
  isEditing.value = true;
  await nextTick();
  field.value?.focus();
  field.value?.select();
}

function cancel(): void {
  isEditing.value = false;
  isRefused.value = false;
}

async function commit(): Promise<void> {
  const typed = parseTarget(draft.value);
  if (!typed) {
    isRefused.value = true;
    chrome.toast(REFUSED, "warning");
    return;
  }
  isOpening.value = true;
  try {
    const next = await web.visit({ slug, typed });
    isEditing.value = false;
    if (next !== slug) follow.show({ key: conversation, slug: next });
  } catch (error) {
    chrome.toast(failReason(error) ?? `${typed.host} could not be opened here`, "destructive");
  } finally {
    isOpening.value = false;
  }
}

function openOut(): void {
  if (address.value) window.open(address.value, "_blank", "noopener");
}

watch(
  () => slug,
  () => cancel(),
);
</script>

<template>
  <span class="steps">
    <UiIconButton
      :icon="ArrowLeft"
      aria-label="Back"
      data-region="web-back"
      data-tip="Back"
      :disabled="!web.history.back"
      icon-size="sm"
      @click="web.step(-1)"
    />
    <UiIconButton
      :icon="ArrowRight"
      aria-label="Forward"
      data-region="web-forward"
      data-tip="Forward"
      :disabled="!web.history.forward"
      icon-size="sm"
      @click="web.step(1)"
    />
  </span>
  <form v-if="isEditing" class="address" data-region="web-address" :data-refused="isRefused" @submit.prevent="commit">
    <input
      ref="field"
      v-model="draft"
      aria-label="Address"
      autocomplete="off"
      class="field"
      data-tip="Open the address · {enter}, {esc} keeps this page"
      inputmode="url"
      spellcheck="false"
      type="text"
      :aria-invalid="isRefused"
      :disabled="isOpening"
      @blur="isOpening || cancel()"
      @input="isRefused = false"
      @keydown.esc.prevent.stop="cancel"
    />
  </form>
  <button
    v-else
    v-press
    class="path focusable"
    type="button"
    data-region="web-address"
    data-tip="Edit the address"
    @click="edit"
  >
    <span class="host">{{ host }}</span>
    <span>{{ page }}</span>
  </button>
  <button
    v-if="away && !isEditing"
    v-press
    class="elsewhere focusable"
    type="button"
    data-tip="Go to the page the thread was left on"
    @click="web.go(away.page)"
  >
    {{ plural(away.count, "thread") }} on {{ away.page }}
  </button>
  <UiIconButton
    :icon="ExternalLink"
    aria-label="Open in a browser tab"
    data-tip="Open in a browser tab"
    icon-size="sm"
    @click="openOut"
  />
  <UiIconButton
    :icon="RotateCw"
    aria-label="Reload"
    class="reload"
    data-tip="Reload · {cmd R}"
    icon-size="sm"
    @click="web.reload()"
  />
</template>

<style scoped>
.steps {
  display: flex;
  flex: none;
  gap: 2px;
  margin-left: -4px;
}

.path {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--ink);
  cursor: text;
  display: flex;
  flex: 1;
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  height: 26px;
  margin-left: -6px;
  min-width: 0;
  overflow: hidden;
  padding: 0 6px;
  text-align: left;
  white-space: nowrap;
}

.path:hover {
  background: var(--sunken);
}

.path > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.host {
  color: var(--muted);
  flex: none;
  font-weight: 500;
}

.address {
  display: flex;
  flex: 1;
  margin: 0 0 0 -6px;
  min-width: 0;
}

.field {
  background: var(--sunken);
  border: 1px solid var(--primary);
  border-radius: 8px;
  box-shadow: 0 0 0 2px var(--primary-soft);
  box-sizing: border-box;
  color: var(--ink);
  flex: 1;
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  height: 26px;
  min-width: 0;
  outline: none;
  padding: 0 6px;
}

.address[data-refused="true"] .field {
  border-color: var(--error);
  box-shadow: 0 0 0 2px var(--error-soft);
}

.elsewhere {
  align-items: center;
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  gap: 6px;
  height: 26px;
  margin-right: 4px;
  padding: 0 10px;
  white-space: nowrap;
}

.elsewhere::before {
  background: var(--primary);
  border-radius: 999px;
  content: "";
  height: 6px;
  width: 6px;
}

.elsewhere:hover {
  color: var(--ink);
}

.reload {
  margin-right: 4px;
}
</style>
