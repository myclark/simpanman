import { describe, it, expect } from "vitest";
import { toArduinoSketch } from "../../electron/engine";
import type { GeneratedFile } from "../../electron/engine";

describe("toArduinoSketch", () => {
  const files: GeneratedFile[] = [
    { relativePath: "platformio.ini", content: "[env:board_a]\n" },
    { relativePath: "src/main.cpp", content: "void setup() {}\nvoid loop() {}\n" },
    { relativePath: "boards/board_a.json", content: "{}" },
  ];

  it("renames main.cpp to <sketchName>.ino", () => {
    const result = toArduinoSketch("LeftConsole", files);
    const ino = result.find((f) => f.relativePath === "LeftConsole.ino");
    expect(ino?.content).toBe("void setup() {}\nvoid loop() {}\n");
  });

  it("includes a README with the library and USB identity caveats", () => {
    const result = toArduinoSketch("LeftConsole", files);
    const readme = result.find((f) => f.relativePath === "README.txt");
    expect(readme?.content).toContain("Joystick");
    expect(readme?.content).toContain("USB identity");
  });

  it("drops platformio.ini and board.json files", () => {
    const result = toArduinoSketch("LeftConsole", files);
    expect(result.map((f) => f.relativePath)).toEqual(["LeftConsole.ino", "README.txt"]);
  });

  it("throws if there's no src/main.cpp", () => {
    expect(() => toArduinoSketch("LeftConsole", [])).toThrow("main.cpp");
  });
});
