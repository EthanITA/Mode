import { mkdirSync, watch } from "node:fs";
import * as Events from "~~/lib/sidecar/events.ts";
import { ArtifactLists } from "~~/lib/sidecar/lists.ts";
import { listArtifacts } from "~~/server/utils/artifacts";

export default defineNitroPlugin((nitro) => {
  let seen: Set<string> | undefined;

  const announce = async (key: string): Promise<void> => {
    const fresh = ArtifactLists.entries(key).filter((entry) => seen && !seen.has(entry));
    if (!seen || !fresh.length) return;
    for (const entry of fresh) seen.add(entry);
    for (const { kind, path, slug, title } of await listArtifacts()) {
      if (kind === "page" && fresh.includes(slug))
        Events.publish({ topic: "artifact.created", key, data: { slug, title, path } });
    }
  };

  void listArtifacts()
    .then((listed) => (seen = new Set(listed.map(({ slug }) => slug))))
    .catch((error: unknown) => console.error("[artifacts] could not list the pages there at start", error));

  mkdirSync(ArtifactLists.home(), { recursive: true });
  const watcher = watch(ArtifactLists.home(), (_, name) => {
    const key = ArtifactLists.keyOf(String(name ?? ""));
    if (key) announce(key).catch((error: unknown) => console.error(`[artifacts] could not announce for ${key}`, error));
  });
  watcher.on("error", (error) => {
    console.error("[artifacts] stopped watching the conversation lists", error);
    watcher.close();
  });
  nitro.hooks.hook("close", () => watcher.close());
});
