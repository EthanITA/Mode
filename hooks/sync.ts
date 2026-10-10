import { payload, record, str } from "../lib/hook/io.ts";
import { sync } from "../lib/mode/sync.ts";

// Matched on the folder shape, not on the plugin prefix: a symlinked checkout saves under the real path.
const CONTRACT = /\/(modes|styles)\/.*\.md$/s;

try {
  const path = str(record(payload()?.tool_input).file_path);
  if (CONTRACT.test(path)) sync(() => {});
} catch {}
