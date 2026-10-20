import { existsSync } from "node:fs";
import { Links } from "~~/server/utils/sessions/links";
import { transcriptIndex, transcripts } from "~~/server/utils/sessions/transcripts";

// Every conversation and not only the one on screen, so a link lands in its Artifacts the moment it is said.
export default defineNitroPlugin(() => {
  // What a transcript held before the server started is history, so it lands quietly, and one never followed waits for its next write.
  const before = new Map<string, number>();
  for (const [key, { path, size }] of transcriptIndex()) {
    if (existsSync(Links.ledger(key))) Links.adopt({ key, path });
    else before.set(key, size);
  }

  transcripts.on("grew", ({ key, path }) => {
    if (before.has(key)) {
      Links.adopt({ key, path, upTo: before.get(key) });
      before.delete(key);
    }
    Links.adopt({ key, path, isLive: true });
  });
});
