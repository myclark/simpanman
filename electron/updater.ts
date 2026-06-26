// Auto-update via electron-updater against GitHub Releases. Update lifecycle is
// surfaced to the renderer as UpdateStatus events; the renderer offers a
// "Restart to update" action that calls back into update:install.

import { app, ipcMain, BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import log from "electron-log";

import type { UpdateStatus } from "../src/types";

const { autoUpdater } = electronUpdater;

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("update:status", status);
  }
}

export function initUpdater(): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    broadcast({ state: "available", version: info.version });
  });
  autoUpdater.on("download-progress", (p) => {
    broadcast({ state: "downloading", percent: Math.round(p.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    broadcast({ state: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (err) => {
    broadcast({ state: "error", message: err == null ? "unknown error" : String(err.message ?? err) });
  });

  ipcMain.handle("update:install", () => {
    // Quit and install the staged update. install-on-quit also covers normal exit.
    autoUpdater.quitAndInstall();
  });

  // Updates only make sense for packaged builds with a published feed.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => log.warn("update check failed", e));
  }
}
