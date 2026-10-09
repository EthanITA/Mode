import { readFileSync } from "node:fs"

const STYLE = /<style>([\s\S]*?)<\/style>/g
const styleOf = (src: string): string => [...src.matchAll(STYLE)].map((m) => m[1] ?? "").join("\n")
const all = (pattern: RegExp, text: string): string[] => [...text.matchAll(pattern)].map((m) => m[1] ?? "")
const sorted = (items: Iterable<string>): string[] => [...items].sort()

// A pane hidden until script routes to it, or a container left empty for script to fill, is a blank page with JavaScript off.
function scriptOnly(src: string): string[] {
  const style = styleOf(src)
  const hidden = new Set(all(/^\s*\.([A-Za-z][\w-]*)\s*\{[^}]*display:\s*none/gm, style))
  const reshown = new Set(all(/^\s*\.([A-Za-z][\w-]*)\.[\w-]+\s*\{[^}]*display:\s*(?!none)/gm, style))
  const guarded = new Set(all(/^\s*\.js\s+\.([A-Za-z][\w-]*)/gm, style))
  const out = sorted([...hidden].filter((c) => reshown.has(c) && !guarded.has(c))).map(
    (c) => `.${c} is display:none by default and only script re-shows it; guard it with .js`,
  )
  const scripts = all(/<script[^>]*>([\s\S]*?)<\/script>/g, src).join("\n")
  const quoted = all(/'([^']+)'/g, scripts)
  const body = src.replace(/<script[\s\S]*?<\/script>/g, "")
  for (const [, tag = "", id = ""] of body.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>\s*<\/\1>/g)) {
    // A canvas has no HTML content to author, so prose never depends on it.
    if (tag.toLowerCase() === "canvas") continue
    if (scripts.includes(`"${id}"`) || quoted.includes(id)) out.push(`#${id} is empty in the markup and filled only by script; author it in HTML`)
  }
  return out
}

function nestedPanel(src: string): string[] {
  const depth: string[] = []
  const hits: number[] = []
  for (const match of src.matchAll(/<div class="([^"]*)"|<div|<\/div>/g)) {
    if (match[0] === "</div>") {
      depth.pop()
      continue
    }
    const cls = match[1] ?? ""
    if (cls.includes("table-wrap") && depth.some((outer) => outer.includes("panel"))) hits.push(src.slice(0, match.index).split("\n").length)
    depth.push(cls)
  }
  return hits.map((line) => `${line}: a table-wrap inside a panel`)
}

function svgClasses(src: string): string[] {
  const used = new Set<string>()
  for (const block of src.match(/<svg[\s\S]*?<\/svg>/g) ?? []) for (const classes of all(/class="([^"]+)"/g, block)) for (const c of classes.split(/\s+/).filter(Boolean)) used.add(c)
  const defined = new Set(all(/\.([A-Za-z][A-Za-z0-9_-]*)/g, styleOf(src)))
  return sorted([...used].filter((c) => !defined.has(c))).map((c) => `  .${c}`)
}

const CHECKS: Record<string, (src: string) => string[]> = { "script-only": scriptOnly, "nested-panel": nestedPanel, "svg-classes": svgClasses }
const check = CHECKS[process.argv[2] ?? ""]
if (!check) {
  console.error(`checks.ts: unknown check. Known: ${Object.keys(CHECKS).join(", ")}`)
  process.exitCode = 2
} else {
  for (const line of check(readFileSync(0, "utf8"))) console.log(line)
}
