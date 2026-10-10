import { highlightText } from "@speed-highlight/core";
import type { ShjLanguage } from "@speed-highlight/core/detect";

// Fence tags and file extensions that don't match speed-highlight's own language ids.
const ALIASES: Record<string, ShjLanguage> = {
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  typescript: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  python: "py",
  golang: "go",
  yml: "yaml",
  dockerfile: "docker",
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  fish: "bash",
  env: "bash",
  markdown: "md",
  mdx: "md",
  text: "plain",
  txt: "plain",
  vue: "html",
  svelte: "html",
  astro: "html",
  htm: "html",
  svg: "xml",
  plist: "xml",
  scss: "css",
  less: "css",
  jsonc: "json",
  json5: "json",
  conf: "ini",
  cfg: "ini",
  h: "c",
  cpp: "c",
  cc: "c",
  hpp: "c",
  rust: "rs",
  makefile: "make",
  perl: "pl",
};

function resolve(lang?: string): ShjLanguage {
  const key = (lang || "plain").toLowerCase();
  // speed-highlight never throws on an id it doesn't know, and still escapes the text.
  return ALIASES[key] ?? (key as ShjLanguage);
}

async function code(text: string, lang?: string): Promise<string> {
  return highlightText(text, resolve(lang), false);
}

function languageOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() || "plain";
}

// Named Syntax, not Highlight: that name is already the DOM's CSS Custom Highlight API global.
export const Syntax = { code, languageOf };
