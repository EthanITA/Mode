<script lang="ts" setup>
const { href, title } = defineProps<{ href?: string; title?: string }>();

const FILE = /\.(md|mdx|html?|tsx?|jsx?|mjs|cjs|vue|json|ya?ml|toml|sh|zsh|py|txt|css|lock)$/i;

const links = useLinks();

// The href stays real so Copy link still gives it, and only the click is taken over.
function onClick(event: MouseEvent): void {
  if (!href || !links.owns(href)) return;
  event.preventDefault();
  const text = (event.currentTarget as HTMLElement).textContent?.trim() ?? "";
  // Linkify reads a bare name such as README.md as a host, so a link that is only its own text and ends like a file is a path.
  const isBareFile = FILE.test(text) && href.replace(/^https?:\/\//i, "").replace(/\/$/, "") === text;
  void links.open(isBareFile ? text : href);
}
</script>

<template>
  <a :href="href" rel="noopener noreferrer" target="_blank" :title="title" @click="onClick"><slot /></a>
</template>
