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
  boardId: string;
  label: string;
  notes?: string;
};

export type ButtonControl = Base & { kind: "button"; pin: PinRef };
export type SwitchControl = Base & { kind: "switch"; pin: PinRef; onLabel: string; offLabel: string };
export type SelectorControl = Base & { kind: "selector"; positions: SelectorPosition[] };
export type EncoderControl = Base & { kind: "encoder"; encoder: EncoderConfig };
export type AnalogControl = Base & { kind: "analog"; analog: AnalogConfig };

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

export type PinMap = {
  boardId: string;
  used: UsedPin[];
  free: string[];
  warnings: string[];
};

export type ValidationError = {
  kind: string;
  boardId?: string;
  pin?: string;
  controlIds?: string[];
  controlId?: string;
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
