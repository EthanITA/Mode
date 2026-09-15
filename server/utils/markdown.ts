import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createMarkdownParser } from "comark"
import type { MarkdownDocument } from "comark"
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

function htmlOf(node: MdNode): string {
  if (typeof node === "string") return escapeHtml(node)
  const [tag, props, ...children] = node
  if (!tag) return ""
  const open = `<${tag}${attrsOf(props)}>`
  return VOID.has(tag) ? open : `${open}${children.map(htmlOf).join("")}</${tag}>`
}

function sectionsOf(nodes: MdNode[]): string {
  const sections: string[][] = []
  for (const node of nodes) {
    const html = htmlOf(node)
    if (!html.trim()) continue
    // Each h1 or h2 opens a section, which is the host the read view takes a comment's label from.
    const opens = typeof node !== "string" && (node[0] === "h1" || node[0] === "h2")
    if (opens || !sections.length) sections.push([])
    sections.at(-1)?.push(html)
  }
  return sections.map((parts) => `<section class="flow">${parts.join("")}</section>`).join("\n")
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
      `<style>${houseCss}\n${MARKDOWN_CSS}</style>`,
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
