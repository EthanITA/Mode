export function stepOf(event: KeyboardEvent): -1 | 1 | undefined {
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return undefined;
  // By the key's place too, since a layout that types [ with ⌥ never reports "[" under ⌘.
  if (event.key === "[" || event.code === "BracketLeft") return -1;
  if (event.key === "]" || event.code === "BracketRight") return 1;
  return undefined;
}

export function isAddressKey(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "l";
}
