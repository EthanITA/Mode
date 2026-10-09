import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { isFile } from "../files.ts";
import { pyJson, strip } from "../text.ts";
import { AXES, BOOLEANS, FOLDER } from "./constants.ts";
import { metaOf, names, summary, truthy } from "./contracts.ts";
import { configRoot, pluginRoot } from "./paths.ts";
import { Refusal } from "./refusal.ts";

// The ownership mark: only a file carrying this sentence is ever deleted by the stale sweep.
const SENTINEL = "A hook read this message and set the";

const shortcut = (description: string, axis: string, name: string): string => `---
description: ${description}
argument-hint: ""
disable-model-invocation: true
---

A hook read this message and set the ${axis} slot to \`${name}\` before it reached you, so do not run
\`mode ${axis} set\` over it. The contract is in your context above.

Confirm the switch in one line, then work the way it asks.
`;

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

// Nudges toward one spelling without refusing the file, since the readers accept it and runtime would disagree with a lint.
function checkFlags(warn: (line: string) => void): void {
  for (const axis of AXES) {
    for (const name of names(axis)) {
      const meta = metaOf(axis, name);
      for (const key of BOOLEANS) {
        const value = strip(meta[key] ?? "");
        if (value && value !== "true" && value !== "false") {
          warn(
            `warning: ${axis}/${name}.md has ${key}: ${value}. It is read as ${truthy(meta, key) ? "on" : "off"}, and lowercase true or false is the spelling to keep.`,
          );
        }
      }
    }
  }
}

function replaceCounted(text: string, pattern: RegExp, make: (groups: string[]) => string): [string, number] {
  let count = 0;
  const out = text.replace(pattern, (...args: unknown[]) => {
    count++;
    return make(args.slice(0, -2) as string[]);
  });
  return [out, count];
}

// One command file per contract, so the palette hints the names instead of asking people to recall them.
function writeShortcuts(): void {
  // Styles would arrive as /mode:style:<name> from the plugin, so they land in the user commands folder and arrive bare.
  const targets = { mode: join(pluginRoot(), "commands"), style: join(configRoot(), "commands") };
  for (const axis of AXES) {
    const folder = targets[axis];
    mkdirSync(folder, { recursive: true });
    const keep = new Set<string>();
    for (const name of names(axis)) {
      const path = join(folder, axis === "style" ? `style:${name}.md` : `${name}.md`);
      keep.add(basename(path));
      // JSON-quoted, because a colon in a summary makes an unquoted YAML value ambiguous.
      const body = shortcut(pyJson(summary(axis, name) || `Hold the ${name} ${axis}.`), axis, name);
      if (!isFile(path) || readFileSync(path, "utf8") !== body) writeFileSync(path, body);
    }
    for (const file of readdirSync(folder)) {
      if (!file.endsWith(".md") || (axis === "style" && !file.startsWith("style:")) || keep.has(file)) continue;
      try {
        // The sentinel gate: the user commands folder holds files this tool never wrote.
        if (readFileSync(join(folder, file), "utf8").includes(SENTINEL)) rmSync(join(folder, file));
      } catch {}
    }
  }
}

// Rewrite the manual's registries from the folders, since front matter cannot compute itself.
export function sync(warn: (line: string) => void): void {
  checkFlags(warn);
  const skill = join(pluginRoot(), "skills", "mode", "MANUAL.md");
  if (!isFile(skill)) throw new Refusal(`no manual at ${skill}`);
  let text = readFileSync(skill, "utf8").replace(/\r\n?/g, "\n");
  let written = 0;
  const missing: string[] = [];
  for (const axis of AXES) {
    const folder = FOLDER[axis];
    const joined = names(axis).join(", ");
    let count: number;
    // Every occurrence, since the phrase sits in the front matter description and in the body.
    [text, count] = replaceCounted(
      text,
      new RegExp(`(${capitalize(folder)} available: )[^.]*\\.`, "g"),
      (m) => `${m[1]}${joined}.`,
    );
    written += count;
    if (!count) missing.push(`${capitalize(folder)} available:`);
    [text, count] = replaceCounted(text, new RegExp(`^${folder}:[ \\t]*.*$`, "m"), () => `${folder}: ${joined}`);
    written += count;
    const rows = names(axis).map((name) => `| \`${name}\` | \`${folder}/${name}.md\` | ${summary(axis, name)} |`);
    // off and auto have no file of their own, so the folder cannot describe them and this does.
    rows.push(`| \`off\` | none | Not a ${axis}. \`mode ${axis} set off\` empties the slot. |`);
    rows.push(
      `| \`auto\` | none | Not a ${axis}. \`mode ${axis} set auto\` matches each message against every \`enter-when\` and enters the winner. |`,
    );
    const table = `| Name | File | Summary |\n|---|---|---|\n${rows.join("\n")}`;
    [text, count] = replaceCounted(
      text,
      new RegExp(`(<!-- ${folder}:start -->\\n)[\\s\\S]*?(<!-- ${folder}:end -->)`),
      (m) => `${m[1]}${table}\n${m[2]}`,
    );
    written += count;
    if (!count) missing.push(`<!-- ${folder}:start --> ... <!-- ${folder}:end -->`);
  }
  if (!written) throw new Refusal(`${skill} has none of the generated regions, so nothing was rewritten`);
  writeFileSync(skill, text);
  for (const region of missing) warn(`warning: no ${region} region in ${basename(skill)}`);
  writeShortcuts();
}
