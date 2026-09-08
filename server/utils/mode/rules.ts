import { join } from "node:path"
import { alternatives } from "./contracts.ts"
import { splitFrontMatter } from "./frontmatter.ts"
import { isFile, listMd, readTextSafe } from "./fsutil.ts"
import { rulesDirs } from "./paths.ts"
import { statePath } from "./state.ts"

export function ruleState(sid?: string): { told: string[]; waiting: { name: string; until?: string }[] } {
  const picked = new Map<string, string>()
  for (const dir of rulesDirs()) for (const f of listMd(dir)) picked.set(f.slice(0, -3), join(dir, f))

  const baseTold = isFile(statePath(sid, ".rules"))
  const told: string[] = []
  const waiting: { name: string; until?: string }[] = []

  for (const stem of [...picked.keys()].sort()) {
    const text = readTextSafe(picked.get(stem))
    if (!text) continue
    const { meta, body } = splitFrontMatter(text)
    if (!body.trim()) continue
    const when = alternatives(meta, "when")
    if (!when.length) {
      if (baseTold) told.push(stem)
      else waiting.push({ name: stem })
      continue
    }
    const shown = when.slice(0, 3).join(" | ") + (when.length > 3 ? ` and ${when.length - 3} more` : "")
    if (isFile(statePath(sid, `.rule-${stem}`))) told.push(stem)
    else waiting.push({ name: stem, until: shown })
  }
  return { told, waiting }
}
