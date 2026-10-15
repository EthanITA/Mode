import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDir } from "../../mode/paths.ts";
import { isRecord, record, str } from "../io.ts";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// The main transcript and its subagents', whichever of them the hook was handed.
function transcripts(path: string, session: string): string[] {
  const found = new Set<string>(path && existsSync(path) ? [path] : []);
  for (let dir = dirname(path); session && dir !== dirname(dir); dir = dirname(dir)) {
    const main = join(dir, `${session}.jsonl`);
    if (!existsSync(main)) continue;
    found.add(main);
    const subagents = join(dir, session, "subagents");
    if (existsSync(subagents))
      for (const name of readdirSync(subagents)) if (name.endsWith(".jsonl")) found.add(join(subagents, name));
    break;
  }
  return [...found];
}

// Every file this session wrote through a write tool, which is what makes a file the session's own.
export function written(path: string, session: string): Set<string> {
  const paths = new Set<string>();
  for (const file of transcripts(path, session)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.includes('"tool_use"') || !line.includes('"file_path"')) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const content = isRecord(entry) && isRecord(entry.message) ? entry.message.content : undefined;
      for (const item of Array.isArray(content) ? content : []) {
        if (!isRecord(item) || item.type !== "tool_use" || !WRITE_TOOLS.has(str(item.name))) continue;
        const target = str(record(item.input).file_path);
        if (target) paths.add(resolveDir(target));
      }
    }
  }
  return paths;
}
