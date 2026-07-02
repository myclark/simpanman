// Domain types mirroring the Rust model (camelCase throughout).

export type Panel = {
  id: string;
  name: string;
  order: number;
  layout?: { x: number; y: number; w: number; h: number };
};

export type BoardType = "leonardo" | "micro" | "pro_micro";

export type BoardIdentity = {
  usbProduct: string;
  usbVid: number;
  usbPid: number;
  serial?: string;
};

export type Board = {
  id: string;
  name: string;
  type: BoardType;
  identity: BoardIdentity;
};

export type PinRef = {
  pin: string;
  inverted: boolean;
};

export type ControlKind = "button" | "switch" | "selector" | "encoder" | "analog";

export type JoystickAxis = "X" | "Y" | "Z" | "Rx" | "Ry" | "Rz" | "Slider1" | "Slider2";

export type SelectorOp = "and" | "or";

export type SelectorPosition = {
  label: string;
  pins: PinRef[];
  op: SelectorOp | null;
};

export type EncoderMode = "buttons" | "axis";

export type EncoderButton = { label: string };

export type EncoderConfig = {
  pinA: string;
  pinB: string;
  countsPerDetent: 1 | 2 | 4;
  mode: EncoderMode;
  buttonCw?: EncoderButton;
  buttonCcw?: EncoderButton;
  pressesPerDetent?: number;
  pulseMs?: number;
  axis?: JoystickAxis;
  deltaPerStep?: number;
  min?: number;
  max?: number;
  wrap?: boolean;
};

export type AnalogConfig = {
  pin: string;
  axis: JoystickAxis;
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
  invert: boolean;
  deadzone?: number;
  smoothing?: number;
};

type Base = {
  id: string;
  panelId: string;
  boardId?: string;
  label: string;
  notes?: string;
};

export type ButtonControl = Base & { kind: "button"; pin?: PinRef };
export type SwitchControl = Base & { kind: "switch"; pin?: PinRef; onLabel: string; offLabel: string };
export type SelectorControl = Base & { kind: "selector"; positions: SelectorPosition[] };
export type EncoderControl = Base & { kind: "encoder"; encoder?: EncoderConfig };
export type AnalogControl = Base & { kind: "analog"; analog?: AnalogConfig };

export type Control =
  | ButtonControl
  | SwitchControl
  | SelectorControl
  | EncoderControl
  | AnalogControl;

export type Project = {
  schemaVersion: number;
  name: string;
  notes?: string;
  panels: Panel[];
  boards: Board[];
  controls: Control[];
};

// ── Tauri command response types ──────────────────────────────────────────────

export type UsedPin = {
  pin: string;
  controlId: string;
  controlLabel: string;
  controlKind: string;
};

export type FreePin = {
  pin: string;
  interruptCapable: boolean;
};

export type PinMap = {
  boardId: string;
  used: UsedPin[];
  free: FreePin[];
  warnings: string[];
};

export type ValidationError = {
  kind: string;
  boardId?: string;
  pin?: string;
  controlIds?: string[];
  controlId?: string;
  panelId?: string;
  positionLabel?: string;
};

export type ValidationWarning = {
  kind: string;
  controlId?: string;
  pin?: string;
};

export type ValidationReport = {
  errors: ValidationError[];
  warnings: ValidationWarning[];
};

export type SerialPort = {
  name: string;
  description?: string;
};

export type GeneratedFile = {
  relativePath: string;
  content: string;
};

export type GeneratedProject = {
  boardId: string;
  files: GeneratedFile[];
};

// ── Event payload types ───────────────────────────────────────────────────────

export type BuildLogEvent = {
  boardId: string;
  line: string;
  isErr: boolean;
};

export type BuildStatusEvent = {
  boardId: string;
  success: boolean;
  exitCode: number;
};

export type BuildStatus = "idle" | "building" | "success" | "error";

export type BuildLogLine = {
  line: string;
  isErr: boolean;
  timestamp: number;
};

// ── Auto-update status (electron-updater, surfaced over IPC) ───────────────────

export type UpdateStatus =
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

// ── Preload bridge contract (window.api) ──────────────────────────────────────
// Implemented in electron/preload.ts, consumed by src/lib/*. Single source of
// truth so the main-process bridge and the renderer cannot drift.

export type OpenedProject = { project: Project; path: string };
export type SavedProject = { path: string };

export interface ElectronApi {
  // Project file operations (native dialogs handled in the main process).
  projectNew(name: string): Promise<Project>;
  projectSerialize(project: Project): Promise<string>;
  openProjectDialog(): Promise<OpenedProject | null>;
  saveProject(project: Project, path: string | null): Promise<SavedProject | null>;

  // Model mutations.
  panelUpsert(project: Project, panel: Panel): Promise<Project>;
  panelDelete(project: Project, panelId: string): Promise<Project>;
  boardUpsert(project: Project, board: Board): Promise<Project>;
  boardDelete(project: Project, boardId: string): Promise<Project>;
  controlUpsert(project: Project, control: Control): Promise<Project>;
  controlDelete(project: Project, controlId: string): Promise<Project>;

  // Derived data.
  validate(project: Project): Promise<ValidationReport>;
  boardPinmap(project: Project, boardId: string): Promise<PinMap>;
  allocateIdentity(project: Project, boardId: string): Promise<[Project, BoardIdentity]>;
  generateBoard(project: Project, boardId: string): Promise<GeneratedProject>;

  // Native helper (serial + PlatformIO build/upload).
  listSerialPorts(): Promise<SerialPort[]>;
  buildBoard(project: Project, boardId: string, port: string | null): Promise<void>;

  // Build event subscriptions (return an unsubscribe fn).
  onBuildLog(cb: (e: BuildLogEvent) => void): () => void;
  onBuildStatus(cb: (e: BuildStatusEvent) => void): () => void;

  // Auto-update.
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void;
  installUpdate(): Promise<void>;

  // App metadata.
  appVersion(): Promise<string>;
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}
