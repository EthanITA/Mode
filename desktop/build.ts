import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const agentEntry = join(root, "..", "lib", "web", "page", "agent.ts");
const NAME = "Claude Code Sidecar";
const BUNDLE_ID = "local.mode.sidecar.desktop";
const VERSION = "0.1.0";

// The comment agent, bundled to one script with no imports so the webview preload can inject it inline into the page.
async function bundleAgent(): Promise<string> {
  const out = await build({
    bundle: true,
    entryPoints: [agentEntry],
    format: "esm",
    platform: "browser",
    target: "chrome120",
    write: false,
  });
  return out.outputFiles[0]?.text ?? "";
}

function setPlist(xml: string, key: string, value: string): string {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  return re.test(xml) ? xml.replace(re, `$1${value}$2`) : xml.replace("</dict>", `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>`);
}

// Packaged by hand rather than @electron/packager, whose dependency walker cannot resolve its own modules under pnpm.
function packageApp(): void {
  const source = join(root, "node_modules", "electron", "dist", "Electron.app");
  const outDir = join(root, "out", `${NAME}-darwin-${process.arch}`);
  const app = join(outDir, `${NAME}.app`);
  rmSync(outDir, { force: true, recursive: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(source, app, { recursive: true, verbatimSymlinks: true });

  const macos = join(app, "Contents", "MacOS");
  renameSync(join(macos, "Electron"), join(macos, NAME));
  const plistPath = join(app, "Contents", "Info.plist");
  let plist = readFileSync(plistPath, "utf8");
  for (const [key, value] of [
    ["CFBundleExecutable", NAME],
    ["CFBundleName", NAME],
    ["CFBundleDisplayName", NAME],
    ["CFBundleIdentifier", BUNDLE_ID],
  ])
    plist = setPlist(plist, key, value);
  writeFileSync(plistPath, plist);

  const payload = join(app, "Contents", "Resources", "app");
  rmSync(payload, { force: true, recursive: true });
  mkdirSync(payload, { recursive: true });
  cpSync(dist, join(payload, "dist"), { recursive: true });
  writeFileSync(
    join(payload, "package.json"),
    `${JSON.stringify({ main: "dist/main.cjs", name: "claude-code-sidecar-desktop", productName: NAME, version: VERSION }, null, 2)}\n`,
  );

  // Renaming the executable breaks the dist's ad-hoc signature, so the bundle is re-signed in place.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  console.log(`packaged ${app}`);
}

async function main(): Promise<void> {
  mkdirSync(join(root, "src", "generated"), { recursive: true });
  const agentSource = await bundleAgent();
  writeFileSync(join(root, "src", "generated", "agent.ts"), `export const agentSource = ${JSON.stringify(agentSource)};\n`);
  await build({
    bundle: true,
    entryPoints: {
      main: join(root, "src", "main.ts"),
      "preload-ui": join(root, "src", "preload-ui.ts"),
      "preload-webview": join(root, "src", "preload-webview.ts"),
    },
    external: ["electron"],
    format: "cjs",
    // .cjs, since the package is type:module and Electron would otherwise load the CommonJS output as ESM.
    outExtension: { ".js": ".cjs" },
    outdir: dist,
    platform: "node",
    target: "node22",
  });
  console.log(`built ${dist}`);
  if (process.argv.includes("--package")) packageApp();
}

await main();
