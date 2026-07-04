// Arduino-IDE sketch export — transforms a generated PlatformIO project's
// files into an Arduino-IDE-compatible sketch folder: renames main.cpp to
// <SketchName>.ino and adds a README with the manual steps the IDE can't
// automate (installing the Joystick library, and the USB identity caveat —
// see docs/superpowers/specs/2026-07-04-staged-build-process-design.md).

import type { GeneratedFile } from "./types";

const README = `This sketch was exported from Sim Panel Manager.

Before building in the Arduino IDE:

1. Install the "Joystick" library (by Matthew Heironimus) via
   Sketch > Include Library > Manage Libraries...

Limitation: this board will enumerate with the Arduino IDE's default USB identity
(VID/PID/product), not the unique identity Sim Panel Manager assigned it.
Getting the assigned identity working requires a PlatformIO build instead —
see the Build stage in the app.
`;

/**
 * Convert a generated project's files into an Arduino sketch folder layout:
 * `src/main.cpp` → `<sketchName>.ino`, plus a README; `platformio.ini` and any
 * `boards/*.json` files are dropped (Arduino IDE has no equivalent).
 */
export function toArduinoSketch(sketchName: string, files: GeneratedFile[]): GeneratedFile[] {
  const mainCpp = files.find((f) => f.relativePath === "src/main.cpp");
  if (!mainCpp) {
    throw new Error("Generated project has no src/main.cpp to export");
  }
  return [
    { relativePath: `${sketchName}.ino`, content: mainCpp.content },
    { relativePath: "README.txt", content: README },
  ];
}
