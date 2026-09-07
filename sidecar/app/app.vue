<script lang="ts" setup>
const chrome = useChrome();

const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

function typing(event: KeyboardEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(EDITABLE));
}

function onKeyDown(event: KeyboardEvent): void {
  const meta = event.metaKey || event.ctrlKey;
  if (meta && event.key.toLowerCase() === "k") {
    event.preventDefault();
    chrome.jump.toggle();
    return;
  }
  if (event.key === "Escape") {
    if (chrome.dismiss()) event.preventDefault();
    return;
  }
  if (meta || event.altKey || typing(event)) return;
  if (event.key.toLowerCase() === "c" && !event.repeat) chrome.comment.arm(true);
  else if (event.key === "!") chrome.canvas.fit.value?.();
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key.toLowerCase() === "c") chrome.comment.release();
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  // A held C loses its keyup on blur, and would leave the page swallowing every click.
  window.addEventListener("blur", chrome.comment.disarm);
  onScopeDispose(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", chrome.comment.disarm);
  });
});
</script>

<template>
  <NuxtPage />

  <ChromeTopRight />
  <ChromeJump />
  <ChromeCommentMode />
  <ChromeToaster />
</template>
