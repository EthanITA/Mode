import { highlightText } from "@speed-highlight/core"
import type { ShjLanguage } from "@speed-highlight/core/detect"

// Fence tags and file extensions that don't match speed-highlight's own language ids.
const ALIASES: Record<string, ShjLanguage> = {
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  typescript: "ts",
  tsx: "ts",
  python: "py",
  golang: "go",
  yml: "yaml",
  dockerfile: "docker",
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  markdown: "md",
  text: "plain",
  txt: "plain",
  vue: "html",
  rust: "rs",
  makefile: "make",
  perl: "pl",
}

function resolve(lang?: string): ShjLanguage {
  const key = (lang || "plain").toLowerCase()
  // speed-highlight never throws on an id it doesn't know, and still escapes the text.
  return ALIASES[key] ?? (key as ShjLanguage)
}

async function code(text: string, lang?: string): Promise<string> {
  return highlightText(text, resolve(lang), false)
}

function languageOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() || "plain"
}

// Named Syntax, not Highlight: that name is already the DOM's CSS Custom Highlight API global.
export const Syntax = { code, languageOf }
