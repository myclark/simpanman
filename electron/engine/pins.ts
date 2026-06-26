// Board pin profiles + the pin allocator — ported from server/src/pins/*.rs.

import type {
  BoardProfile,
  BoardType,
  Control,
  PinMap,
  Project,
  UsedPin,
} from "./types";
import { collectPins } from "./validation";

/** Pin profile for a board type. All ATmega32u4 variants share one profile. */
export function profileFor(_boardType: BoardType): BoardProfile {
  return atmega32u4Profile();
}

function atmega32u4Profile(): BoardProfile {
  const digitalPins = Array.from({ length: 14 }, (_, n) => `D${n}`);
  const analogPins = Array.from({ length: 6 }, (_, n) => `A${n}`);
  return {
    analogPins,
    interruptPins: ["D0", "D1", "D2", "D3", "D7"],
    serialPins: ["D0", "D1"],
    allUsablePins: [...digitalPins, ...analogPins],
  };
}

function kindLabel(control: Control): string {
  return control.kind;
}

/** Compute used/free pins + warnings for a board (ported from compute_pin_map). */
export function computePinMap(project: Project, boardId: string): PinMap {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) {
    return {
      boardId,
      used: [],
      free: [],
      warnings: [`Board '${boardId}' not found`],
    };
  }

  const profile = profileFor(board.type);
  const boardControls = project.controls.filter((c) => c.boardId === boardId);

  const used: UsedPin[] = [];
  const warnings: string[] = [];
  const seenPins = new Map<string, number>();

  for (const control of boardControls) {
    const kind = kindLabel(control);
    const pins = collectPins(control);

    for (const pin of pins) {
      const idx = used.length;
      const prevIdx = seenPins.get(pin);
      if (prevIdx !== undefined) {
        warnings.push(
          `Pin ${pin} is double-booked between '${used[prevIdx].controlLabel}' and '${control.label}'`,
        );
      } else {
        seenPins.set(pin, idx);
      }
      used.push({
        pin,
        controlId: control.id,
        controlLabel: control.label,
        controlKind: kind,
      });
    }

    if (control.kind === "encoder") {
      for (const pin of [control.encoder.pinA, control.encoder.pinB]) {
        if (!profile.interruptPins.includes(pin)) {
          warnings.push(
            `Encoder '${control.label}' uses pin ${pin} which is not interrupt-capable — falling back to polling`,
          );
        }
      }
    }
  }

  const usedPinNames = new Set(used.map((u) => u.pin));
  const free = profile.allUsablePins.filter((p) => !usedPinNames.has(p));

  for (const up of used) {
    if (profile.serialPins.includes(up.pin)) {
      warnings.push(
        `Pin ${up.pin} (used by '${up.controlLabel}') is the Serial TX/RX pin — may conflict with USB`,
      );
    }
  }

  return { boardId, used, free, warnings };
}
