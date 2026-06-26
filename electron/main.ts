// Electron main process: owns the single application window, registers the IPC
// layer (engine + native helper), and wires auto-updates. No HTTP server and no
// system browser — the app is a real native window.

import path from "node:path";
import { app, BrowserWindow, shell } from "electron";

import { registerIpc } from "./ipc";
import { initUpdater } from "./updater";

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:1420";
// Dev mode (Vite server) is opt-in via ELECTRON_DEV; everything else (packaged
// app, the Electron smoke test) loads the built renderer from dist/.
const IS_DEV = process.env.ELECTRON_DEV === "1";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0d1117",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses Node built-ins indirectly via the bridge
    },
  });

  win.once("ready-to-show", () => win.show());

  // Open external links in the user's real browser, not a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  if (IS_DEV) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  initUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
