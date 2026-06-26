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
  writeToTempDir,
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

  // ── Serial ports + build/upload (native helper) ──────────────────────────────
  ipcMain.handle("ports:list", () => helper.listSerialPorts());

  ipcMain.handle("build:run", async (e, { project, boardId, port }) => {
    const send = (channel: string, payload: unknown) => {
      if (!e.sender.isDestroyed()) e.sender.send(channel, payload);
    };

    const report = validateProject(project);
    if (report.errors.length > 0) {
      send("build:status", { boardId, success: false, exitCode: -1 });
      throw new Error(
        `Validation errors must be resolved before building. First: ${JSON.stringify(
          report.errors[0],
        )}`,
      );
    }

    const board = project.boards.find((b: Project["boards"][number]) => b.id === boardId);
    if (!board) throw new Error(`Board '${boardId}' not found`);
    const envName = boardId.replace(/-/g, "_");

    send("build:log", {
      boardId,
      line: `Generating firmware for '${board.name}'...`,
      isErr: false,
    });

    const generated = generateBoard(project, boardId);
    const dir = await writeToTempDir(generated);
    send("build:log", { boardId, line: `Project written to ${path.normalize(dir)}`, isErr: false });

    await helper.buildBoard(dir, envName, port ?? null, {
      onLog: (l) => send("build:log", { boardId, line: l.line, isErr: l.isErr }),
      onStatus: (s) =>
        send("build:status", { boardId, success: s.success, exitCode: s.exitCode }),
    });
  });
}
