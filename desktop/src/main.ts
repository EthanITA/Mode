import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain, Menu, session, shell, type WebContents } from "electron";
import { importChromeCookies } from "./cookies.ts";

const SIDECAR_URL = (process.env.SIDECAR_URL ?? "http://sidecar.localhost:4747").replace(/\/$/, "");
const NAME = "Claude Code Sidecar";
const PARTITION = "persist:sidecar";
const WEBVIEW_PRELOAD = join(__dirname, "preload-webview.cjs");
const UI_PRELOAD = join(__dirname, "preload-ui.cjs");
const REPO = join(__dirname, "..", "..");
const SERVER_ENTRY = app.isPackaged ? join(process.resourcesPath, "output", "server", "index.mjs") : join(REPO, ".output", "server", "index.mjs");
const SIDECAR_ROOT = app.isPackaged ? join(process.resourcesPath, "plugin") : REPO;

type Rect = { height: number; width: number; x: number; y: number };

let server: ChildProcess | undefined;
let mainWindow: BrowserWindow | undefined;
// Each OAuth popup is a real child window, not a DOM node, because only a true auxiliary window keeps window.opener alive.
const popups = new Map<number, { rect?: Rect; win: BrowserWindow }>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function answers(): Promise<boolean> {
  const reply = await fetch(`${SIDECAR_URL}/manifest.webmanifest`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined);
  const body = reply?.ok ? ((await reply.json().catch(() => ({}))) as { name?: string }) : undefined;
  return body?.name === NAME;
}

// The app owns the sidecar server: it runs the production build itself unless one is already answering, and stops that child on quit.
async function startServer(): Promise<void> {
  if (await answers()) return;
  if (!existsSync(SERVER_ENTRY)) throw new Error(`no sidecar server build at ${SERVER_ENTRY}`);
  server = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NITRO_HOST: "localhost",
      NITRO_PORT: new URL(SIDECAR_URL).port || "80",
      SIDECAR_ROOT,
    },
    stdio: "ignore",
  });
  for (const end = Date.now() + 90_000; Date.now() < end; await delay(500)) if (await answers()) return;
  throw new Error("the sidecar server did not come up");
}

function chromeUserAgent(): string {
  return session.defaultSession.getUserAgent().replace(/ (Electron|claude-code-sidecar-desktop)\/\S+/g, "");
}

function webviewSession(): void {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(chromeUserAgent());
  // Stripped for the webview session alone, so an inline script may run in the real page's own world; the UI keeps its headers.
  ses.webRequest.onHeadersReceived((details, done) => {
    const headers = details.responseHeaders ?? {};
    for (const name of Object.keys(headers)) if (/^content-security-policy/i.test(name)) delete headers[name];
    done({ responseHeaders: headers });
  });
}

function importedMark(): string {
  return join(app.getPath("userData"), "cookies-imported");
}

async function importCookies(): Promise<{ failed: number; set: number; skipped: number }> {
  const got = await importChromeCookies(session.fromPartition(PARTITION), {});
  writeFileSync(importedMark(), new Date().toISOString());
  return got;
}

// Imported once per install, marked in userData, so a later launch arrives signed in without prompting the Keychain again.
async function importIfNeeded(): Promise<void> {
  if (existsSync(importedMark())) return;
  await importCookies().catch((error) => console.error(String(error)));
}

function openExternal(_event: IpcMainInvokeEvent, url: unknown): void {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function guardWebview(contents: WebContents): void {
  contents.setWindowOpenHandler((details) => {
    if (!/^https?:\/\//i.test(details.url)) return { action: "deny" };
    if (details.disposition === "new-window") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          backgroundColor: "#ffffff",
          frame: false,
          parent: mainWindow,
          resizable: false,
          roundedCorners: true,
          show: false,
          webPreferences: { contextIsolation: true, nodeIntegration: false, partition: PARTITION },
        },
      };
    }
    void contents.loadURL(details.url);
    return { action: "deny" };
  });
  contents.on("did-create-window", (child, { url }) => openPopup(child, url, contents.getTitle()));
}

function screenBounds(rect: Rect): Electron.Rectangle {
  const area = mainWindow?.getContentBounds();
  return {
    height: Math.round(rect.height),
    width: Math.round(rect.width),
    x: Math.round((area?.x ?? 0) + rect.x),
    y: Math.round((area?.y ?? 0) + rect.y),
  };
}

function placePopup(id: number, rect: Rect): void {
  const popup = popups.get(id);
  if (!popup) return;
  popup.rect = rect;
  popup.win.setBounds(screenBounds(rect));
  if (!popup.win.isVisible()) popup.win.show();
}

function openPopup(child: BrowserWindow, url: string, opener: string): void {
  const id = child.webContents.id;
  popups.set(id, { win: child });
  child.once("closed", () => {
    popups.delete(id);
    mainWindow?.webContents.send("popup:closed", id);
  });
  mainWindow?.webContents.send("popup:open", { id, opener, origin: new URL(url).host });
}

function createWindow(): void {
  const win = new BrowserWindow({
    backgroundColor: "#17151e",
    height: 900,
    show: false,
    title: NAME,
    webPreferences: { contextIsolation: true, preload: UI_PRELOAD, sandbox: true, webviewTag: true },
    width: 1280,
  });
  win.once("ready-to-show", () => win.show());
  const reglue = (): void => {
    for (const [id, { rect }] of popups) if (rect) placePopup(id, rect);
  };
  win.on("move", reglue);
  win.on("resize", reglue);
  mainWindow = win;
  void win.loadURL(`${SIDECAR_URL}/`);
}

function menu(): Menu {
  const open = (): void => {
    const url = BrowserWindow.getAllWindows()[0]?.webContents.getURL();
    if (url) void shell.openExternal(url);
  };
  return Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { accelerator: "CmdOrCtrl+R", click: () => BrowserWindow.getAllWindows()[0]?.webContents.reload(), label: "Reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { click: open, label: "Open in Chrome" },
        { click: () => void importCookies(), label: "Re-import Chrome cookies" },
      ],
    },
    { role: "windowMenu" },
  ]);
}

if (process.argv.includes("--import")) {
  app.whenReady().then(async () => {
    try {
      const got = await importCookies();
      console.log(`imported ${got.set} cookies (${got.skipped} skipped, ${got.failed} failed)`);
    } catch (error) {
      console.error(String(error));
    }
    app.exit(0);
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    webviewSession();
    app.userAgentFallback = chromeUserAgent();

    app.on("web-contents-created", (_event, contents) => {
      if (contents.getType() === "webview") guardWebview(contents);
    });
    // The preload and the safe prefs are forced here rather than trusted from the <webview> attributes.
    app.on("web-contents-created", (_event, contents) => {
      contents.on("will-attach-webview", (_event, prefs) => {
        prefs.preload = WEBVIEW_PRELOAD;
        prefs.nodeIntegration = false;
        prefs.contextIsolation = true;
      });
    });

    ipcMain.on("shell:info", (event) => {
      event.returnValue = { partition: PARTITION, preload: WEBVIEW_PRELOAD, userAgent: chromeUserAgent() };
    });
    ipcMain.handle("shell:open-external", openExternal);
    ipcMain.handle("shell:import-cookies", () => importCookies());
    ipcMain.on("popup:place", (_event, { id, rect }: { id: number; rect: Rect }) => placePopup(id, rect));
    ipcMain.on("popup:close", (_event, id: number) => popups.get(id)?.win.close());

    Menu.setApplicationMenu(menu());

    await startServer().catch((error) => console.error(String(error)));
    await importIfNeeded();

    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  app.on("will-quit", () => server?.kill());
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
