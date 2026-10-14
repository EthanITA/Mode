export const $artifact = defineStore(() => {
  const isFull = ref(false);
  // Only a sheet holding a page can grow, so F on a page routed on its own does nothing.
  const canGrow = ref(false);

  function toggleFull(): void {
    if (canGrow.value) isFull.value = !isFull.value;
  }

  return { canGrow, isFull, toggleFull };
});
