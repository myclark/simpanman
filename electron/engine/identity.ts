// USB identity registry — ported from server/src/identity/registry.rs.

import type { BoardIdentity, Project } from "./types";

export const DEFAULT_VID = 0x1209;
const PROTOTYPING_MAX_PID = 0x000f;
const ALLOCATION_START_PID = 0x0010;
const MAX_PID = 0xffff;

/**
 * Assign a unique USB PID (and product name) to a board. Idempotent: a board
 * already above the prototyping range keeps its identity. Mutates `project` and
 * returns the resulting identity (mirrors allocate_identity).
 */
export function allocateIdentity(project: Project, boardId: string): BoardIdentity {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) {
    throw new Error(`Board '${boardId}' not found`);
  }

  // Already allocated → return as-is.
  if (board.identity.usbPid > PROTOTYPING_MAX_PID) {
    return board.identity;
  }

  const usedPids = new Set(
    project.boards.filter((b) => b.id !== boardId).map((b) => b.identity.usbPid),
  );

  let nextPid: number | undefined;
  for (let pid = ALLOCATION_START_PID; pid <= MAX_PID; pid++) {
    if (!usedPids.has(pid)) {
      nextPid = pid;
      break;
    }
  }
  if (nextPid === undefined) {
    throw new Error(
      `No free PIDs available (0x${ALLOCATION_START_PID.toString(16)}–0x${MAX_PID.toString(16)} all used)`,
    );
  }

  const identity: BoardIdentity = {
    usbProduct: board.name,
    usbVid: DEFAULT_VID,
    usbPid: nextPid,
  };
  board.identity = identity;
  return identity;
}

/** Report VID/PID collisions across boards (ported from check_uniqueness). */
export function checkUniqueness(project: Project): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const board of project.boards) {
    const key = `${board.identity.usbVid}:${board.identity.usbPid}`;
    const prev = seen.get(key);
    if (prev !== undefined) {
      conflicts.push(
        `Boards '${prev}' and '${board.name}' share VID=0x${board.identity.usbVid
          .toString(16)
          .padStart(4, "0")} PID=0x${board.identity.usbPid.toString(16).padStart(4, "0")}`,
      );
    } else {
      seen.set(key, board.name);
    }
  }
  return conflicts;
}
