// Classifies a freshly-detected serial port against a board's own identity,
// other boards in the project, and known stock (factory-default) identities —
// used by the Program stage's plug-in-diffing flow to decide whether a
// connected board is a re-flash, a fresh unflashed board, or a board already
// programmed for a different slot.

import { DEFAULT_VID } from "./identity";
import type { BoardType, Project, SerialPort } from "./types";

export type PortClassification = "self" | "stock" | "foreign" | "unknown";

/**
 * Factory USB VID/PID a board type enumerates with before Sim Panel Manager
 * firmware has ever been flashed to it (Arduino's own Leonardo/Micro
 * identities; the common SparkFun Pro Micro identity). If a specific batch of
 * boards doesn't match, this table may need a per-manufacturer entry later.
 */
const STOCK_IDENTITY: Record<BoardType, { vid: number; pid: number }> = {
  leonardo: { vid: 0x2341, pid: 0x8036 },
  micro: { vid: 0x2341, pid: 0x8037 },
  pro_micro: { vid: 0x1b4f, pid: 0x9206 },
};

/**
 * Classify a detected port against `boardId`'s identity:
 * - "self": matches this board's own assigned VID/PID (re-flashing it).
 * - "stock": matches the factory-default identity for this board type
 *   (genuinely unflashed).
 * - "foreign": in our allocated VID range but assigned to a different board
 *   (already programmed for another slot — needs explicit confirmation).
 * - "unknown": anything else (unrecognized device, or no VID/PID reported).
 */
export function classifyDetectedPort(
  project: Project,
  boardId: string,
  port: Pick<SerialPort, "vid" | "pid">,
): PortClassification {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) {
    throw new Error(`Board '${boardId}' not found`);
  }
  if (port.vid == null || port.pid == null) {
    return "unknown";
  }

  if (port.vid === board.identity.usbVid && port.pid === board.identity.usbPid) {
    return "self";
  }

  const stock = STOCK_IDENTITY[board.type];
  if (port.vid === stock.vid && port.pid === stock.pid) {
    return "stock";
  }

  if (port.vid === DEFAULT_VID) {
    return "foreign";
  }

  return "unknown";
}
