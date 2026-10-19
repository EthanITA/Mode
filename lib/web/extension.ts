import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";

interface StripInput {
  from: string;
  to: string;
}

// Chrome types an extension's file by its name, so a module left as .ts arrives as video and never runs.
export const asScript = (source: string): string =>
  stripTypeScriptTypes(source).replace(/(\bfrom\s+["'][^"']+)\.ts(["'])/g, "$1.js$2");

function strip({ from, to }: StripInput): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (!name.endsWith(".ts") || name.endsWith(".d.ts") || name.endsWith(".test.ts")) continue;
    writeFileSync(join(to, name.replace(/\.ts$/, ".js")), asScript(readFileSync(join(from, name), "utf8")));
  }
}

export function buildExtension(root: string): string {
  const folder = join(root, "extension");
  strip({ from: join(folder, "src"), to: folder });
  strip({ from: join(root, "lib", "web", "page"), to: join(folder, "page") });
  return folder;
}
