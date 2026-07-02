// Engine types. Domain types are the single source of truth in src/types
// (shared with the renderer); this module re-exports them and adds the
// engine-internal codegen types that have no renderer counterpart.

export type {
  Panel,
  BoardType,
  BoardIdentity,
  Board,
  PinRef,
  FreePin,
  ControlKind,
  JoystickAxis,
  SelectorOp,
  SelectorPosition,
  EncoderMode,
  EncoderButton,
  EncoderConfig,
  AnalogConfig,
  ButtonControl,
  SwitchControl,
  SelectorControl,
  EncoderControl,
  AnalogControl,
  Control,
  Project,
  UsedPin,
  PinMap,
  ValidationError,
  ValidationWarning,
  ValidationReport,
  SerialPort,
  GeneratedFile,
  GeneratedProject,
} from "../../src/types/index";

export const CURRENT_SCHEMA_VERSION = 1;

/** Per-board-type pin capabilities (ported from pins/profile.rs). */
export type BoardProfile = {
  analogPins: string[];
  interruptPins: string[];
  serialPins: string[];
  allUsablePins: string[];
};

/** Rendered firmware for a single board, before it is split into files. */
export type GeneratedBoard = {
  platformioIni: string;
  mainCpp: string;
  boardJson: string | null;
};
