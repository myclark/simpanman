// Stable joystick-button index assignment — ported from server/src/codegen/button_index.rs.

import type { Control, Project } from "./types";

/** Lexicographic compare matching Rust's `str::cmp` (by code unit, not locale). */
function strCmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Number of logical joystick buttons a control contributes. */
function buttonCount(control: Control): number {
  switch (control.kind) {
    case "button":
      return 1;
    case "switch":
      return 2; // ON + OFF
    case "selector":
      return control.positions.length;
    case "encoder":
      return control.encoder.mode === "buttons" ? 2 : 0; // CW + CCW
    case "analog":
      return 0;
  }
}

/**
 * Map of `controlId` → (subIndex → 0-based joystick button number). Stable:
 * controls are ordered by label then id so indices survive regeneration.
 */
export function assignButtonIndices(
  project: Project,
  boardId: string,
): Map<string, Map<number, number>> {
  const controls = project.controls
    .filter((c) => c.boardId === boardId)
    .sort((a, b) => strCmp(a.label, b.label) || strCmp(a.id, b.id));

  const map = new Map<string, Map<number, number>>();
  let next = 0;
  for (const control of controls) {
    const count = buttonCount(control);
    const subMap = new Map<number, number>();
    for (let sub = 0; sub < count; sub++) {
      subMap.set(sub, next);
      next += 1;
    }
    map.set(control.id, subMap);
  }
  return map;
}

export function totalButtonCount(project: Project, boardId: string): number {
  return project.controls
    .filter((c) => c.boardId === boardId)
    .reduce((sum, c) => sum + buttonCount(c), 0);
}
