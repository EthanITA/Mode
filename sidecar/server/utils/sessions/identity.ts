export const IDENTITY_COLORS = ["violet", "amber", "blue", "green", "magenta", "cyan", "orange"] as const

// Keyed on the session, not the mode: switching studio to copilot must not recolour the tab.
export function sessionColor(key: string): string {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return IDENTITY_COLORS[hash % IDENTITY_COLORS.length] || IDENTITY_COLORS[0]
}
