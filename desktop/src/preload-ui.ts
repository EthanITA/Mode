import { contextBridge, ipcRenderer } from "electron";

interface ShellInfo {
  partition: string;
}

const info = ipcRenderer.sendSync("shell:info") as ShellInfo;

contextBridge.exposeInMainWorld("sidecarShell", {
  importCookies: (): Promise<{ failed: number; set: number; skipped: number }> => ipcRenderer.invoke("shell:import-cookies"),
  openInChrome: (url: string): Promise<void> => ipcRenderer.invoke("shell:open-external", url),
  partition: info.partition,
  present: true,
});
