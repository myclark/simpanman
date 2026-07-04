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
  vid?: number;
  pid?: number;
  serialNumber?: string;
  product?: string;
};

/** Result of classifying a freshly-detected port against a board's identity —
 * see `electron/engine/portMatch.ts:classifyDetectedPort`. */
export type PortClassification = "self" | "stock" | "foreign" | "unknown";

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

export type PioInfo = { available: boolean; version: string | null };
export type PioStatus = PioInfo & { checked: boolean };

export type CompileStatus = "idle" | "compiling" | "success" | "error";
export type FlashStatus = "idle" | "flashing" | "success" | "error";

/** Per-board compile/flash state tracked by the store. `compiledAtVersion` is
 * the store's `projectVersion` at the last successful compile — the Program
 * stage compares it against the current `projectVersion` to detect staleness. */
export type BoardBuildState = {
  compileStatus: CompileStatus;
  compileLogs: BuildLogLine[];
  compiledAtVersion: number | null;
  flashStatus: FlashStatus;
  flashLogs: BuildLogLine[];
};

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

  // Native helper (serial + PlatformIO detect/compile/upload).
  listSerialPorts(): Promise<SerialPort[]>;
  detectPio(): Promise<PioInfo>;
  compileBoard(project: Project, boardId: string): Promise<void>;
  flashBoard(project: Project, boardId: string, port: string): Promise<void>;
  classifyPort(project: Project, boardId: string, port: SerialPort): Promise<PortClassification>;

  // Compile/flash event subscriptions (return an unsubscribe fn).
  onCompileLog(cb: (e: BuildLogEvent) => void): () => void;
  onCompileStatus(cb: (e: BuildStatusEvent) => void): () => void;
  onFlashLog(cb: (e: BuildLogEvent) => void): () => void;
  onFlashStatus(cb: (e: BuildStatusEvent) => void): () => void;

  // Export (native save-folder dialogs).
  exportArduinoSketch(project: Project, boardId: string): Promise<{ path: string } | null>;
  exportPlatformioProject(project: Project, boardId: string): Promise<{ path: string } | null>;

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
