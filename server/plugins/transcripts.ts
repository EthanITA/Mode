import { watch } from "node:fs";
import { join, sep } from "node:path";
import { isSessionId, keyOf, projectsHome } from "~~/server/utils/sessions/paths";
import { transcripts } from "~~/server/utils/sessions/transcripts";

export default defineNitroPlugin((nitro) => {
  try {
    const watcher = watch(projectsHome(), { recursive: true }, (_, name) => {
      const [slug, file = "", ...deeper] = String(name ?? "").split(sep);
      const id = file.slice(0, -".jsonl".length);
      if (!slug || deeper.length || !file.endsWith(".jsonl") || !isSessionId(id)) return;
      transcripts.emit("grew", { key: keyOf(id), path: join(projectsHome(), slug, file) });
    });
    watcher.on("error", () => watcher.close());
    nitro.hooks.hook("close", () => watcher.close());
  } catch {}
});
