import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderMermaidSVGAsync } from "beautiful-mermaid"
import { createMarkdownParser } from "comark"
import type { MarkdownDocument } from "comark"
import { Syntax } from "../../shared/utils/highlight.ts"
import { pluginRoot } from "./mode/paths.ts"

type MdNode = MarkdownDocument["nodes"][number]

// A local file the user or Claude wrote, so the html plugin stays on and raw tags render as written.
const parse = createMarkdownParser({ autoClose: false })

const VOID = new Set(["area", "br", "col", "embed", "hr", "img", "input", "source", "track", "wbr"])
// The house style every page artifact starts from, so a .md reads as one of them and follows its data-ds.
const STYLESHEETS = ["themes.css", "doc-system.css"]
const MARKDOWN_CSS = `blockquote{border-left:2px solid var(--border-strong);color:var(--muted);margin:0;padding-left:14px}
img{max-width:100%}
li>p{margin:0}
.contains-task-list{list-style:none;padding-left:0}
.task-list-item-checkbox{accent-color:var(--accent);margin-right:6px}`
// A wide diagram scrolls once fitting it would shrink its labels below three quarters of their size.
const DIAGRAM_CSS = `.diagram{--page-bg:var(--bg);overflow-x:auto}
.diagram svg{display:block;height:auto;margin-inline:auto;width:clamp(calc(var(--natural)*.75),100%,var(--natural))}
.diagram text{font-family:var(--sans)}
.diagram .mono{font-family:var(--mono)}`
// The svg sets its own --bg, so the page's arrives through a bridge; --muted, --accent, --surface and --border inherit by name.
const DIAGRAM = { bg: "var(--page-bg)", fg: "var(--ink)", transparent: true }
const SVG_STYLE = /<style>([\s\S]*?)<\/style>/g

let houseCss: string | undefined

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function attrsOf(props: Record<string, unknown>): string {
  let out = ""
  for (const [key, value] of Object.entries(props)) {
    const bound = key.startsWith(":")
    const name = bound ? key.slice(1) : key
    // `$` is the parser's bookkeeping, and a bound `:disabled="true"` is how a task box arrives.
    if (key === "$" || value === false || (bound && value === "false")) continue
    if (value === true || (bound && value === "true")) out += ` ${name}`
    else if (typeof value === "string" || typeof value === "number") out += ` ${name}="${escapeHtml(String(value))}"`
    else if (Array.isArray(value)) out += ` ${name}="${escapeHtml(value.join(" "))}"`
  }
  return out
}

// A fence's own child holds its raw text once, so highlighting it here beats reaching back in from `code`.
function fenceOf(node: MdNode): { pre: Record<string, unknown>; code: Record<string, unknown>; lang: string; text: string } | undefined {
  if (typeof node === "string") return undefined
  const [tag, pre, child] = node
  if (tag !== "pre" || typeof pre.language !== "string" || typeof child === "string" || !child) return undefined
  const [codeTag, code, text] = child
  return codeTag === "code" && typeof text === "string" ? { pre, code, lang: pre.language, text } : undefined
}

async function diagramOf(text: string, css: Set<string>): Promise<string | undefined> {
  let svg: string
  try {
    svg = await renderMermaidSVGAsync(text, DIAGRAM)
  } catch {
    return undefined
  }
  const width = Math.ceil(Number(/width="([\d.]+)"/.exec(svg)?.[1]))
  // A comment quotes its block's text, so the CSS leaves the svg, minus the Google Fonts import the offline page never wants.
  const bare = svg.replace(SVG_STYLE, (_, rules: string) => {
    css.add(rules.replace(/@import url\([^)]*\);/g, "").trim())
    return ""
  })
  return `<div class="diagram" style="--natural:${width}px">${bare}</div>`
}

async function htmlOf(node: MdNode, css: Set<string>): Promise<string> {
  if (typeof node === "string") return escapeHtml(node)
  const fence = fenceOf(node)
  const diagram = fence?.lang === "mermaid" ? await diagramOf(fence.text, css) : undefined
  if (diagram) return diagram
  if (fence) return `<pre${attrsOf(fence.pre)}><code${attrsOf(fence.code)}>${await Syntax.code(fence.text, fence.lang)}</code></pre>`
  const [tag, props, ...children] = node
  if (!tag) return ""
  const open = `<${tag}${attrsOf(props)}>`
  if (VOID.has(tag)) return open
  return `${open}${(await Promise.all(children.map((child) => htmlOf(child, css)))).join("")}</${tag}>`
}

async function sectionsOf(nodes: MdNode[]): Promise<string> {
  const sections: string[][] = []
  const css = new Set<string>()
  for (const node of nodes) {
    const html = await htmlOf(node, css)
    if (!html.trim()) continue
    // Each h1 or h2 opens a section, which is the host the read view takes a comment's label from.
    const opens = typeof node !== "string" && (node[0] === "h1" || node[0] === "h2")
    if (opens || !sections.length) sections.push([])
    sections.at(-1)?.push(html)
  }
  const html = sections.map((parts) => `<section class="flow">${parts.join("")}</section>`).join("\n")
  // Last rather than first, where `.page > * + *` would push the opening section down.
  return css.size ? `${html}\n<style>${[...css].join("\n")}</style>` : html
}

function readStyle(name: string): string {
  try {
    return readFileSync(join(pluginRoot(), "skills", "create-artifact", "assets", name), "utf8")
  } catch {
    return "" // an unstyled page still reads, which beats failing the route over a stylesheet
  }
}

export const Markdown = {
  async body(markdown: string): Promise<string> {
    return sectionsOf((await parse(markdown)).nodes)
  },

  async page({ ds, markdown, title }: Markdown.Page): Promise<string> {
    houseCss ??= STYLESHEETS.map(readStyle).join("\n")
    const system = ds ? ` data-ds="${escapeHtml(ds)}"` : ""
    return [
      "<!doctype html>",
      `<html lang="en" data-theme="light"${system}>`,
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${escapeHtml(title)}</title>`,
      `<style>${houseCss}\n${MARKDOWN_CSS}\n${DIAGRAM_CSS}</style>`,
      "</head>",
      `<body><main class="page">${await Markdown.body(markdown)}</main></body>`,
      "</html>",
    ].join("\n")
  },
}

export namespace Markdown {
  export interface Page {
    ds?: string
    markdown: string
    title: string
  }
}
