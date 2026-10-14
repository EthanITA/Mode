export const $artifact = defineStore(() => {
  const isFull = ref(false);
  // Only a sheet holding a page can grow, so F on a page routed on its own does nothing.
  const canGrow = ref(false);
  const isSite = ref(false);
  // A grown live site brings its own header island, so every other island steps aside.
  const isBare = computed(() => isFull.value && isSite.value);

  function toggleFull(): void {
    if (canGrow.value) isFull.value = !isFull.value;
  }

  return { canGrow, isBare, isFull, isSite, toggleFull };
});
