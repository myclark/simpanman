import type { Project, PinMap, UsedPin } from "../../../src/types/index.js";

export const f5eProject: Project = {
  schemaVersion: 1,
  name: "F-5E Armament Panel",
  notes:
    "Faithful conversion of 'Arduino 1 code.pdf' (a single Leonardo, 34 logical buttons). One panel, one board.",
  panels: [{ id: "panel-armament", name: "Armament Panel", order: 0 }],
  boards: [
    {
      id: "board-arm",
      name: "Armament",
      type: "leonardo",
      identity: { usbProduct: "F5E Armament", usbVid: 4617, usbPid: 1 },
    },
  ],
  controls: [
    {
      id: "ctl-jettison-select",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Jettison Select",
      kind: "selector",
      positions: [
        {
          label: "Select Position",
          pins: [{ pin: "D11", inverted: true }],
          op: null,
        },
        {
          label: "Off",
          pins: [
            { pin: "D10", inverted: false },
            { pin: "D11", inverted: false },
          ],
          op: "and",
        },
        {
          label: "All Pylons",
          pins: [{ pin: "D10", inverted: true }],
          op: null,
        },
      ],
    },
    {
      id: "ctl-select-jettison",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Select Jettison",
      kind: "button",
      pin: { pin: "D12", inverted: true },
    },
    {
      id: "ctl-rwt-weapon",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Right Wingtip Weapon",
      kind: "switch",
      pin: { pin: "D9", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-r-outboard",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Right Outboard Pylon",
      kind: "switch",
      pin: { pin: "D8", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-r-inboard",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Right Inboard Pylon",
      kind: "switch",
      pin: { pin: "D7", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-center-pylon",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Center Pylon",
      kind: "switch",
      pin: { pin: "D6", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-l-inboard",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Left Inboard Pylon",
      kind: "switch",
      pin: { pin: "D5", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-l-outboard",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Left Outboard Pylon",
      kind: "switch",
      pin: { pin: "D4", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-lwt-weapon",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Left Wingtip Weapon",
      kind: "switch",
      pin: { pin: "D3", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-master-arm",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Master Arm",
      kind: "switch",
      pin: { pin: "D2", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-eng-start-r",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Engine Start R",
      kind: "button",
      pin: { pin: "D1", inverted: false },
      notes: "D1 is also Serial TX - app should warn.",
    },
    {
      id: "ctl-eng-start-l",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Engine Start L",
      kind: "button",
      pin: { pin: "D0", inverted: false },
      notes: "D0 is also Serial RX - app should warn.",
    },
    {
      id: "ctl-emergency-jettison",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Emergency All Jettison",
      kind: "button",
      pin: { pin: "D13", inverted: true },
    },
    {
      id: "ctl-pitch-damper",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Pitch Damper",
      kind: "switch",
      pin: { pin: "A0", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-yaw-damper",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Yaw Damper",
      kind: "switch",
      pin: { pin: "A1", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-landing-light",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Landing Light",
      kind: "switch",
      pin: { pin: "A2", inverted: false },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-ripple-interval",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Ripple Interval",
      kind: "selector",
      positions: [
        { label: "0.14 sec", pins: [{ pin: "A3", inverted: true }], op: null },
        {
          label: "0.10 sec",
          pins: [
            { pin: "A3", inverted: false },
            { pin: "A4", inverted: false },
          ],
          op: "and",
        },
        { label: "0.06 sec", pins: [{ pin: "A4", inverted: true }], op: null },
      ],
    },
    {
      id: "ctl-bomb-arm",
      panelId: "panel-armament",
      boardId: "board-arm",
      label: "Bomb Arm",
      kind: "switch",
      pin: { pin: "A5", inverted: true },
      onLabel: "Safe",
      offLabel: "Nose/Tail",
    },
  ],
};

export const multiboardProject: Project = {
  schemaVersion: 1,
  name: "Multi-board Demo",
  panels: [
    { id: "panel-arm", name: "Armament", order: 0 },
    { id: "panel-sight", name: "Sight", order: 1 },
    { id: "panel-sys", name: "Systems", order: 2 },
  ],
  boards: [
    {
      id: "board-a",
      name: "Board A",
      type: "leonardo",
      identity: { usbProduct: "Demo Board A", usbVid: 4617, usbPid: 1 },
    },
    {
      id: "board-b",
      name: "Board B",
      type: "leonardo",
      identity: { usbProduct: "Demo Board B", usbVid: 4617, usbPid: 2 },
    },
    {
      id: "board-c",
      name: "Board C",
      type: "leonardo",
      identity: { usbProduct: "Demo Board C", usbVid: 4617, usbPid: 3 },
    },
  ],
  controls: [
    {
      id: "ctl-master-arm",
      panelId: "panel-arm",
      boardId: "board-a",
      label: "Master Arm",
      kind: "switch",
      pin: { pin: "D2", inverted: true },
      onLabel: "Arm",
      offLabel: "Safe",
    },
    {
      id: "ctl-jettison-select",
      panelId: "panel-arm",
      boardId: "board-a",
      label: "Jettison Select",
      kind: "selector",
      positions: [
        {
          label: "Select Position",
          pins: [{ pin: "D11", inverted: true }],
          op: null,
        },
        {
          label: "Off",
          pins: [
            { pin: "D10", inverted: false },
            { pin: "D11", inverted: false },
          ],
          op: "and",
        },
        {
          label: "All Pylons",
          pins: [{ pin: "D10", inverted: true }],
          op: null,
        },
      ],
    },
    {
      id: "ctl-emergency-jettison",
      panelId: "panel-arm",
      boardId: "board-b",
      label: "Emergency All Jettison",
      kind: "button",
      pin: { pin: "D13", inverted: true },
    },
    {
      id: "ctl-missile-mode",
      panelId: "panel-sight",
      boardId: "board-b",
      label: "Missile Mode",
      kind: "selector",
      positions: [
        { label: "Off", pins: [{ pin: "D9", inverted: true }], op: null },
        { label: "MSL", pins: [{ pin: "D10", inverted: true }], op: null },
        {
          label: "A/A1-Guns",
          pins: [{ pin: "D8", inverted: true }],
          op: null,
        },
        {
          label: "A/A2-Guns",
          pins: [{ pin: "D7", inverted: true }],
          op: null,
        },
        { label: "MAN", pins: [{ pin: "D6", inverted: true }], op: null },
      ],
    },
    {
      id: "ctl-sight-brightness",
      panelId: "panel-sight",
      boardId: "board-b",
      label: "Sight Brightness",
      kind: "encoder",
      encoder: {
        pinA: "A0",
        pinB: "A1",
        countsPerDetent: 4,
        mode: "buttons",
        buttonCw: { label: "Brighter" },
        buttonCcw: { label: "Dimmer" },
        pressesPerDetent: 10,
        pulseMs: 10,
      },
    },
    {
      id: "ctl-sight-depression",
      panelId: "panel-sight",
      boardId: "board-b",
      label: "Sight Depression",
      kind: "encoder",
      encoder: {
        pinA: "A2",
        pinB: "A3",
        countsPerDetent: 4,
        mode: "axis",
        axis: "Slider1",
        deltaPerStep: 8,
        min: 0,
        max: 1023,
        wrap: false,
      },
    },
    {
      id: "ctl-pitot-anti-ice",
      panelId: "panel-sys",
      boardId: "board-c",
      label: "Pitot Anti-Ice",
      kind: "switch",
      pin: { pin: "D12", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-engine-anti-ice",
      panelId: "panel-sys",
      boardId: "board-c",
      label: "Engine Anti-Ice",
      kind: "switch",
      pin: { pin: "D11", inverted: true },
      onLabel: "On",
      offLabel: "Off",
    },
    {
      id: "ctl-cabin-pressure",
      panelId: "panel-sys",
      boardId: "board-c",
      label: "Cabin Pressure",
      kind: "analog",
      analog: {
        pin: "A0",
        axis: "Z",
        inMin: 0,
        inMax: 1023,
        outMin: 0,
        outMax: 1023,
        invert: false,
        deadzone: 8,
        smoothing: 0.2,
      },
    },
    {
      id: "ctl-rudder-trim",
      panelId: "panel-sys",
      boardId: "board-b",
      label: "Rudder Trim",
      kind: "analog",
      analog: {
        pin: "A4",
        axis: "Rz",
        inMin: 0,
        inMax: 1023,
        outMin: 0,
        outMax: 1023,
        invert: true,
      },
    },
  ],
};

const LEONARDO_PINS = [
  "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7",
  "D8", "D9", "D10", "D11", "D12", "D13",
  "A0", "A1", "A2", "A3", "A4", "A5",
];
const SERIAL_PINS = new Set(["D0", "D1"]);

function getControlPins(control: Project["controls"][number]): string[] {
  switch (control.kind) {
    case "button":
    case "switch":
      return [control.pin.pin];
    case "selector":
      return [...new Set(control.positions.flatMap((p) => p.pins.map((pr) => pr.pin)))];
    case "encoder":
      return [control.encoder.pinA, control.encoder.pinB];
    case "analog":
      return [control.analog.pin];
  }
}

export function computePinMap(project: Project, boardId: string): PinMap {
  const boardControls = project.controls.filter((c) => c.boardId === boardId);
  const used: UsedPin[] = [];
  const usedSet = new Set<string>();
  const warnings: string[] = [];

  for (const control of boardControls) {
    for (const pin of getControlPins(control)) {
      if (!usedSet.has(pin)) {
        usedSet.add(pin);
        used.push({ pin, controlId: control.id, controlLabel: control.label, controlKind: control.kind });
      }
      if (SERIAL_PINS.has(pin)) {
        warnings.push(`Pin ${pin} is also Serial TX/RX — may conflict with USB`);
      }
    }
  }

  return { boardId, used, free: LEONARDO_PINS.filter((p) => !usedSet.has(p)), warnings };
}
