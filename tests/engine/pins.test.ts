import { describe, it, expect } from "vitest";
import { loadFixture } from "./fixtures";
import { boardPinmap } from "../../electron/engine";

describe("pin allocator", () => {
  it("reports no double-bookings for the F-5E board", () => {
    const project = loadFixture("f5e-armament.spm");
    const map = boardPinmap(project, "board-arm");
    const doubleBooked = map.warnings.filter((w) => w.includes("double-booked"));
    expect(doubleBooked).toHaveLength(0);
  });

  it("uses all 20 pins on the F-5E board", () => {
    const project = loadFixture("f5e-armament.spm");
    const map = boardPinmap(project, "board-arm");
    expect(map.free).toHaveLength(0);
  });

  it("warns about non-interrupt encoder pins on board-b", () => {
    const project = loadFixture("multi-board-demo.spm");
    const map = boardPinmap(project, "board-b");
    const interruptWarnings = map.warnings.filter((w) =>
      w.includes("interrupt-capable"),
    );
    expect(interruptWarnings.length).toBeGreaterThan(0);
  });
});
