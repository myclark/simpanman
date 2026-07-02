import { describe, it, expect } from "vitest";
import { recommendPin } from "./pinRecommendation";
import type { PinMap } from "@/types";

const pinMap: PinMap = {
  boardId: "b1",
  used: [],
  free: [
    { pin: "D5", interruptCapable: false },
    { pin: "D2", interruptCapable: true },
  ],
  warnings: [],
};

describe("recommendPin", () => {
  it("returns the first free pin by default", () => {
    expect(recommendPin(pinMap)).toBe("D5");
  });

  it("prefers an interrupt-capable pin when requested", () => {
    expect(recommendPin(pinMap, { interruptCapable: true })).toBe("D2");
  });

  it("returns null when there is no pin map", () => {
    expect(recommendPin(undefined)).toBeNull();
  });

  it("returns null when there are no free pins", () => {
    expect(recommendPin({ ...pinMap, free: [] })).toBeNull();
  });

  it("falls back to the first free pin if none is interrupt-capable", () => {
    const noInterrupt: PinMap = { ...pinMap, free: [{ pin: "D5", interruptCapable: false }] };
    expect(recommendPin(noInterrupt, { interruptCapable: true })).toBe("D5");
  });
});
