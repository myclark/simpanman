import { describe, it, expect } from "vitest";
import { loadFixture } from "./fixtures";
import {
  validateProject,
  projectNew,
  projectSerialize,
  projectOpen,
  controlUpsert,
} from "../../electron/engine";
import type { Control } from "../../electron/engine";

describe("validation", () => {
  it("passes for the F-5E fixture (warnings only on Serial pins)", () => {
    const project = loadFixture("f5e-armament.spm");
    const report = validateProject(project);
    expect(report.errors).toHaveLength(0);
    // D0/D1 are used as Serial pins in this fixture → expect warnings.
    expect(report.warnings.some((w) => w.kind === "SerialPinUsed")).toBe(true);
  });

  it("flags a pin double-booked between two controls", () => {
    let project = projectNew("T");
    const boardId = project.boards[0].id;
    const panelId = project.panels[0].id;
    const mk = (id: string): Control => ({
      id,
      panelId,
      boardId,
      label: id,
      kind: "button",
      pin: { pin: "D5", inverted: true },
    });
    project = controlUpsert(project, mk("a"));
    project = controlUpsert(project, mk("b"));
    const report = validateProject(project);
    expect(report.errors.some((e) => e.kind === "PinDoubleBooked")).toBe(true);
  });

  it("flags an analog control on a non-analog pin", () => {
    let project = projectNew("T");
    const boardId = project.boards[0].id;
    const panelId = project.panels[0].id;
    const analog: Control = {
      id: "an",
      panelId,
      boardId,
      label: "Throttle",
      kind: "analog",
      analog: {
        pin: "D5",
        axis: "Slider1",
        inMin: 0,
        inMax: 1023,
        outMin: 0,
        outMax: 1023,
        invert: false,
      },
    };
    project = controlUpsert(project, analog);
    const report = validateProject(project);
    expect(report.errors.some((e) => e.kind === "AnalogPinNotCapable")).toBe(true);
  });
});

describe("model round-trip", () => {
  it("serializes and re-parses a project unchanged", () => {
    const project = loadFixture("multi-board-demo.spm");
    const json = projectSerialize(project);
    const reparsed = projectOpen(json);
    expect(reparsed).toEqual(project);
  });

  it("rejects a newer schema version", () => {
    const project = projectNew("T");
    const bumped = projectSerialize({ ...project, schemaVersion: 999 });
    expect(() => projectOpen(bumped)).toThrow(/newer than this app supports/);
  });
});
