export const $artifact = defineStore(() => {
  const isFull = ref(false);
  // Only a sheet holding a page can grow, so F on a page routed on its own does nothing.
  const canGrow = ref(false);
  // Grown, the list opens over the page's left edge, and shrinking puts it back in its column.
  const isListed = ref(false);

  watch(isFull, (full) => {
    if (!full) isListed.value = false;
  });

  function toggleFull(): void {
    if (canGrow.value) isFull.value = !isFull.value;
  }

  return { canGrow, isFull, isListed, toggleFull };
});
