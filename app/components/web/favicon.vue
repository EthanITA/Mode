<script lang="ts" setup>
import { Globe } from "@lucide/vue";
import type { WebPage } from "~~/lib/web/page/protocol";
import { parseTarget } from "~~/lib/web/target";

type Shown = { kind: "globe" } | { kind: "search" } | { kind: "site"; src: string };

const { address, page } = defineProps<{
  address: string;
  /** The page on screen, whose own icon wins for its site. */
  page?: WebPage;
}>();

const TYPING = 180;
// A lookup slower than this shows the globe, rather than leave the last site's icon on a new address.
const PATIENCE = 300;

const shown = ref<Shown>({ kind: "globe" });
let asked = 0;
let typing: ReturnType<typeof setTimeout> | undefined;

function loads(src: string): Promise<boolean> {
  return new Promise((done) => {
    const image = new Image();
    image.onload = () => done(image.naturalWidth > 0);
    image.onerror = () => done(false);
    image.src = src;
  });
}

function isSameSite(url: string, target: URL): boolean {
  try {
    return new URL(url).origin === target.origin;
  } catch {
    return false;
  }
}

async function settle(): Promise<void> {
  const ask = ++asked;
  const typed = address.trim();
  const target = parseTarget(typed);
  if (!target) {
    shown.value = typed ? { kind: "search" } : { kind: "globe" };
    return;
  }
  const own = page?.icon && isSameSite(page.url, target) ? [page.icon] : [];
  const slow = setTimeout(() => ask === asked && (shown.value = { kind: "globe" }), PATIENCE);
  try {
    for (const src of [...own, `/api/web/icon?origin=${encodeURIComponent(target.origin)}`]) {
      const isLoaded = await loads(src);
      if (ask !== asked) return;
      if (isLoaded) return void (shown.value = { kind: "site", src });
    }
    shown.value = { kind: "globe" };
  } finally {
    clearTimeout(slow);
  }
}

watch(
  () => [address, page?.icon, page?.url],
  () => {
    clearTimeout(typing);
    typing = setTimeout(settle, TYPING);
  },
);
void settle();
onBeforeUnmount(() => clearTimeout(typing));
</script>

<template>
  <img v-if="shown.kind === 'site'" alt="" class="favicon" data-favicon="site" :src="shown.src" />
  <svg v-else-if="shown.kind === 'search'" aria-hidden="true" class="favicon" data-favicon="search" viewBox="0 0 48 48">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
  <UiIcon v-else class="favicon" data-favicon="globe" :icon="Globe" size="sm" />
</template>

<style scoped>
.favicon {
  @apply size-3.5 flex-none rounded-sm object-contain;
}
</style>
