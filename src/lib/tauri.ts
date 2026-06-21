import { invoke } from "@tauri-apps/api/core";
import type {
  Board,
  BoardIdentity,
  Control,
  GeneratedProject,
  Panel,
  PinMap,
  Project,
  SerialPort,
  ValidationReport,
} from "@/types";

export const tauriApi = {
  projectNew: (name: string) => invoke<Project>("project_new", { name }),

  projectOpen: (path: string) => invoke<Project>("project_open", { path }),

  projectSave: (path: string, project: Project) =>
    invoke<void>("project_save", { path, project }),

  panelUpsert: (project: Project, panel: Panel) =>
    invoke<Project>("panel_upsert", { project, panel }),

  panelDelete: (project: Project, panelId: string) =>
    invoke<Project>("panel_delete", { project, panelId }),

  boardUpsert: (project: Project, board: Board) =>
    invoke<Project>("board_upsert", { project, board }),

  boardDelete: (project: Project, boardId: string) =>
    invoke<Project>("board_delete", { project, boardId }),

  controlUpsert: (project: Project, control: Control) =>
    invoke<Project>("control_upsert", { project, control }),

  controlDelete: (project: Project, controlId: string) =>
    invoke<Project>("control_delete", { project, controlId }),

  validate: (project: Project) =>
    invoke<ValidationReport>("validate", { project }),

  boardPinmap: (project: Project, boardId: string) =>
    invoke<PinMap>("board_pinmap", { project, boardId }),

  allocateIdentity: (project: Project, boardId: string) =>
    invoke<[Project, BoardIdentity]>("allocate_identity", { project, boardId }),

  generateBoard: (project: Project, boardId: string) =>
    invoke<GeneratedProject>("generate_board", { project, boardId }),

  listSerialPorts: () => invoke<SerialPort[]>("list_serial_ports"),

  buildBoard: (project: Project, boardId: string, port: string | null) =>
    invoke<void>("build_board", { project, boardId, port }),
};
