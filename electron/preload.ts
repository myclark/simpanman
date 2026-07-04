// Preload bridge: exposes a typed `window.api` to the renderer over IPC, with no
// direct Node/ipcRenderer access leaking into the page (contextIsolation).

import { contextBridge, ipcRenderer } from "electron";
import type {
  Board,
  BuildLogEvent,
  BuildStatusEvent,
  Control,
  ElectronApi,
  Panel,
  Project,
  UpdateStatus,
} from "../src/types";

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener as never);
  return () => ipcRenderer.removeListener(channel, listener as never);
}

const api: ElectronApi = {
  projectNew: (name) => ipcRenderer.invoke("project:new", name),
  projectSerialize: (project) => ipcRenderer.invoke("project:serialize", project),
  openProjectDialog: () => ipcRenderer.invoke("project:openDialog"),
  saveProject: (project, path) => ipcRenderer.invoke("project:save", { project, path }),

  panelUpsert: (project: Project, panel: Panel) =>
    ipcRenderer.invoke("panel:upsert", { project, panel }),
  panelDelete: (project, panelId) => ipcRenderer.invoke("panel:delete", { project, panelId }),
  boardUpsert: (project: Project, board: Board) =>
    ipcRenderer.invoke("board:upsert", { project, board }),
  boardDelete: (project, boardId) => ipcRenderer.invoke("board:delete", { project, boardId }),
  controlUpsert: (project: Project, control: Control) =>
    ipcRenderer.invoke("control:upsert", { project, control }),
  controlDelete: (project, controlId) =>
    ipcRenderer.invoke("control:delete", { project, controlId }),

  validate: (project) => ipcRenderer.invoke("validate", project),
  boardPinmap: (project, boardId) => ipcRenderer.invoke("board:pinmap", { project, boardId }),
  allocateIdentity: (project, boardId) =>
    ipcRenderer.invoke("identity:allocate", { project, boardId }),
  generateBoard: (project, boardId) => ipcRenderer.invoke("board:generate", { project, boardId }),

  listSerialPorts: () => ipcRenderer.invoke("ports:list"),
  detectPio: () => ipcRenderer.invoke("pio:detect"),
  compileBoard: (project, boardId) => ipcRenderer.invoke("build:compile", { project, boardId }),
  flashBoard: (project, boardId, port) =>
    ipcRenderer.invoke("build:flash", { project, boardId, port }),
  classifyPort: (project, boardId, port) =>
    ipcRenderer.invoke("identity:classifyPort", { project, boardId, port }),

  onCompileLog: (cb) => subscribe<BuildLogEvent>("build:compileLog", cb),
  onCompileStatus: (cb) => subscribe<BuildStatusEvent>("build:compileStatus", cb),
  onFlashLog: (cb) => subscribe<BuildLogEvent>("build:flashLog", cb),
  onFlashStatus: (cb) => subscribe<BuildStatusEvent>("build:flashStatus", cb),

  exportArduinoSketch: (project, boardId) =>
    ipcRenderer.invoke("export:arduino", { project, boardId }),
  exportPlatformioProject: (project, boardId) =>
    ipcRenderer.invoke("export:platformio", { project, boardId }),

  onUpdateStatus: (cb) => subscribe<UpdateStatus>("update:status", cb),
  installUpdate: () => ipcRenderer.invoke("update:install"),

  appVersion: () => ipcRenderer.invoke("app:version"),
};

contextBridge.exposeInMainWorld("api", api);
