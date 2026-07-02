import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type GroupingState,
  type ExpandedState,
} from "@tanstack/react-table";
import { useMemo, useState, type ReactNode } from "react";
import { useProjectStore } from "@/store";
import { columns, type ControlRow, type ControlsTableMeta } from "./controls/columns";
import ControlForm from "./controls/ControlForm";
import type { Control, Panel } from "@/types";

export default function ControlsView() {
  const { project, validationReport, upsertControl, deleteControl, upsertPanel, deletePanel } =
    useProjectStore();
  const [grouping] = useState<GroupingState>(["panel"]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [editingControlId, setEditingControlId] = useState<string | null>(null);
  const [addingToPanelId, setAddingToPanelId] = useState<string | null>(null);
  const [renamingPanelId, setRenamingPanelId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // All hooks must run unconditionally (Rules of Hooks). When there's no
  // project the table is built over an empty row set, then we bail out below.
  const rows: ControlRow[] = useMemo(
    () =>
      project
        ? project.controls.map((control) => ({
            control,
            panel: project.panels.find((p) => p.id === control.panelId),
            board: project.boards.find((b) => b.id === control.boardId),
          }))
        : [],
    [project],
  );

  const meta: ControlsTableMeta = {
    onEdit: (controlId) => {
      setAddingToPanelId(null);
      setEditingControlId(controlId);
    },
    onDelete: (control) => {
      if (window.confirm(`Delete control "${control.label}"?`)) {
        deleteControl(control.id);
      }
    },
  };

  const table = useReactTable({
    data: rows,
    columns,
    state: { grouping, expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    autoResetExpanded: false,
    meta,
  });

  if (!project) {
    return <EmptyState />;
  }

  const errorCount = validationReport?.errors.length ?? 0;
  const warnCount = validationReport?.warnings.length ?? 0;

  const addPanel = () => {
    const order = project.panels.length === 0 ? 0 : Math.max(...project.panels.map((p) => p.order)) + 1;
    const panel: Panel = { id: crypto.randomUUID(), name: "Untitled Panel", order };
    upsertPanel(panel);
  };

  const startRenamingPanel = (panel: Panel) => {
    setRenamingPanelId(panel.id);
    setRenameDraft(panel.name);
  };

  const commitRenamePanel = (panel: Panel) => {
    if (renameDraft.trim()) upsertPanel({ ...panel, name: renameDraft.trim() });
    setRenamingPanelId(null);
  };

  const deletePanelWithConfirm = (panel: Panel) => {
    const count = project.controls.filter((c) => c.panelId === panel.id).length;
    const message =
      count > 0
        ? `Delete panel "${panel.name}"? This will also delete ${count} control${count === 1 ? "" : "s"}.`
        : `Delete panel "${panel.name}"?`;
    if (window.confirm(message)) deletePanel(panel.id);
  };

  const handleSaveControl = (control: Control) => {
    upsertControl(control);
    setEditingControlId(null);
    setAddingToPanelId(null);
  };

  // Build the table body as a flat list of <tr>s, interleaving the edit form
  // (for the row currently being edited) and the "add control" row (at the
  // end of the panel group currently adding one) alongside the grouped rows
  // TanStack Table already produces. This state (editingControlId /
  // addingToPanelId) is intentionally separate from the table's own
  // `expanded` state above.
  const bodyRows: ReactNode[] = [];
  for (const row of table.getRowModel().rows) {
    if (row.getIsGrouped()) {
      const panel = project.panels.find((p) => p.name === String(row.getValue("panel")));
      const panelName = String(row.getValue("panel"));
      const childCount = row.subRows.length;
      bodyRows.push(
        <tr
          key={row.id}
          className="bg-[#1c2333] border-y border-[#30363d] cursor-pointer hover:bg-[#21262d]"
          onClick={() => row.toggleExpanded()}
        >
          <td colSpan={columns.length} className="px-3 py-2">
            <span className="text-xs mr-2 text-[#484f58]">{row.getIsExpanded() ? "▼" : "▶"}</span>
            <span className="font-semibold text-[#e6edf3]">{panelName}</span>
            <span className="ml-2 text-xs text-[#484f58]">
              {childCount} control{childCount !== 1 ? "s" : ""}
            </span>
          </td>
        </tr>,
      );
      if (row.getIsExpanded() && panel) {
        bodyRows.push(
          <tr key={`${row.id}-add`} className="bg-[#0d1117]">
            <td colSpan={columns.length} className="px-3 py-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingControlId(null);
                  setAddingToPanelId(panel.id);
                }}
                className="text-xs text-[#58a6ff] hover:underline"
              >
                + Add control to this panel
              </button>
            </td>
          </tr>,
        );
        if (addingToPanelId === panel.id) {
          bodyRows.push(
            <tr key={`${row.id}-form`}>
              <td colSpan={columns.length} className="px-3 py-2">
                <ControlForm
                  project={project}
                  panelId={panel.id}
                  initial={null}
                  onSave={handleSaveControl}
                  onCancel={() => setAddingToPanelId(null)}
                />
              </td>
            </tr>,
          );
        }
      }
      continue;
    }

    bodyRows.push(
      <tr key={row.id} className="border-b border-[#21262d] hover:bg-[#161b22] transition-colors">
        {row.getVisibleCells().map((cell) => (
          <td key={cell.id} style={{ width: cell.column.getSize() }} className="px-3 py-2">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>,
    );
    if (editingControlId === row.original.control.id) {
      bodyRows.push(
        <tr key={`${row.id}-form`}>
          <td colSpan={columns.length} className="px-3 py-2">
            <ControlForm
              project={project}
              panelId={row.original.control.panelId}
              initial={row.original.control}
              onSave={handleSaveControl}
              onCancel={() => setEditingControlId(null)}
            />
          </td>
        </tr>,
      );
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#30363d] bg-[#161b22] shrink-0">
        <span className="text-sm font-medium">
          {project.controls.length} control{project.controls.length !== 1 ? "s" : ""}
        </span>
        {errorCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-[#3d1a1a] text-[#f85149]">
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
        {warnCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-[#2d2000] text-[#d29922]">
            {warnCount} warning{warnCount !== 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto">
          <button
            type="button"
            onClick={addPanel}
            className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
          >
            + Add Panel
          </button>
        </div>
      </div>

      {/* Panels strip — always shows every panel, even ones with no controls yet */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#30363d] bg-[#0d1117] shrink-0 flex-wrap">
        {project.panels.map((panel) => (
          <div
            key={panel.id}
            className="flex items-center gap-1.5 text-xs bg-[#161b22] border border-[#30363d] rounded px-2 py-1"
          >
            {renamingPanelId === panel.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => commitRenamePanel(panel)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRenamePanel(panel);
                  if (e.key === "Escape") setRenamingPanelId(null);
                }}
                className="bg-[#0d1117] border border-[#30363d] rounded px-1 text-xs w-28"
              />
            ) : (
              <span className="cursor-pointer" onClick={() => startRenamingPanel(panel)}>
                {panel.name}
              </span>
            )}
            <button
              type="button"
              onClick={() => deletePanelWithConfirm(panel)}
              aria-label={`Delete panel ${panel.name}`}
              className="text-[#f85149]"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#161b22] border-b border-[#30363d]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="px-3 py-2 text-left text-xs font-semibold text-[#8b949e] uppercase tracking-wider whitespace-nowrap"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>{bodyRows}</tbody>
        </table>

        {project.controls.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-[#484f58]">
            <p className="text-lg mb-2">No controls yet.</p>
            <p className="text-sm">Use "+ Add Panel" above, then expand it to add a control.</p>
          </div>
        )}
      </div>

      {/* Validation summary */}
      {validationReport && (errorCount > 0 || warnCount > 0) && (
        <div className="border-t border-[#30363d] bg-[#161b22] px-4 py-2 shrink-0 max-h-32 overflow-y-auto">
          {validationReport.errors.map((e, i) => (
            <div key={i} className="text-xs text-[#f85149] py-0.5">
              ✕ {formatError(e)}
            </div>
          ))}
          {validationReport.warnings.map((w, i) => (
            <div key={i} className="text-xs text-[#d29922] py-0.5">
              ⚠ {formatWarning(w)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const { newProject, openProject } = useProjectStore();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[#8b949e]">
      <div className="text-5xl mb-2">🎛</div>
      <p className="text-xl font-semibold text-[#e6edf3]">Sim Panel Manager</p>
      <p className="text-sm">Create or open a project to get started.</p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={() => newProject("New Project")}
          className="px-4 py-2 rounded bg-[#1f6feb] hover:bg-[#388bfd] text-white text-sm font-medium transition-colors"
        >
          New Project
        </button>
        <button
          onClick={() => openProject()}
          className="px-4 py-2 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm transition-colors"
        >
          Open .spm File
        </button>
      </div>
    </div>
  );
}

function formatError(e: { kind: string; [k: string]: unknown }): string {
  switch (e.kind) {
    case "PinDoubleBooked":
      return `Pin ${e.pin} on board ${e.boardId} is used by multiple controls`;
    case "MissingBoardRef":
      return `Control ${e.controlId} references unknown board ${e.boardId}`;
    case "MissingPanelRef":
      return `Control ${e.controlId} references unknown panel ${e.panelId}`;
    case "AnalogPinNotCapable":
      return `Control ${e.controlId}: pin ${e.pin} is not analog-capable`;
    case "SelectorNoPins":
      return `Selector ${e.controlId}, position "${e.positionLabel}": no pins configured`;
    default:
      return JSON.stringify(e);
  }
}

function formatWarning(w: { kind: string; [k: string]: unknown }): string {
  switch (w.kind) {
    case "SerialPinUsed":
      return `Control ${w.controlId} uses Serial pin ${w.pin} — may conflict with USB`;
    case "EncoderOnNonInterruptPin":
      return `Encoder ${w.controlId}: pin ${w.pin} is not interrupt-capable (falling back to polling)`;
    case "ControlUnassigned":
      return `Control ${w.controlId} has no board/pin assigned yet`;
    default:
      return JSON.stringify(w);
  }
}
