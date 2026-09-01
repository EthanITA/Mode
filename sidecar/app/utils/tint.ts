export const TINTS = ["violet", "amber", "blue", "green", "rose", "cyan", "orange", "slate"] as const;
export type Tint = (typeof TINTS)[number];

// Contracts and subagent records name terminal colours; the stylesheet paints Cela tints.
const NAMED: Record<string, Tint> = {
  amber: "amber",
  blue: "blue",
  brown: "orange",
  cyan: "cyan",
  gray: "slate",
  green: "green",
  grey: "slate",
  magenta: "rose",
  orange: "orange",
  pink: "rose",
  purple: "violet",
  red: "rose",
  teal: "cyan",
  violet: "violet",
  white: "slate",
  yellow: "amber",
};

function fromKey(key: string): Tint {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length] ?? "violet";
}

export function tintOf(color: string | undefined, key: string): Tint {
  return (color && NAMED[color.toLowerCase()]) || fromKey(key);
}
