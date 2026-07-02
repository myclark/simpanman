import { createColumnHelper } from "@tanstack/react-table";
import type { Control, Board, Panel } from "@/types";

export type ControlRow = {
  control: Control;
  panel: Panel | undefined;
  board: Board | undefined;
};

export interface ControlsTableMeta {
  onEdit: (controlId: string) => void;
  onDelete: (control: Control) => void;
}

const helper = createColumnHelper<ControlRow>();

function pinSummary(control: Control): string {
  switch (control.kind) {
    case "button":
    case "switch":
      if (!control.pin) return "Unassigned";
      return control.pin.pin + (control.pin.inverted ? " (NO)" : " (NC)");
    case "selector":
      const allPins = control.positions.flatMap((p) => p.pins.map((pr) => pr.pin));
      return [...new Set(allPins)].join(", ");
    case "encoder":
      if (!control.encoder) return "Unassigned";
      return `${control.encoder.pinA}, ${control.encoder.pinB}`;
    case "analog":
      if (!control.analog) return "Unassigned";
      return control.analog.pin;
  }
}

function configSummary(control: Control): string {
  switch (control.kind) {
    case "button":
      return "";
    case "switch":
      return `${control.onLabel} / ${control.offLabel}`;
    case "selector":
      return `${control.positions.length} pos: ${control.positions.map((p) => p.label).join(", ")}`;
    case "encoder":
      if (!control.encoder) return "Unassigned";
      if (control.encoder.mode === "buttons") {
        return `Buttons ×${control.encoder.pressesPerDetent ?? 1}/det`;
      }
      return `Axis ${control.encoder.axis ?? "?"} Δ${control.encoder.deltaPerStep ?? 1}`;
    case "analog":
      if (!control.analog) return "Unassigned";
      return `${control.analog.axis} [${control.analog.inMin}–${control.analog.inMax}]`;
  }
}

export const columns = [
  helper.accessor((row) => row.panel?.name ?? "—", {
    id: "panel",
    header: "Panel",
    size: 130,
    cell: (info) => (
      <span className="text-[#8b949e] text-xs">{info.getValue()}</span>
    ),
  }),
  helper.accessor((row) => row.control.label, {
    id: "label",
    header: "Label",
    size: 180,
    cell: (info) => (
      <span className="font-medium">{info.getValue()}</span>
    ),
  }),
  helper.accessor((row) => row.control.kind, {
    id: "kind",
    header: "Kind",
    size: 90,
    cell: (info) => (
      <span className={`text-xs px-1.5 py-0.5 rounded ${kindColor(info.getValue())}`}>
        {info.getValue()}
      </span>
    ),
  }),
  helper.accessor((row) => row.board?.name ?? "—", {
    id: "board",
    header: "Board",
    size: 130,
    cell: (info) => (
      <span className="text-[#8b949e] text-xs">{info.getValue()}</span>
    ),
  }),
  helper.accessor((row) => pinSummary(row.control), {
    id: "pins",
    header: "Pin(s)",
    size: 160,
    cell: (info) => (
      <span className="font-mono text-xs text-[#79c0ff]">{info.getValue()}</span>
    ),
  }),
  helper.accessor((row) => configSummary(row.control), {
    id: "config",
    header: "Config",
    size: 220,
    cell: (info) => (
      <span className="text-xs text-[#8b949e]">{info.getValue()}</span>
    ),
  }),
  helper.accessor((row) => row.control.notes, {
    id: "notes",
    header: "Notes",
    size: 200,
    cell: (info) => (
      <span className="text-xs text-[#484f58] italic">{info.getValue() ?? ""}</span>
    ),
  }),
  helper.display({
    id: "actions",
    header: "",
    size: 90,
    cell: (info) => {
      const meta = info.table.options.meta as ControlsTableMeta | undefined;
      const control = info.row.original.control;
      return (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => meta?.onEdit(control.id)}
            className="text-xs text-[#58a6ff] hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => meta?.onDelete(control)}
            className="text-xs text-[#f85149] hover:underline"
          >
            Delete
          </button>
        </div>
      );
    },
  }),
];

function kindColor(kind: string): string {
  switch (kind) {
    case "button": return "bg-[#1f3a5f] text-[#79c0ff]";
    case "switch": return "bg-[#1e3a2e] text-[#3fb950]";
    case "selector": return "bg-[#2d2a00] text-[#e3b341]";
    case "encoder": return "bg-[#3a1d6e] text-[#d2a8ff]";
    case "analog": return "bg-[#3d1a1a] text-[#ff7b72]";
    default: return "bg-[#21262d] text-[#8b949e]";
  }
}
