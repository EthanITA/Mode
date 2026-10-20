import { existsSync } from "node:fs";
import { Links } from "~~/server/utils/sessions/links";
import { transcriptIndex, transcripts } from "~~/server/utils/sessions/transcripts";

export default defineNitroPlugin(() => {
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
