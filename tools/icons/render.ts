import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Cdp } from "../render-check/cdp.ts";
import { launchChrome } from "../render-check/chrome.ts";

// Rasterises the app icons from their SVG sources, since installed-app shims want PNGs: node tools/icons/render.ts
const ICONS = fileURLToPath(new URL("../../public/icons/", import.meta.url));
const OUTPUTS = [
  { size: 192, source: "sidecar.svg", target: "sidecar-192.png" },
  { size: 512, source: "sidecar.svg", target: "sidecar-512.png" },
  { size: 512, source: "sidecar-maskable.svg", target: "sidecar-maskable-512.png" },
];

const chrome = await launchChrome(512, 512, 20_000);
try {
  const cdp = await Cdp.connect(chrome.wsUrl, 10_000);
  const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { a: 0, b: 0, g: 0, r: 0 } }, sessionId);
  for (const { size, source, target } of OUTPUTS) {
    const svg = Buffer.from(readFileSync(`${ICONS}${source}`)).toString("base64");
    const page = `<body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" style="display:block;width:100vw;height:100vh">`;
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { deviceScaleFactor: 1, height: size, mobile: false, width: size },
      sessionId,
    );
    await cdp.send(
      "Page.navigate",
      { url: `data:text/html;base64,${Buffer.from(page).toString("base64")}` },
      sessionId,
      10_000,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId, 10_000);
    writeFileSync(`${ICONS}${target}`, Buffer.from(data, "base64"));
    console.log(`${target} ${size}x${size}`);
  }
} finally {
  chrome.stop();
}
process.exit(0);
