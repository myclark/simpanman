// Project model operations — ported from server/src/model/{project,migrations,types}.rs.

import { randomUUID } from "node:crypto";
import type { Project } from "./types";
import { CURRENT_SCHEMA_VERSION } from "./types";

/** Create a fresh project with one default panel and board (mirrors new_project). */
export function newProject(name: string): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    panels: [{ id: randomUUID(), name: "Panel 1", order: 0 }],
    boards: [
      {
        id: randomUUID(),
        name: "Board 1",
        type: "leonardo",
        identity: {
          usbProduct: "Board 1",
          usbVid: 0x1209,
          usbPid: 0x0010,
        },
      },
    ],
    controls: [],
  };
}

/** Parse a `.spm` project from raw JSON text and run schema migrations. */
export function parseProject(content: string): Project {
  let project: Project;
  try {
    project = JSON.parse(content) as Project;
  } catch (e) {
    throw new Error(`parsing project JSON: ${(e as Error).message}`);
  }
  return migrate(project);
}

/** Serialize a project to canonical pretty JSON. */
export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

/** Schema migrations keyed on schemaVersion (ported from migrations.rs). */
export function migrate(project: Project): Project {
  if (project.schemaVersion < CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unknown schema version ${project.schemaVersion}; this app supports up to version ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  if (project.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema version ${project.schemaVersion} is newer than this app supports (${CURRENT_SCHEMA_VERSION}). Please upgrade Sim Panel Manager.`,
    );
  }
  return project;
}

/** Strip a leading `D` from a digital pin name (`D7` → `7`, `A0` → `A0`). */
export function pinToArduinoNum(pin: string): string {
  return pin.startsWith("D") ? pin.slice(1) : pin;
}
