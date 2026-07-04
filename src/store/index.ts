import { create } from "zustand";
import { api } from "@/lib/api";
import type {
  Board,
  BoardBuildState,
  BuildLogEvent,
  BuildStatusEvent,
  Control,
  GeneratedProject,
  Panel,
  PinMap,
  PioStatus,
  PortClassification,
  Project,
  SerialPort,
  ValidationReport,
} from "@/types";

interface ProjectStore {
  // State
  project: Project | null;
  isDirty: boolean;
  currentPath: string | null;
  validationReport: ValidationReport | null;
  pinMaps: Record<string, PinMap>;
  projectVersion: number;
  pio: PioStatus;
  boardBuild: Record<string, BoardBuildState>;
  serialPorts: SerialPort[];
  error: string | null;

  // File operations
  newProject: (name: string) => Promise<void>;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;

  // Mutations (return updated project from backend)
  upsertPanel: (panel: Panel) => Promise<void>;
  deletePanel: (id: string) => Promise<void>;
  upsertBoard: (board: Board) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  upsertControl: (control: Control) => Promise<void>;
  deleteControl: (id: string) => Promise<void>;

  // Derived data
  revalidate: () => Promise<void>;
  refreshPinMap: (boardId: string) => Promise<void>;
  refreshAllPinMaps: () => Promise<void>;
  allocateIdentity: (boardId: string) => Promise<void>;

  // Build
  listPorts: () => Promise<void>;
  detectPio: () => Promise<void>;
  generateFirmware: (boardId: string) => Promise<GeneratedProject | null>;
  compileBoard: (boardId: string) => Promise<void>;
  flashBoard: (boardId: string, port: string) => Promise<void>;
  classifyPort: (boardId: string, port: SerialPort) => Promise<PortClassification>;
  exportArduinoSketch: (boardId: string) => Promise<{ path: string } | null>;
  exportPlatformioProject: (boardId: string) => Promise<{ path: string } | null>;

  // Build event handlers (called from event listeners)
  appendCompileLog: (event: BuildLogEvent) => void;
  setCompileStatus: (event: BuildStatusEvent) => void;
  appendFlashLog: (event: BuildLogEvent) => void;
  setFlashStatus: (event: BuildStatusEvent) => void;

  // Error
  clearError: () => void;
}

let revalidateTimer: ReturnType<typeof setTimeout> | null = null;

const EMPTY_BOARD_BUILD: BoardBuildState = {
  compileStatus: "idle",
  compileLogs: [],
  compiledAtVersion: null,
  flashStatus: "idle",
  flashLogs: [],
};

function boardBuildOf(get: () => ProjectStore, boardId: string): BoardBuildState {
  return get().boardBuild[boardId] ?? EMPTY_BOARD_BUILD;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  isDirty: false,
  currentPath: null,
  validationReport: null,
  pinMaps: {},
  projectVersion: 0,
  pio: { checked: false, available: false, version: null },
  boardBuild: {},
  serialPorts: [],
  error: null,

  newProject: async (name) => {
    try {
      const project = await api.projectNew(name);
      set({
        project,
        isDirty: false,
        currentPath: null,
        validationReport: null,
        pinMaps: {},
        projectVersion: 0,
        boardBuild: {},
      });
      await get().refreshAllPinMaps();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openProject: async () => {
    try {
      const opened = await api.openProjectDialog();
      if (!opened) return; // dialog cancelled
      set({
        project: opened.project,
        isDirty: false,
        currentPath: opened.path,
        validationReport: null,
        pinMaps: {},
        projectVersion: 0,
        boardBuild: {},
      });
      await Promise.all([get().revalidate(), get().refreshAllPinMaps()]);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveProject: async () => {
    const { project, currentPath } = get();
    if (!project) return;
    try {
      const saved = await api.saveProject(project, currentPath);
      if (!saved) return; // dialog cancelled
      set({ isDirty: false, currentPath: saved.path });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertPanel: async (panel) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.panelUpsert(project, panel);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deletePanel: async (id) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.panelDelete(project, id);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertBoard: async (board) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.boardUpsert(project, board);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
      await get().refreshPinMap(board.id);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteBoard: async (id) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await api.boardDelete(project, id);
      const pinMaps = { ...get().pinMaps };
      delete pinMaps[id];
      const boardBuild = { ...get().boardBuild };
      delete boardBuild[id];
      set((s) => ({
        project: updated,
        isDirty: true,
        pinMaps,
        boardBuild,
        projectVersion: s.projectVersion + 1,
      }));
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertControl: async (control) => {
    const { project } = get();
    if (!project) return;
    const previous = project.controls.find((c) => c.id === control.id);
    try {
      const updated = await api.controlUpsert(project, control);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
      if (control.boardId) await get().refreshPinMap(control.boardId);
      if (previous?.boardId && previous.boardId !== control.boardId) {
        await get().refreshPinMap(previous.boardId);
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteControl: async (id) => {
    const { project } = get();
    if (!project) return;
    const control = project.controls.find((c) => c.id === id);
    try {
      const updated = await api.controlDelete(project, id);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
      scheduleRevalidate(get);
      if (control && control.boardId) await get().refreshPinMap(control.boardId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  revalidate: async () => {
    const { project } = get();
    if (!project) return;
    try {
      const report = await api.validate(project);
      set({ validationReport: report });
    } catch (e) {
      console.warn("Validation failed:", e);
    }
  },

  refreshPinMap: async (boardId) => {
    const { project } = get();
    if (!project) return;
    try {
      const map = await api.boardPinmap(project, boardId);
      set((s) => ({ pinMaps: { ...s.pinMaps, [boardId]: map } }));
    } catch (e) {
      console.warn("Pin map refresh failed:", e);
    }
  },

  refreshAllPinMaps: async () => {
    const { project } = get();
    if (!project) return;
    await Promise.all(project.boards.map((b) => get().refreshPinMap(b.id)));
  },

  allocateIdentity: async (boardId) => {
    const { project } = get();
    if (!project) return;
    try {
      const [updated] = await api.allocateIdentity(project, boardId);
      set((s) => ({ project: updated, isDirty: true, projectVersion: s.projectVersion + 1 }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  listPorts: async () => {
    try {
      const ports = await api.listSerialPorts();
      set({ serialPorts: ports });
    } catch (e) {
      console.warn("Port list failed:", e);
    }
  },

  detectPio: async () => {
    try {
      const info = await api.detectPio();
      set({ pio: { checked: true, available: info.available, version: info.version } });
    } catch (e) {
      set({ pio: { checked: true, available: false, version: null }, error: String(e) });
    }
  },

  generateFirmware: async (boardId) => {
    const { project } = get();
    if (!project) return null;
    try {
      return await api.generateBoard(project, boardId);
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  compileBoard: async (boardId) => {
    const { project } = get();
    if (!project) return;
    set((s) => ({
      boardBuild: {
        ...s.boardBuild,
        [boardId]: { ...boardBuildOf(get, boardId), compileStatus: "compiling", compileLogs: [] },
      },
    }));
    try {
      await api.compileBoard(project, boardId);
    } catch (e) {
      set((s) => ({
        boardBuild: {
          ...s.boardBuild,
          [boardId]: { ...boardBuildOf(get, boardId), compileStatus: "error" },
        },
        error: String(e),
      }));
    }
  },

  flashBoard: async (boardId, port) => {
    const { project } = get();
    if (!project) return;
    set((s) => ({
      boardBuild: {
        ...s.boardBuild,
        [boardId]: { ...boardBuildOf(get, boardId), flashStatus: "flashing", flashLogs: [] },
      },
    }));
    try {
      await api.flashBoard(project, boardId, port);
    } catch (e) {
      set((s) => ({
        boardBuild: {
          ...s.boardBuild,
          [boardId]: { ...boardBuildOf(get, boardId), flashStatus: "error" },
        },
        error: String(e),
      }));
    }
  },

  classifyPort: async (boardId, port) => {
    const { project } = get();
    if (!project) return "unknown";
    try {
      return await api.classifyPort(project, boardId, port);
    } catch (e) {
      set({ error: String(e) });
      return "unknown";
    }
  },

  exportArduinoSketch: async (boardId) => {
    const { project } = get();
    if (!project) return null;
    try {
      return await api.exportArduinoSketch(project, boardId);
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  exportPlatformioProject: async (boardId) => {
    const { project } = get();
    if (!project) return null;
    try {
      return await api.exportPlatformioProject(project, boardId);
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  appendCompileLog: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: {
            ...board,
            compileLogs: [
              ...board.compileLogs,
              { line: event.line, isErr: event.isErr, timestamp: Date.now() },
            ],
          },
        },
      };
    });
  },

  setCompileStatus: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: {
            ...board,
            compileStatus: event.success ? "success" : "error",
            compiledAtVersion: event.success ? s.projectVersion : board.compiledAtVersion,
          },
        },
      };
    });
  },

  appendFlashLog: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: {
            ...board,
            flashLogs: [
              ...board.flashLogs,
              { line: event.line, isErr: event.isErr, timestamp: Date.now() },
            ],
          },
        },
      };
    });
  },

  setFlashStatus: (event) => {
    set((s) => {
      const board = boardBuildOf(get, event.boardId);
      return {
        boardBuild: {
          ...s.boardBuild,
          [event.boardId]: { ...board, flashStatus: event.success ? "success" : "error" },
        },
      };
    });
  },

  clearError: () => set({ error: null }),
}));

function scheduleRevalidate(get: () => ProjectStore) {
  if (revalidateTimer) clearTimeout(revalidateTimer);
  revalidateTimer = setTimeout(() => get().revalidate(), 300);
}
