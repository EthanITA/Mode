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
const PLUGIN_ROOT = app.isPackaged ? join(process.resourcesPath, "plugin") : REPO;

let server: ChildProcess | undefined;

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
      MODE_PLUGIN_ROOT: PLUGIN_ROOT,
      NITRO_HOST: "localhost",
      NITRO_PORT: new URL(SIDECAR_URL).port || "80",
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
    // A popup opens as a child window so its opener survives for OAuth; a _blank link stays in the webview.
    if (details.disposition === "new-window") {
      return { action: "allow", overrideBrowserWindowOptions: { webPreferences: { contextIsolation: true, nodeIntegration: false, partition: PARTITION } } };
    }
    void contents.loadURL(details.url);
    return { action: "deny" };
  });
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
