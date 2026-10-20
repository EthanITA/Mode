import { contextBridge, ipcRenderer } from "electron";

interface ShellInfo {
  partition: string;
}

type Rect = { height: number; width: number; x: number; y: number };
type PopupOpen = { id: number; opener: string; origin: string };

const info = ipcRenderer.sendSync("shell:info") as ShellInfo;

const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const handler = (_event: unknown, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
};

contextBridge.exposeInMainWorld("sidecarShell", {
  closePopup: (id: number): void => ipcRenderer.send("popup:close", id),
  importCookies: (): Promise<{ failed: number; set: number; skipped: number }> => ipcRenderer.invoke("shell:import-cookies"),
  onPopupClosed: (cb: (id: number) => void): (() => void) => subscribe("popup:closed", cb),
  onPopupOpen: (cb: (open: PopupOpen) => void): (() => void) => subscribe("popup:open", cb),
  openInChrome: (url: string): Promise<void> => ipcRenderer.invoke("shell:open-external", url),
  partition: info.partition,
  placePopup: (id: number, rect: Rect): void => ipcRenderer.send("popup:place", { id, rect }),
  present: true,
});
