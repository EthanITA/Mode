import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { newsLine } from "../lib/hook/board.ts";
import { context, payload, str } from "../lib/hook/io.ts";
import { writeText } from "../lib/files.ts";
import { configRoot } from "../lib/mode/paths.ts";
import { adopt, clear } from "../lib/mode/slots.ts";

const ROOT = process.env.CLAUDE_PLUGIN_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Each step stands alone, the way it did when each was its own process: one failing never stops the next.
function quietly(step: () => void): void {
  try {
    step();
  } catch {}
}

// A statusLine command never gets ${CLAUDE_PLUGIN_ROOT} expanded, so the path it needs is left here on every start.
quietly(() => writeText(join(configRoot(), "mode", "plugin-root"), `${ROOT}\n`));

try {
  const data = payload() ?? {};
  const session = str(data.session_id) || undefined;
  // A resume or a compact drops the injected contract while the marker still says it was announced.
  quietly(() => clear({ session, announced: true }));
  // The first chance a pin gets. adopt fills only an untouched slot, so a resumed conversation walks past this.
  quietly(() => adopt({ path: str(data.cwd) || process.cwd(), session }));
  const board = newsLine(str(data.session_id));
  if (board) context("SessionStart", board);
} catch {}
