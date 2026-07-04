// Public engine surface: pure project logic (model, validation, pins, identity,
// codegen) ported from the former Rust backend. Imported by the Electron main
// process IPC layer and by the engine unit tests.

export * from "./commands";
export * from "./emitter";
export { renderBoard } from "./render";
export { assignButtonIndices, totalButtonCount } from "./buttonIndex";
export { checkUniqueness } from "./identity";
export { classifyDetectedPort } from "./portMatch";
export { toArduinoSketch } from "./arduinoExport";
export { profileFor } from "./pins";
export {
  migrate,
  pinToArduinoNum,
  newProject,
  parseProject,
  serializeProject,
} from "./model";
export type * from "./types";
