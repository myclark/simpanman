// IPC wiring: renderer ⇄ main. Pure project logic is handled in-process by the
// ported engine; serial + build/upload are delegated to the native Rust helper.
// Build progress is pushed back to the invoking renderer over build:log/status.

import { promises as fs } from "node:fs";
import path from "node:path";
import { dialog, ipcMain, app, BrowserWindow } from "electron";

import {
  projectNew,
  projectSerialize,
  projectOpen,
  panelUpsert,
  panelDelete,
  boardUpsert,
  boardDelete,
  controlUpsert,
  controlDelete,
  validateProject,
  boardPinmap,
  allocateIdentity,
  generateBoard,
  writeToBuildDir,
  writeProjectFiles,
  classifyDetectedPort,
  toArduinoSketch,
} from "./engine";
import type { Project } from "./engine";
import * as helper from "./helper";

const SPM_FILTERS = [
  { name: "Sim Panel Manager Project", extensions: ["spm"] },
  { name: "All Files", extensions: ["*"] },
];

export function registerIpc(): void {
  // ── Pure project logic ──────────────────────────────────────────────────────
  ipcMain.handle("project:new", (_e, name: string) => projectNew(name));
  ipcMain.handle("project:serialize", (_e, project: Project) => projectSerialize(project));

  ipcMain.handle("panel:upsert", (_e, { project, panel }) => panelUpsert(project, panel));
  ipcMain.handle("panel:delete", (_e, { project, panelId }) => panelDelete(project, panelId));
  ipcMain.handle("board:upsert", (_e, { project, board }) => boardUpsert(project, board));
  ipcMain.handle("board:delete", (_e, { project, boardId }) => boardDelete(project, boardId));
  ipcMain.handle("control:upsert", (_e, { project, control }) => controlUpsert(project, control));
  ipcMain.handle("control:delete", (_e, { project, controlId }) => controlDelete(project, controlId));

  ipcMain.handle("validate", (_e, project: Project) => validateProject(project));
  ipcMain.handle("board:pinmap", (_e, { project, boardId }) => boardPinmap(project, boardId));
  ipcMain.handle("identity:allocate", (_e, { project, boardId }) =>
    allocateIdentity(project, boardId),
  );
  ipcMain.handle("board:generate", (_e, { project, boardId }) => generateBoard(project, boardId));

  ipcMain.handle("app:version", () => app.getVersion());

  // ── Native file dialogs (replaces the browser blob/hidden-input flow) ────────
  ipcMain.handle("project:openDialog", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: "Open Project",
      filters: SPM_FILTERS,
      properties: ["openFile"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const content = await fs.readFile(filePath, "utf8");
    const project = projectOpen(content); // parses + migrates; throws on bad schema
    return { project, path: filePath };
  });

  ipcMain.handle("project:save", async (e, { project, path: knownPath }) => {
    let target: string | null = knownPath;
    if (!target) {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const res = await dialog.showSaveDialog(win!, {
        title: "Save Project",
        defaultPath: `${project.name}.spm`,
        filters: SPM_FILTERS,
      });
      if (res.canceled || !res.filePath) return null;
      target = res.filePath;
    }
    await fs.writeFile(target, projectSerialize(project));
    return { path: target };
  });

  // ── Serial ports + PlatformIO detect/compile/upload (native helper) ─────────
  ipcMain.handle("ports:list", () => helper.listSerialPorts());
  ipcMain.handle("pio:detect", () => helper.detectPio());
  ipcMain.handle("identity:classifyPort", (_e, { project, boardId, port }) =>
    classifyDetectedPort(project, boardId, port),
  );

  ipcMain.handle("build:compile", async (e, { project, boardId }) => {
    const send = (channel: string, payload: unknown) => {
      if (!e.sender.isDestroyed()) e.sender.send(channel, payload);
    };

    const { dir, envName } = await prepareBuildDir(project, boardId, "build:compileLog", send);
    await helper.compileBoard(dir, envName, {
      onLog: (l) => send("build:compileLog", { boardId, line: l.line, isErr: l.isErr }),
      onStatus: (s) =>
        send("build:compileStatus", { boardId, success: s.success, exitCode: s.exitCode }),
    });
  });

  ipcMain.handle("build:flash", async (e, { project, boardId, port }) => {
    const send = (channel: string, payload: unknown) => {
      if (!e.sender.isDestroyed()) e.sender.send(channel, payload);
    };

    const { dir, envName } = await prepareBuildDir(project, boardId, "build:flashLog", send);
    await helper.uploadBoard(dir, envName, port, {
      onLog: (l) => send("build:flashLog", { boardId, line: l.line, isErr: l.isErr }),
      onStatus: (s) =>
        send("build:flashStatus", { boardId, success: s.success, exitCode: s.exitCode }),
    });
  });

  // ── Export (native save-folder dialogs) ──────────────────────────────────────
  ipcMain.handle("export:arduino", async (e, { project, boardId }) => {
    const board = project.boards.find((b: Project["boards"][number]) => b.id === boardId);
    if (!board) throw new Error(`Board '${boardId}' not found`);

    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: "Export Arduino Sketch To…",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const generated = generateBoard(project, boardId);
    const sketchName = sanitizeFileName(board.name);
    const target = path.join(res.filePaths[0], sketchName);
    const files = toArduinoSketch(sketchName, generated.files);
    await writeProjectFiles(target, { boardId, files });
    return { path: target };
  });

  ipcMain.handle("export:platformio", async (e, { project, boardId }) => {
    const board = project.boards.find((b: Project["boards"][number]) => b.id === boardId);
    if (!board) throw new Error(`Board '${boardId}' not found`);

    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: "Export PlatformIO Project To…",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const generated = generateBoard(project, boardId);
    const target = path.join(res.filePaths[0], sanitizeFileName(board.name));
    await writeProjectFiles(target, generated);
    return { path: target };
  });
}

/** Turn a board name into a filesystem-safe directory/sketch name. */
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

/** Persistent per-board build directory: PlatformIO's `.pio` cache carries
 * over between a compile and a later flash, unlike a fresh temp dir per call. */
function buildDirFor(boardId: string): string {
  return path.join(app.getPath("userData"), "builds", boardId);
}

/** Validate, codegen, and write into this board's persistent build dir.
 * Shared by compile and flash — both need up-to-date generated sources. */
async function prepareBuildDir(
  project: Project,
  boardId: string,
  logChannel: string,
  send: (channel: string, payload: unknown) => void,
): Promise<{ dir: string; envName: string }> {
  const report = validateProject(project);
  if (report.errors.length > 0) {
    throw new Error(
      `Validation errors must be resolved before building. First: ${JSON.stringify(
        report.errors[0],
      )}`,
    );
  }

  const board = project.boards.find((b: Project["boards"][number]) => b.id === boardId);
  if (!board) throw new Error(`Board '${boardId}' not found`);
  const envName = boardId.replace(/-/g, "_");

  send(logChannel, { boardId, line: `Generating firmware for '${board.name}'...`, isErr: false });

  const generated = generateBoard(project, boardId);
  const dir = buildDirFor(boardId);
  await writeToBuildDir(dir, generated);
  send(logChannel, { boardId, line: `Project written to ${path.normalize(dir)}`, isErr: false });

  return { dir, envName };
}
