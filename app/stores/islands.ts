export const $islands = defineStore(() => {
  // In memory, so a reload always brings the islands back for whoever forgot the corner.
  const isHidden = ref(false);

  return { isHidden };
});
