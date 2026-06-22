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

/// Call a backend command over HTTP. Mirrors the old Tauri `invoke` contract:
/// resolves with the JSON result, or rejects with the server's error text.
async function post<T>(name: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${name} failed (${res.status})`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export const api = {
  projectNew: (name: string) => post<Project>("project_new", { name }),

  // Browser-native open: the frontend reads the file and sends its contents.
  projectOpen: (content: string) => post<Project>("project_open", { content }),

  // Browser-native save: backend returns canonical JSON to download as a Blob.
  projectSerialize: (project: Project) =>
    post<string>("project_serialize", { project }),

  panelUpsert: (project: Project, panel: Panel) =>
    post<Project>("panel_upsert", { project, panel }),

  panelDelete: (project: Project, panelId: string) =>
    post<Project>("panel_delete", { project, panelId }),

  boardUpsert: (project: Project, board: Board) =>
    post<Project>("board_upsert", { project, board }),

  boardDelete: (project: Project, boardId: string) =>
    post<Project>("board_delete", { project, boardId }),

  controlUpsert: (project: Project, control: Control) =>
    post<Project>("control_upsert", { project, control }),

  controlDelete: (project: Project, controlId: string) =>
    post<Project>("control_delete", { project, controlId }),

  validate: (project: Project) =>
    post<ValidationReport>("validate", { project }),

  boardPinmap: (project: Project, boardId: string) =>
    post<PinMap>("board_pinmap", { project, boardId }),

  allocateIdentity: (project: Project, boardId: string) =>
    post<[Project, BoardIdentity]>("allocate_identity", { project, boardId }),

  generateBoard: (project: Project, boardId: string) =>
    post<GeneratedProject>("generate_board", { project, boardId }),

  listSerialPorts: () => post<SerialPort[]>("list_serial_ports"),

  buildBoard: (project: Project, boardId: string, port: string | null) =>
    post<void>("build_board", { project, boardId, port }),
};
