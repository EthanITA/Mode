import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { isRecord, type Payload } from "../hook/io.ts";
import { Refusal } from "../mode/refusal.ts";
import { pyJson, pyStr } from "../text.ts";
import { artifactsDir, readPage, root } from "./files.ts";

const BLOCK = /<!-- rv:start -->[\s\S]*?<!-- rv:end -->\n?/;
const SEED = /(<script type="application\/json" id="rv-seed">)([\s\S]*?)(<\/script>)/;
const MD_SEED = /(<!-- rv:seed\n)([\s\S]*?)(\n-->\n?)/;

const stem = (path: string): string => basename(path, extname(path));

const seeded = (text: string): Payload => {
  try {
    const parsed: unknown = JSON.parse(SEED.exec(text)?.[2] ?? "");
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

// Inject or refresh the layer in place, carrying whatever threads the page already holds.
export const install = (path: string, sidecar = ""): string => {
  const text = readPage(path);
  if (path.endsWith(".md")) {
    if (dirname(path) !== artifactsDir() || MD_SEED.test(text)) return "already present";
    const doc = pyJson({ v: 1, slug: stem(path), threads: [] }, false);
    writeFileSync(path, `${text.replace(/\n+$/, "")}\n\n<!-- rv:seed\n${doc}\n-->\n`);
    return "added";
  }
  const layerFile = join(root(), "skills", "create-artifact", "assets", "review-layer.html");
  let layerSource: string;
  try {
    layerSource = readFileSync(layerFile, "utf8");
  } catch {
    throw new Refusal(`no review layer at ${layerFile}`);
  }
  const existing = seeded(text);
  const doc = {
    v: 1,
    slug: stem(path),
    sidecar: sidecar || pyStr(existing.sidecar || ""),
    threads: Array.isArray(existing.threads) ? existing.threads : [],
  };
  const layer = layerSource.replace(SEED, (_, open: string, __, close: string) => open + pyJson(doc, false) + close);
  if (BLOCK.test(text)) {
    writeFileSync(
      path,
      text.replace(BLOCK, () => layer),
    );
    return "refreshed";
  }
  if (!text.includes("</body>")) throw new Refusal(`${basename(path)} has no </body> to anchor the layer to`);
  writeFileSync(
    path,
    text.replace("</body>", () => layer + "</body>"),
  );
  return "added";
};
