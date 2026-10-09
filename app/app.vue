<script lang="ts" setup>
const chrome = useChrome();
const inlineArmed = useState<boolean>("sc:inline-armed", () => false);
const inlineAsk = useState<boolean>("sc:inline-ask", () => false);

// The installed app's title bar takes this colour, so it follows the theme toggle rather than the OS.
const TITLE_BAR = { dark: "#111113", light: "#f9f8f5" } as const;
const titleBar = ref<string>(TITLE_BAR.light);
const readTheme = (): void => {
  titleBar.value = document.documentElement.getAttribute("data-theme") === "dark" ? TITLE_BAR.dark : TITLE_BAR.light;
};
const themes = new MutationObserver(readTheme);
onMounted(() => {
  readTheme();
  themes.observe(document.documentElement, { attributeFilter: ["data-theme"], attributes: true });
});
onBeforeUnmount(() => themes.disconnect());

const route = useRoute();
const look = useArtifactTheme();
const isFull = useArtifactFullscreen();
// A page grown over everything, or open on its own, lends the window its theme; back in its pane the app keeps its own.
watchEffect(() => {
  const isWhole = isFull.value || !!route.params.slug;
  const own = localStorage.getItem("cela-theme") === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", isWhole ? look.theme.value : own);
});

useHead({
  link: [
    { href: "/manifest.webmanifest", rel: "manifest" },
    { href: "/icons/sidecar.svg", rel: "icon", type: "image/svg+xml" },
    { href: "/icons/sidecar-192.png", rel: "apple-touch-icon" },
  ],
  meta: [{ content: titleBar, name: "theme-color" }],
});

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
  // ⌘K means comment everywhere: an editor notes its selection itself, so what reaches here arms the picker.
  if (meta && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (inlineArmed.value) {
      inlineAsk.value = true;
      return;
    }
    if (chrome.comment.armed.value) chrome.comment.disarm();
    else chrome.comment.arm();
    return;
  }
  if (event.key === "Escape") {
    if (chrome.dismiss()) event.preventDefault();
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
  // Clicking into the artifact frame blurs this window too, and that is not leaving the app.
  if (document.activeElement instanceof HTMLIFrameElement) return;
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
