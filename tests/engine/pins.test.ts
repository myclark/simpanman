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

  it("flags interrupt-capable free pins on board-a (D0-D3, D7 minus used D2/D10/D11)", () => {
    const project = loadFixture("multi-board-demo.spm");
    const map = boardPinmap(project, "board-a");
    const d0 = map.free.find((p) => p.pin === "D0");
    expect(d0?.interruptCapable).toBe(true);
    const d4 = map.free.find((p) => p.pin === "D4");
    expect(d4?.interruptCapable).toBe(false);
  });
});
