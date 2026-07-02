// Firmware rendering — ported from server/src/codegen/render.rs.
// Builds the same template context shape the (now nunjucks) templates expect,
// then renders platformio.ini / main.cpp / board.json.

import nunjucks from "nunjucks";

import type { GeneratedBoard, JoystickAxis, Project } from "./types";
import { pinToArduinoNum } from "./model";
import { profileFor } from "./pins";
import { assignButtonIndices, totalButtonCount } from "./buttonIndex";
import { MAIN_CPP, PLATFORMIO_INI, BOARD_JSON } from "./templates";

const env = new nunjucks.Environment(null, {
  autoescape: false, // generating C++/INI/JSON, not HTML
  trimBlocks: true,
  lstripBlocks: true,
  throwOnUndefined: false,
});

const ALL_AXES: JoystickAxis[] = ["X", "Y", "Z", "Rx", "Ry", "Rz", "Slider1", "Slider2"];

/** Joystick library setter method for an axis (ported from JoystickAxis::setter_method). */
function axisSetter(axis: JoystickAxis): string {
  switch (axis) {
    case "X":
      return "setXAxis";
    case "Y":
      return "setYAxis";
    case "Z":
      return "setZAxis";
    case "Rx":
      return "setRxAxis";
    case "Ry":
      return "setRyAxis";
    case "Rz":
      return "setRzAxis";
    case "Slider1":
      return "setThrottle";
    case "Slider2":
      return "setRudder";
  }
}

function hex4(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function renderBoard(project: Project, boardId: string): GeneratedBoard {
  const board = project.boards.find((b) => b.id === boardId);
  if (!board) {
    throw new Error(`Board '${boardId}' not found`);
  }

  const profile = profileFor(board.type);
  const buttonMap = assignButtonIndices(project, boardId);
  const totalButtons = totalButtonCount(project, boardId);
  const boardControls = project.controls.filter((c) => c.boardId === boardId);

  const btn = (id: string, sub: number): number => buttonMap.get(id)?.get(sub) ?? sub;

  const buttonControls: unknown[] = [];
  const switchControls: unknown[] = [];
  const selectorControls: unknown[] = [];
  const encoderControls: Record<string, unknown>[] = [];
  const analogControls: unknown[] = [];
  const usedAxes = new Set<string>();

  for (const control of boardControls) {
    const cid = control.id;
    switch (control.kind) {
      case "button":
        if (!control.pin) break;
        buttonControls.push({
          id: control.id,
          label: control.label,
          pin_num: pinToArduinoNum(control.pin.pin),
          inverted: control.pin.inverted,
          button_start: btn(cid, 0),
        });
        break;
      case "switch":
        if (!control.pin) break;
        switchControls.push({
          id: control.id,
          label: control.label,
          pin_num: pinToArduinoNum(control.pin.pin),
          inverted: control.pin.inverted,
          on_label: control.onLabel,
          off_label: control.offLabel,
          button_on: btn(cid, 0),
          button_off: buttonMap.get(cid)?.get(1) ?? 1,
        });
        break;
      case "selector": {
        const positions = control.positions.map((pos, i) => ({
          label: pos.label,
          pins: pos.pins.map((pr) => ({
            pin_num: pinToArduinoNum(pr.pin),
            inverted: pr.inverted,
          })),
          op: pos.op === null || pos.op === undefined ? "single" : pos.op,
          button_idx: btn(cid, i),
        }));
        selectorControls.push({ id: control.id, label: control.label, positions });
        break;
      }
      case "encoder": {
        if (!control.encoder) break;
        const enc = control.encoder;
        const useInterrupt =
          profile.interruptPins.includes(enc.pinA) &&
          profile.interruptPins.includes(enc.pinB);
        const ec: Record<string, unknown> = {
          id: control.id,
          label: control.label,
          pin_a_num: pinToArduinoNum(enc.pinA),
          pin_b_num: pinToArduinoNum(enc.pinB),
          pin_a: enc.pinA,
          pin_b: enc.pinB,
          counts_per_detent: enc.countsPerDetent,
          mode: enc.mode,
          use_interrupt: useInterrupt,
        };
        if (enc.mode === "buttons") {
          ec.presses_per_detent = enc.pressesPerDetent ?? 1;
          ec.pulse_ms = enc.pulseMs ?? 20;
          ec.button_cw = btn(cid, 0);
          ec.button_ccw = buttonMap.get(cid)?.get(1) ?? 1;
        } else if (enc.axis != null) {
          usedAxes.add(enc.axis);
          ec.axis_setter = axisSetter(enc.axis);
          ec.delta_per_step = enc.deltaPerStep ?? 1;
          ec.axis_min = enc.min ?? 0;
          ec.axis_max = enc.max ?? 1023;
          ec.wrap = enc.wrap ?? false;
        }
        encoderControls.push(ec);
        break;
      }
      case "analog": {
        if (!control.analog) break;
        const ana = control.analog;
        usedAxes.add(ana.axis);
        analogControls.push({
          id: control.id,
          label: control.label,
          pin_num: pinToArduinoNum(ana.pin),
          axis_setter: axisSetter(ana.axis),
          in_min: ana.inMin,
          in_max: ana.inMax,
          out_min: ana.outMin,
          out_max: ana.outMax,
          invert: ana.invert,
          deadzone: ana.deadzone ?? null,
          smoothing: ana.smoothing ?? null,
        });
        break;
      }
    }
  }

  const interruptEncoders = encoderControls.filter((e) => e.use_interrupt === true);
  const pollingEncoders = encoderControls.filter((e) => e.use_interrupt !== true);

  const axisFlags = Object.fromEntries(ALL_AXES.map((a) => [a, usedAxes.has(a)]));

  const envName = board.id.replace(/-/g, "_");
  const buildVariant =
    board.type === "pro_micro" ? "sparkfun_promicro" : board.type;

  const ctx = {
    board: {
      id: board.id,
      env_name: envName,
      name: board.name,
      board_type: board.type,
      build_variant: buildVariant,
      identity: {
        usbProduct: board.identity.usbProduct,
        usbVid: board.identity.usbVid,
        usbPid: board.identity.usbPid,
        usbVidHex: hex4(board.identity.usbVid),
        usbPidHex: hex4(board.identity.usbPid),
      },
    },
    total_buttons: totalButtons,
    axis_flags: axisFlags,
    has_interrupt_encoders: interruptEncoders.length > 0,
    button_controls: buttonControls,
    switch_controls: switchControls,
    selector_controls: selectorControls,
    encoder_controls: encoderControls,
    interrupt_encoders: interruptEncoders,
    polling_encoders: pollingEncoders,
    analog_controls: analogControls,
    has_encoders: encoderControls.length > 0,
    has_analog: analogControls.length > 0,
  };

  const platformioIni = env.renderString(PLATFORMIO_INI, ctx);
  const mainCpp = env.renderString(MAIN_CPP, ctx);
  let boardJson: string | null = null;
  try {
    boardJson = env.renderString(BOARD_JSON, ctx);
  } catch {
    boardJson = null;
  }

  return { platformioIni, mainCpp, boardJson };
}
