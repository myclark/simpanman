import { describe, it, expect } from "vitest";
import { loadFixture } from "./fixtures";
import { allocateIdentity, checkUniqueness } from "../../electron/engine";

describe("identity registry", () => {
  it("assigns unique PIDs across boards", () => {
    let project = loadFixture("multi-board-demo.spm");
    for (const boardId of ["board-a", "board-b", "board-c"]) {
      [project] = allocateIdentity(project, boardId);
    }
    expect(checkUniqueness(project)).toHaveLength(0);
  });

  it("is idempotent above the prototyping range", () => {
    let project = loadFixture("multi-board-demo.spm");
    let first, second;
    [project, first] = allocateIdentity(project, "board-a");
    [project, second] = allocateIdentity(project, "board-a");
    expect(first.usbPid).toBe(second.usbPid);
  });
});
