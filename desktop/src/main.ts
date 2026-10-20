import { app, BrowserWindow, type IpcMainInvokeEvent, ipcMain, Menu, session, shell, type WebContents } from "electron";
import { join } from "node:path";
import { importChromeCookies } from "./cookies.ts";

const SIDECAR_URL = (process.env.SIDECAR_URL ?? "http://sidecar.localhost:4747").replace(/\/$/, "");
const PARTITION = "persist:sidecar";
const WEBVIEW_PRELOAD = join(__dirname, "preload-webview.cjs");
const UI_PRELOAD = join(__dirname, "preload-ui.cjs");

// Sites refuse an embedded browser when the UA names Electron or this app, so the webview answers as plain Chrome.
function chromeUserAgent(): string {
  return session.defaultSession.getUserAgent().replace(/ (Electron|claude-code-sidecar-desktop)\/\S+/g, "");
}

function webviewSession(): Electron.Session {
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(chromeUserAgent());
  // Stripped for the webview session alone, so an inline script may run in the real page's own world; the UI keeps its headers.
  ses.webRequest.onHeadersReceived((details, done) => {
    const headers = details.responseHeaders ?? {};
    for (const name of Object.keys(headers)) if (/^content-security-policy/i.test(name)) delete headers[name];
    done({ responseHeaders: headers });
  });
  return ses;
}

function openExternal(_event: IpcMainInvokeEvent, url: unknown): void {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) void shell.openExternal(url);
}

async function importCookies(): Promise<{ failed: number; set: number; skipped: number }> {
  return importChromeCookies(session.fromPartition(PARTITION), {});
}

function guardWebview(contents: WebContents): void {
  // A link that would open a new OS window stays in the webview instead, so the page never escapes the sidecar.
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void contents.loadURL(url);
    return { action: "deny" };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    backgroundColor: "#17151e",
    height: 900,
    show: false,
    title: "Claude Code Sidecar",
    webPreferences: { contextIsolation: true, preload: UI_PRELOAD, sandbox: true, webviewTag: true },
    width: 1280,
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(`${SIDECAR_URL}/`);
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
    const ses = webviewSession();

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

    const existing = await ses.cookies.get({});
    if (!existing.length) await importCookies().catch(() => undefined);

    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function menu(): Menu {
  const open = (): void => {
    const [win] = BrowserWindow.getAllWindows();
    const url = win?.webContents.getURL();
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
