<script lang="ts" setup>
const chrome = useChrome();
const inlineArmed = useState<boolean>("sc:inline-armed", () => false);
const inlineAsk = useState<boolean>("sc:inline-ask", () => false);

const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

function typing(event: KeyboardEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(EDITABLE));
}

let armKey: string | undefined;

function onKeyDown(event: KeyboardEvent): void {
  const meta = event.metaKey || event.ctrlKey;
  // A held key auto-repeats into the popover box its own click just focused.
  if (armKey && event.key.toLowerCase() === armKey) {
    event.preventDefault();
    return;
  }
  if (meta && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (inlineArmed.value) {
      inlineAsk.value = true;
      return;
    }
    chrome.jump.toggle();
    return;
  }
  if (event.key === "Escape") {
    if (chrome.dismiss()) event.preventDefault();
    return;
  }
  // Option also arms, because C is a letter and dies the moment the composer holds focus.
  if (event.key === "Alt" && !event.repeat) {
    armKey = "alt";
    chrome.comment.arm(true);
    return;
  }
  if (meta || event.altKey || typing(event)) return;
  if (event.key.toLowerCase() === "c" && !event.repeat) {
    armKey = "c";
    chrome.comment.arm(true);
  } else if (event.key === "!") chrome.canvas.fit.value?.();
}

function onKeyUp(event: KeyboardEvent): void {
  if (!armKey || event.key.toLowerCase() !== armKey) return;
  armKey = undefined;
  chrome.comment.release();
}

function onBlur(): void {
  armKey = undefined;
  chrome.comment.disarm();
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  // A held key loses its keyup on blur, and would leave the page swallowing every click.
  window.addEventListener("blur", onBlur);
  onScopeDispose(() => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  });
});
</script>

<template>
  <NuxtPage />

  <!-- Viewport overlays, not islands: they answer to the window rather than to the
       content column, so the layout shell deliberately does not bound them.
       ChromeTopRight is a cell of the island row and is rendered by the layout. -->
  <ChromeJump />
  <ChromeCommentMode />
  <ChromeToaster />
</template>
