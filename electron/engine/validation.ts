// Model validation — ported from server/src/model/validation.rs.
//
// Error/warning shapes match what the renderer consumes (ControlsView.tsx):
// PascalCase `kind` discriminator + camelCase fields.

import type {
  Control,
  Project,
  ValidationError,
  ValidationReport,
  ValidationWarning,
} from "./types";
import { profileFor } from "./pins";

export function validate(project: Project): ValidationReport {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const boardIds = new Set(project.boards.map((b) => b.id));
  const panelIds = new Set(project.panels.map((p) => p.id));

  for (const control of project.controls) {
    const controlId = control.id;

    if (!control.boardId || !boardIds.has(control.boardId)) {
      errors.push({ kind: "MissingBoardRef", controlId, boardId: control.boardId });
    }
    if (!panelIds.has(control.panelId)) {
      errors.push({ kind: "MissingPanelRef", controlId, panelId: control.panelId });
    }

    switch (control.kind) {
      case "selector":
        for (const pos of control.positions) {
          if (pos.pins.length === 0) {
            errors.push({ kind: "SelectorNoPins", controlId, positionLabel: pos.label });
          }
          if (pos.pins.length > 1 && pos.op == null) {
            errors.push({ kind: "SelectorNoPins", controlId, positionLabel: pos.label });
          }
        }
        break;
      case "encoder":
        if (control.encoder == null) break;
        if (control.encoder.mode === "axis") {
          if (control.encoder.axis == null) {
            errors.push({ kind: "EncoderMissingAxisConfig", controlId });
          }
        } else {
          if (control.encoder.buttonCw == null || control.encoder.buttonCcw == null) {
            errors.push({ kind: "EncoderMissingButtonConfig", controlId });
          }
        }
        break;
      case "analog": {
        if (control.analog == null) break;
        const board = project.boards.find((b) => b.id === control.boardId);
        if (board) {
          const profile = profileFor(board.type);
          if (!profile.analogPins.includes(control.analog.pin)) {
            errors.push({
              kind: "AnalogPinNotCapable",
              controlId,
              pin: control.analog.pin,
            });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  for (const board of project.boards) {
    const profile = profileFor(board.type);
    const boardControls = project.controls.filter((c) => c.boardId === board.id);
    const pinOwners = new Map<string, string[]>();

    for (const control of boardControls) {
      const controlId = control.id;
      const pins = collectPins(control);

      for (const pin of pins) {
        const owners = pinOwners.get(pin) ?? [];
        owners.push(controlId);
        pinOwners.set(pin, owners);
      }

      if (control.kind === "encoder" && control.encoder != null) {
        for (const pin of [control.encoder.pinA, control.encoder.pinB]) {
          if (!profile.interruptPins.includes(pin)) {
            warnings.push({ kind: "EncoderOnNonInterruptPin", controlId, pin });
          }
        }
      }

      for (const pin of pins) {
        if (profile.serialPins.includes(pin)) {
          warnings.push({ kind: "SerialPinUsed", controlId, pin });
        }
      }
    }

    for (const [pin, owners] of pinOwners) {
      if (owners.length > 1) {
        errors.push({ kind: "PinDoubleBooked", boardId: board.id, pin, controlIds: owners });
      }
    }
  }

  return { errors, warnings };
}

/** All pin names a control occupies (selector pins de-duplicated). */
export function collectPins(control: Control): string[] {
  switch (control.kind) {
    case "button":
      return control.pin ? [control.pin.pin] : [];
    case "switch":
      return control.pin ? [control.pin.pin] : [];
    case "selector":
      return [
        ...new Set(control.positions.flatMap((p) => p.pins.map((pr) => pr.pin))),
      ];
    case "encoder":
      return control.encoder ? [control.encoder.pinA, control.encoder.pinB] : [];
    case "analog":
      return control.analog ? [control.analog.pin] : [];
  }
}
