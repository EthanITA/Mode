import { ipcRenderer } from "electron";
import { agentSource } from "./generated/agent.ts";

const IPC = "sidecar";

// Added to the page's own DOM so it runs in the real page's world, which the stripped CSP allows and the agent needs for history and navigation.
function inject(): void {
  const script = document.createElement("script");
  script.type = "module";
  script.textContent = `window.__sidecarShell=true;\n${agentSource}`;
  (document.head ?? document.documentElement).append(script);
  script.remove();
}

// The agent posts to its own window; this isolated-world listener carries those up to the host, and host messages back down.
window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as { data?: unknown; sidecar?: string };
  if (data?.sidecar === "up") ipcRenderer.sendToHost(IPC, data.data);
});
ipcRenderer.on(IPC, (_event, payload: unknown) => {
  window.postMessage({ data: payload, sidecar: "down" }, "*");
});

if (document.documentElement) inject();
else document.addEventListener("DOMContentLoaded", inject, { once: true });
