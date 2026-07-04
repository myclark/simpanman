import { describe, it, expect } from "vitest";
import { loadFixture } from "./fixtures";
import { classifyDetectedPort } from "../../electron/engine";

describe("classifyDetectedPort", () => {
  it("classifies a port matching the board's own identity as self", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: 0x1209, pid: 1 });
    expect(result).toBe("self");
  });

  it("classifies the stock Leonardo identity as stock", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: 0x2341, pid: 0x8036 });
    expect(result).toBe("stock");
  });

  it("classifies our VID range assigned to a different board as foreign", () => {
    const project = loadFixture("multi-board-demo.spm");
    const boardB = project.boards.find((b) => b.id === "board-b")!;
    const result = classifyDetectedPort(project, "board-a", {
      vid: boardB.identity.usbVid,
      pid: boardB.identity.usbPid,
    });
    expect(result).toBe("foreign");
  });

  it("classifies an unrecognized VID/PID as unknown", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: 0x0483, pid: 0x5740 });
    expect(result).toBe("unknown");
  });

  it("classifies a port with no vid/pid as unknown", () => {
    const project = loadFixture("f5e-armament.spm");
    const result = classifyDetectedPort(project, "board-arm", { vid: undefined, pid: undefined });
    expect(result).toBe("unknown");
  });

  it("throws for an unknown board id", () => {
    const project = loadFixture("f5e-armament.spm");
    expect(() => classifyDetectedPort(project, "not-a-board", { vid: 1, pid: 1 })).toThrow(
      "not-a-board",
    );
  });
});
