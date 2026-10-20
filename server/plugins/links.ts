import { watch } from "node:fs";
import { join, sep } from "node:path";
import { Links } from "~~/server/utils/sessions/links";
import { isSessionId, keyOf, projectsHome } from "~~/server/utils/sessions/paths";
import { transcriptIndex } from "~~/server/utils/sessions/transcripts";

// Every conversation and not only the one on screen, so a link lands in its Artifacts the moment it is said.
export default defineNitroPlugin((nitro) => {
  // What a transcript held before the server started is history, so its first catch-up stays quiet.
  const before = new Map([...transcriptIndex()].map(([key, ref]) => [key, ref.size]));
  try {
    const watcher = watch(projectsHome(), { recursive: true }, (_, name) => {
      const [slug, file = "", ...deeper] = String(name ?? "").split(sep);
      const id = file.slice(0, -".jsonl".length);
      if (!slug || deeper.length || !file.endsWith(".jsonl") || !isSessionId(id)) return;
      const key = keyOf(id);
      const path = join(projectsHome(), slug, file);
      if (before.has(key)) {
        Links.adopt({ key, path, upTo: before.get(key) });
        before.delete(key);
      }
      Links.adopt({ key, path, isLive: true });
    });
    watcher.on("error", () => watcher.close());
    nitro.hooks.hook("close", () => watcher.close());
  } catch {}
});
