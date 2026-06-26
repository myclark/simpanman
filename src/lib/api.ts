import type {
  Board,
  BoardIdentity,
  Control,
  GeneratedProject,
  OpenedProject,
  Panel,
  PinMap,
  Project,
  SavedProject,
  SerialPort,
  ValidationReport,
} from "@/types";

// Thin pass-through to the Electron preload bridge (window.api). Keeps the same
// method surface the store/views were written against; the transport is now IPC
// to the main-process engine + native helper instead of HTTP/WebSocket.
const bridge = () => window.api;

export const api = {
  projectNew: (name: string): Promise<Project> => bridge().projectNew(name),

  // Native open dialog: main process reads + parses the chosen file.
  openProjectDialog: (): Promise<OpenedProject | null> =>
    bridge().openProjectDialog(),

  // Native save dialog (path === null → Save As); returns the written path.
  saveProject: (project: Project, path: string | null): Promise<SavedProject | null> =>
    bridge().saveProject(project, path),

  projectSerialize: (project: Project): Promise<string> =>
    bridge().projectSerialize(project),

  panelUpsert: (project: Project, panel: Panel): Promise<Project> =>
    bridge().panelUpsert(project, panel),

  panelDelete: (project: Project, panelId: string): Promise<Project> =>
    bridge().panelDelete(project, panelId),

  boardUpsert: (project: Project, board: Board): Promise<Project> =>
    bridge().boardUpsert(project, board),

  boardDelete: (project: Project, boardId: string): Promise<Project> =>
    bridge().boardDelete(project, boardId),

  controlUpsert: (project: Project, control: Control): Promise<Project> =>
    bridge().controlUpsert(project, control),

  controlDelete: (project: Project, controlId: string): Promise<Project> =>
    bridge().controlDelete(project, controlId),

  validate: (project: Project): Promise<ValidationReport> =>
    bridge().validate(project),

  boardPinmap: (project: Project, boardId: string): Promise<PinMap> =>
    bridge().boardPinmap(project, boardId),

  allocateIdentity: (
    project: Project,
    boardId: string,
  ): Promise<[Project, BoardIdentity]> => bridge().allocateIdentity(project, boardId),

  generateBoard: (project: Project, boardId: string): Promise<GeneratedProject> =>
    bridge().generateBoard(project, boardId),

  listSerialPorts: (): Promise<SerialPort[]> => bridge().listSerialPorts(),

  buildBoard: (
    project: Project,
    boardId: string,
    port: string | null,
  ): Promise<void> => bridge().buildBoard(project, boardId, port),
};
