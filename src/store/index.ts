import { create } from "zustand";
import { open, save } from "@tauri-apps/plugin-dialog";
import { tauriApi } from "@/lib/tauri";
import type {
  Board,
  BuildLogLine,
  BuildStatus,
  BuildStatusEvent,
  BuildLogEvent,
  Control,
  Panel,
  PinMap,
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
  buildLogs: Record<string, BuildLogLine[]>;
  buildStatus: Record<string, BuildStatus>;
  serialPorts: SerialPort[];
  error: string | null;

  // File operations
  newProject: (name: string) => Promise<void>;
  openProject: () => Promise<void>;
  saveProject: (saveAs?: boolean) => Promise<void>;

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
  buildBoard: (boardId: string, port: string | null) => Promise<void>;

  // Build event handlers (called from event listeners)
  appendBuildLog: (event: BuildLogEvent) => void;
  setBuildStatus: (event: BuildStatusEvent) => void;

  // Error
  clearError: () => void;
}

let revalidateTimer: ReturnType<typeof setTimeout> | null = null;

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  isDirty: false,
  currentPath: null,
  validationReport: null,
  pinMaps: {},
  buildLogs: {},
  buildStatus: {},
  serialPorts: [],
  error: null,

  newProject: async (name) => {
    try {
      const project = await tauriApi.projectNew(name);
      set({ project, isDirty: false, currentPath: null, validationReport: null, pinMaps: {} });
      await get().refreshAllPinMaps();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openProject: async () => {
    try {
      const path = await open({
        title: "Open Project",
        filters: [{ name: "Sim Panel Manager", extensions: ["spm"] }],
      });
      if (!path || typeof path !== "string") return;
      const project = await tauriApi.projectOpen(path);
      set({ project, isDirty: false, currentPath: path, validationReport: null, pinMaps: {} });
      await Promise.all([get().revalidate(), get().refreshAllPinMaps()]);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveProject: async (saveAs = false) => {
    const { project, currentPath } = get();
    if (!project) return;
    try {
      let path = currentPath;
      if (!path || saveAs) {
        const chosen = await save({
          title: "Save Project",
          defaultPath: `${project.name}.spm`,
          filters: [{ name: "Sim Panel Manager", extensions: ["spm"] }],
        });
        if (!chosen) return;
        path = chosen;
      }
      await tauriApi.projectSave(path!, project);
      set({ isDirty: false, currentPath: path });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertPanel: async (panel) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await tauriApi.panelUpsert(project, panel);
      set({ project: updated, isDirty: true });
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deletePanel: async (id) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await tauriApi.panelDelete(project, id);
      set({ project: updated, isDirty: true });
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertBoard: async (board) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await tauriApi.boardUpsert(project, board);
      set({ project: updated, isDirty: true });
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
      const updated = await tauriApi.boardDelete(project, id);
      const pinMaps = { ...get().pinMaps };
      delete pinMaps[id];
      set({ project: updated, isDirty: true, pinMaps });
      scheduleRevalidate(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  upsertControl: async (control) => {
    const { project } = get();
    if (!project) return;
    try {
      const updated = await tauriApi.controlUpsert(project, control);
      set({ project: updated, isDirty: true });
      scheduleRevalidate(get);
      await get().refreshPinMap(control.boardId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteControl: async (id) => {
    const { project } = get();
    if (!project) return;
    const control = project.controls.find((c) => c.id === id);
    try {
      const updated = await tauriApi.controlDelete(project, id);
      set({ project: updated, isDirty: true });
      scheduleRevalidate(get);
      if (control) await get().refreshPinMap(control.boardId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  revalidate: async () => {
    const { project } = get();
    if (!project) return;
    try {
      const report = await tauriApi.validate(project);
      set({ validationReport: report });
    } catch (e) {
      console.warn("Validation failed:", e);
    }
  },

  refreshPinMap: async (boardId) => {
    const { project } = get();
    if (!project) return;
    try {
      const map = await tauriApi.boardPinmap(project, boardId);
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
      const [updated] = await tauriApi.allocateIdentity(project, boardId);
      set({ project: updated, isDirty: true });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  listPorts: async () => {
    try {
      const ports = await tauriApi.listSerialPorts();
      set({ serialPorts: ports });
    } catch (e) {
      console.warn("Port list failed:", e);
    }
  },

  buildBoard: async (boardId, port) => {
    const { project } = get();
    if (!project) return;
    set((s) => ({
      buildLogs: { ...s.buildLogs, [boardId]: [] },
      buildStatus: { ...s.buildStatus, [boardId]: "building" },
    }));
    try {
      await tauriApi.buildBoard(project, boardId, port);
    } catch (e) {
      set((s) => ({
        buildStatus: { ...s.buildStatus, [boardId]: "error" },
        error: String(e),
      }));
    }
  },

  appendBuildLog: (event) => {
    set((s) => ({
      buildLogs: {
        ...s.buildLogs,
        [event.boardId]: [
          ...(s.buildLogs[event.boardId] ?? []),
          { line: event.line, isErr: event.isErr, timestamp: Date.now() },
        ],
      },
    }));
  },

  setBuildStatus: (event) => {
    set((s) => ({
      buildStatus: {
        ...s.buildStatus,
        [event.boardId]: event.success ? "success" : "error",
      },
    }));
  },

  clearError: () => set({ error: null }),
}));

function scheduleRevalidate(get: () => ProjectStore) {
  if (revalidateTimer) clearTimeout(revalidateTimer);
  revalidateTimer = setTimeout(() => get().revalidate(), 300);
}
