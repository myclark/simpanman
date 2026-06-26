import { describe, it, expect } from "vitest";
import { loadFixture } from "./fixtures";
import {
  renderBoard,
  generateBoard,
  assignButtonIndices,
} from "../../electron/engine";

describe("codegen", () => {
  it("renders the F-5E armament board", () => {
    const project = loadFixture("f5e-armament.spm");
    const g = renderBoard(project, "board-arm");
    expect(g.mainCpp).toContain("Joystick_");
    expect(g.mainCpp).toContain("INPUT_PULLUP");
    expect(g.mainCpp).toContain("setButton");
    expect(g.platformioIni).toContain("board_arm");
    expect(g.platformioIni).toContain("mheironimus/Joystick");
  });

  it("renders encoder + analog logic for multi-board board-b", () => {
    const project = loadFixture("multi-board-demo.spm");
    const g = renderBoard(project, "board-b");
    expect(
      g.mainCpp.includes("setThrottle") || g.mainCpp.includes("setSlider"),
    ).toBe(true);
    expect(g.mainCpp).toContain("analogRead");
  });

  it("assigns stable button indices across rerenders", () => {
    const project = loadFixture("multi-board-demo.spm");
    const m1 = assignButtonIndices(project, "board-b");
    const m2 = assignButtonIndices(project, "board-b");
    expect(JSON.stringify([...m1])).toBe(JSON.stringify([...m2]));
  });

  it("renders every board without throwing", () => {
    const project = loadFixture("multi-board-demo.spm");
    for (const board of project.boards) {
      expect(() => renderBoard(project, board.id)).not.toThrow();
    }
  });

  it("emits a board identity JSON file with the baked VID/PID", () => {
    const project = loadFixture("f5e-armament.spm");
    const gen = generateBoard(project, "board-arm");
    const boardJson = gen.files.find((f) => f.relativePath.startsWith("boards/"));
    expect(boardJson).toBeDefined();
    expect(boardJson!.content).toContain("atmega32u4");
  });

  it("produces a board.json snapshot for the F-5E board", () => {
    const project = loadFixture("f5e-armament.spm");
    const g = renderBoard(project, "board-arm");
    expect(g.boardJson).toMatchSnapshot();
  });
});
