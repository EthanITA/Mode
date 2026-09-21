import { splitLines } from "./fsutil.ts"

function trimLines(lines: string[]): string {
  const out = [...lines]
  while (out.length && !out[0]?.trim()) out.shift()
  while (out.length && !out[out.length - 1]?.trim()) out.pop()
  return out.join("\n")
}

export function unquote(value: string): string {
  const v = value.trim()
  const quote = v[0]
  if (v.length > 1 && quote === v[v.length - 1] && (quote === '"' || quote === "'")) return v.slice(1, -1)
  return v
}

export function splitFrontMatter(text: string): { meta: Record<string, string>; body: string } {
  const lines = splitLines(text)
  if (!lines.length || lines[0]?.trim() !== "---") return { meta: {}, body: trimLines(lines) }
  const meta: Record<string, string> = {}
  let end: number | undefined
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (line.trim() === "---") {
      end = i
      break
    }
    const sep = line.indexOf(":")
    if (sep >= 0) meta[line.slice(0, sep).trim()] = unquote(line.slice(sep + 1))
  }
  // An unterminated fence is body text that happens to open with a rule, not front matter.
  // The loop starts at i=1, so a found index is always truthy.
  if (!end) return { meta: {}, body: trimLines(lines) }
  return { meta, body: trimLines(lines.slice(end + 1)) }
}
