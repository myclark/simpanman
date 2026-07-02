// Command surface — ported from server/src/commands.rs. Pure functions over a
// Project; mutations return an updated copy (the renderer holds the source of truth).

import type {
  Board,
  BoardIdentity,
  ButtonControl,
  Control,
  EncoderControl,
  GeneratedProject,
  Panel,
  PinMap,
  Project,
  SelectorControl,
  SwitchControl,
  AnalogControl,
  ValidationReport,
} from "./types";
import { newProject, parseProject, serializeProject } from "./model";
import { validate } from "./validation";
import { computePinMap } from "./pins";
import { allocateIdentity as allocate } from "./identity";
import { renderBoard } from "./render";
import { toGeneratedProject } from "./emitter";

const clone = <T>(v: T): T => structuredClone(v);

// ── Project file operations ──────────────────────────────────────────────────

export const projectNew = (name: string): Project => newProject(name);
export const projectOpen = (content: string): Project => parseProject(content);
export const projectSerialize = (project: Project): string => serializeProject(project);

// ── Panel mutations ───────────────────────────────────────────────────────────

export function panelUpsert(project: Project, panel: Panel): Project {
  const next = clone(project);
  const i = next.panels.findIndex((p) => p.id === panel.id);
  if (i >= 0) next.panels[i] = panel;
  else next.panels.push(panel);
  return next;
}

export function panelDelete(project: Project, panelId: string): Project {
  const next = clone(project);
  next.panels = next.panels.filter((p) => p.id !== panelId);
  next.controls = next.controls.filter((c) => c.panelId !== panelId);
  return next;
}

// ── Board mutations ────────────────────────────────────────────────────────────

export function boardUpsert(project: Project, board: Board): Project {
  const next = clone(project);
  const i = next.boards.findIndex((b) => b.id === board.id);
  if (i >= 0) next.boards[i] = board;
  else next.boards.push(board);
  return next;
}

export function boardDelete(project: Project, boardId: string): Project {
  const next = clone(project);
  next.boards = next.boards.filter((b) => b.id !== boardId);
  next.controls = next.controls.map((c) => (c.boardId === boardId ? unassign(c) : c));
  return next;
}

/** Clear a control's board + kind-specific pin config, leaving it "unassigned". */
function unassign(control: Control): Control {
  const base = { ...control, boardId: undefined };
  switch (control.kind) {
    case "button":
      return { ...base, pin: undefined } as ButtonControl;
    case "switch":
      return { ...base, pin: undefined } as SwitchControl;
    case "selector":
      return { ...base, positions: [] } as SelectorControl;
    case "encoder":
      return { ...base, encoder: undefined } as EncoderControl;
    case "analog":
      return { ...base, analog: undefined } as AnalogControl;
  }
}

// ── Control mutations ──────────────────────────────────────────────────────────

export function controlUpsert(project: Project, control: Control): Project {
  const next = clone(project);
  const i = next.controls.findIndex((c) => c.id === control.id);
  if (i >= 0) next.controls[i] = control;
  else next.controls.push(control);
  return next;
}

export function controlDelete(project: Project, controlId: string): Project {
  const next = clone(project);
  next.controls = next.controls.filter((c) => c.id !== controlId);
  return next;
}

// ── Validation & pin allocation ────────────────────────────────────────────────

export const validateProject = (project: Project): ValidationReport => validate(project);

export const boardPinmap = (project: Project, boardId: string): PinMap =>
  computePinMap(project, boardId);

export function allocateIdentity(
  project: Project,
  boardId: string,
): [Project, BoardIdentity] {
  const next = clone(project);
  const identity = allocate(next, boardId);
  return [next, identity];
}

// ── Codegen ────────────────────────────────────────────────────────────────────

export function generateBoard(project: Project, boardId: string): GeneratedProject {
  const generated = renderBoard(project, boardId);
  return toGeneratedProject(boardId, generated);
}
