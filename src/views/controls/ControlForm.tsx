import { useState } from "react";
import { useProjectStore } from "@/store";
import { recommendPin } from "@/lib/pinRecommendation";
import type {
  Control,
  ControlKind,
  EncoderMode,
  JoystickAxis,
  Project,
  SelectorPosition,
} from "@/types";
import SelectorPositionsEditor from "./SelectorPositionsEditor";

export interface ControlFormProps {
  project: Project;
  panelId: string;
  initial: Control | null;
  onSave: (control: Control) => void;
  onCancel: () => void;
}

const AXES: JoystickAxis[] = ["X", "Y", "Z", "Rx", "Ry", "Rz", "Slider1", "Slider2"];

type Draft = {
  id: string;
  kind: ControlKind;
  label: string;
  notes: string;
  boardId: string; // "" = unassigned
  pin: string;
  inverted: boolean;
  onLabel: string;
  offLabel: string;
  pinA: string;
  pinB: string;
  countsPerDetent: 1 | 2 | 4;
  mode: EncoderMode;
  buttonCwLabel: string;
  buttonCcwLabel: string;
  pressesPerDetent: number;
  axis: JoystickAxis;
  deltaPerStep: number;
  analogPin: string;
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
  invert: boolean;
  positions: SelectorPosition[];
};

function initDraft(initial: Control | null): Draft {
  const base: Draft = {
    id: initial?.id ?? crypto.randomUUID(),
    kind: initial?.kind ?? "button",
    label: initial?.label ?? "",
    notes: initial?.notes ?? "",
    boardId: initial?.boardId ?? "",
    pin: "",
    inverted: false,
    onLabel: "On",
    offLabel: "Off",
    pinA: "",
    pinB: "",
    countsPerDetent: 4,
    mode: "buttons",
    buttonCwLabel: "",
    buttonCcwLabel: "",
    pressesPerDetent: 1,
    axis: "X",
    deltaPerStep: 1,
    analogPin: "",
    inMin: 0,
    inMax: 1023,
    outMin: 0,
    outMax: 1023,
    invert: false,
    positions: [],
  };
  if (!initial) return base;
  switch (initial.kind) {
    case "button":
      return { ...base, pin: initial.pin?.pin ?? "", inverted: initial.pin?.inverted ?? false };
    case "switch":
      return {
        ...base,
        pin: initial.pin?.pin ?? "",
        inverted: initial.pin?.inverted ?? false,
        onLabel: initial.onLabel,
        offLabel: initial.offLabel,
      };
    case "selector":
      return { ...base, positions: initial.positions };
    case "encoder":
      return {
        ...base,
        pinA: initial.encoder?.pinA ?? "",
        pinB: initial.encoder?.pinB ?? "",
        countsPerDetent: initial.encoder?.countsPerDetent ?? 4,
        mode: initial.encoder?.mode ?? "buttons",
        buttonCwLabel: initial.encoder?.buttonCw?.label ?? "",
        buttonCcwLabel: initial.encoder?.buttonCcw?.label ?? "",
        pressesPerDetent: initial.encoder?.pressesPerDetent ?? 1,
        axis: initial.encoder?.axis ?? "X",
        deltaPerStep: initial.encoder?.deltaPerStep ?? 1,
      };
    case "analog":
      return {
        ...base,
        analogPin: initial.analog?.pin ?? "",
        axis: initial.analog?.axis ?? "X",
        inMin: initial.analog?.inMin ?? 0,
        inMax: initial.analog?.inMax ?? 1023,
        outMin: initial.analog?.outMin ?? 0,
        outMax: initial.analog?.outMax ?? 1023,
        invert: initial.analog?.invert ?? false,
      };
  }
}

function buildControl(draft: Draft, panelId: string): Control {
  const base = {
    id: draft.id,
    panelId,
    boardId: draft.boardId || undefined,
    label: draft.label,
    notes: draft.notes || undefined,
  };
  switch (draft.kind) {
    case "button":
      return {
        ...base,
        kind: "button",
        pin: draft.pin ? { pin: draft.pin, inverted: draft.inverted } : undefined,
      };
    case "switch":
      return {
        ...base,
        kind: "switch",
        pin: draft.pin ? { pin: draft.pin, inverted: draft.inverted } : undefined,
        onLabel: draft.onLabel,
        offLabel: draft.offLabel,
      };
    case "selector":
      return { ...base, kind: "selector", positions: draft.positions };
    case "encoder":
      return {
        ...base,
        kind: "encoder",
        encoder:
          draft.pinA && draft.pinB
            ? {
                pinA: draft.pinA,
                pinB: draft.pinB,
                countsPerDetent: draft.countsPerDetent,
                mode: draft.mode,
                buttonCw: draft.mode === "buttons" ? { label: draft.buttonCwLabel } : undefined,
                buttonCcw: draft.mode === "buttons" ? { label: draft.buttonCcwLabel } : undefined,
                pressesPerDetent: draft.mode === "buttons" ? draft.pressesPerDetent : undefined,
                axis: draft.mode === "axis" ? draft.axis : undefined,
                deltaPerStep: draft.mode === "axis" ? draft.deltaPerStep : undefined,
              }
            : undefined,
      };
    case "analog":
      return {
        ...base,
        kind: "analog",
        analog: draft.analogPin
          ? {
              pin: draft.analogPin,
              axis: draft.axis,
              inMin: draft.inMin,
              inMax: draft.inMax,
              outMin: draft.outMin,
              outMax: draft.outMax,
              invert: draft.invert,
            }
          : undefined,
      };
  }
}

export default function ControlForm({ project, panelId, initial, onSave, onCancel }: ControlFormProps) {
  const pinMaps = useProjectStore((s) => s.pinMaps);
  const [draft, setDraft] = useState<Draft>(() => initDraft(initial));

  const pinMap = draft.boardId ? pinMaps[draft.boardId] : undefined;

  const setKind = (kind: ControlKind) => {
    setDraft((d) => {
      const next = { ...d, kind };
      if (kind === "button" || kind === "switch") {
        next.pin = next.pin || recommendPin(pinMap) || "";
      } else if (kind === "encoder" && !next.pinA) {
        next.pinA = recommendPin(pinMap, { interruptCapable: true }) || "";
      } else if (kind === "analog" && !next.analogPin) {
        next.analogPin = recommendPin(pinMap) || "";
      }
      return next;
    });
  };

  const setBoardId = (boardId: string) => {
    const map = boardId ? pinMaps[boardId] : undefined;
    setDraft((d) => {
      const next = { ...d, boardId };
      if (d.kind === "button" || d.kind === "switch") next.pin = recommendPin(map) || "";
      if (d.kind === "encoder") {
        next.pinA = recommendPin(map, { interruptCapable: true }) || "";
        next.pinB = "";
      }
      if (d.kind === "analog") next.analogPin = recommendPin(map) || "";
      return next;
    });
  };

  const freePinOptions = (currentValue: string) => {
    const options = pinMap?.free.map((f) => f.pin) ?? [];
    return currentValue && !options.includes(currentValue) ? [currentValue, ...options] : options;
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(buildControl(draft, panelId));
      }}
      className="p-3 space-y-2 bg-[#0d1117] border border-[#30363d] rounded"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[#8b949e]">
          Kind
          <select
            value={draft.kind}
            onChange={(e) => setKind(e.target.value as ControlKind)}
            className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          >
            <option value="button">Button</option>
            <option value="switch">Switch</option>
            <option value="selector">Selector</option>
            <option value="encoder">Encoder</option>
            <option value="analog">Analog</option>
          </select>
        </label>
        <label className="text-xs text-[#8b949e]">
          Label
          <input
            required
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          />
        </label>
        <label className="text-xs text-[#8b949e]">
          Board
          <select
            value={draft.boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          >
            <option value="">— Unassigned —</option>
            {project.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(draft.kind === "button" || draft.kind === "switch") && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#8b949e]">
            Pin
            <select
              value={draft.pin}
              onChange={(e) => setDraft((d) => ({ ...d, pin: e.target.value }))}
              disabled={!draft.boardId}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              <option value="">— none —</option>
              {freePinOptions(draft.pin).map((pin) => (
                <option key={pin} value={pin}>
                  {pin}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#8b949e] flex items-end gap-1 pb-1.5">
            <input
              type="checkbox"
              checked={draft.inverted}
              onChange={(e) => setDraft((d) => ({ ...d, inverted: e.target.checked }))}
            />
            Inverted (wired NC)
          </label>
        </div>
      )}

      {draft.kind === "switch" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#8b949e]">
            On label
            <input
              value={draft.onLabel}
              onChange={(e) => setDraft((d) => ({ ...d, onLabel: e.target.value }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            />
          </label>
          <label className="text-xs text-[#8b949e]">
            Off label
            <input
              value={draft.offLabel}
              onChange={(e) => setDraft((d) => ({ ...d, offLabel: e.target.value }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            />
          </label>
        </div>
      )}

      {draft.kind === "selector" && (
        <SelectorPositionsEditor
          positions={draft.positions}
          onChange={(positions) => setDraft((d) => ({ ...d, positions }))}
        />
      )}

      {draft.kind === "encoder" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[#8b949e]">
              Pin A (recommended interrupt-capable)
              <select
                value={draft.pinA}
                onChange={(e) => setDraft((d) => ({ ...d, pinA: e.target.value }))}
                disabled={!draft.boardId}
                className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
              >
                <option value="">— none —</option>
                {freePinOptions(draft.pinA).map((pin) => (
                  <option key={pin} value={pin}>
                    {pin}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#8b949e]">
              Pin B
              <select
                value={draft.pinB}
                onChange={(e) => setDraft((d) => ({ ...d, pinB: e.target.value }))}
                disabled={!draft.boardId}
                className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
              >
                <option value="">— none —</option>
                {freePinOptions(draft.pinB).map((pin) => (
                  <option key={pin} value={pin}>
                    {pin}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs text-[#8b949e]">
            Mode
            <select
              value={draft.mode}
              onChange={(e) => setDraft((d) => ({ ...d, mode: e.target.value as EncoderMode }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              <option value="buttons">Buttons</option>
              <option value="axis">Axis</option>
            </select>
          </label>
          {draft.mode === "buttons" ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-[#8b949e]">
                CW button label
                <input
                  value={draft.buttonCwLabel}
                  onChange={(e) => setDraft((d) => ({ ...d, buttonCwLabel: e.target.value }))}
                  className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
                />
              </label>
              <label className="text-xs text-[#8b949e]">
                CCW button label
                <input
                  value={draft.buttonCcwLabel}
                  onChange={(e) => setDraft((d) => ({ ...d, buttonCcwLabel: e.target.value }))}
                  className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
                />
              </label>
            </div>
          ) : (
            <label className="text-xs text-[#8b949e]">
              Axis
              <select
                value={draft.axis}
                onChange={(e) => setDraft((d) => ({ ...d, axis: e.target.value as JoystickAxis }))}
                className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
              >
                {AXES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {draft.kind === "analog" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[#8b949e]">
            Pin
            <select
              value={draft.analogPin}
              onChange={(e) => setDraft((d) => ({ ...d, analogPin: e.target.value }))}
              disabled={!draft.boardId}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              <option value="">— none —</option>
              {freePinOptions(draft.analogPin).map((pin) => (
                <option key={pin} value={pin}>
                  {pin}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#8b949e]">
            Axis
            <select
              value={draft.axis}
              onChange={(e) => setDraft((d) => ({ ...d, axis: e.target.value as JoystickAxis }))}
              className="block w-full mt-0.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
            >
              {AXES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1 text-xs rounded bg-[#1f6feb] hover:bg-[#388bfd] text-white font-medium"
        >
          Save
        </button>
      </div>
    </form>
  );
}
