import { useState } from "react";
import { useProjectStore } from "@/store";
import type { Board, BoardType } from "@/types";
import PinMapDisplay from "./boards/PinMapDisplay";

export const BOARD_TYPES: { value: BoardType; label: string }[] = [
  { value: "leonardo", label: "Leonardo" },
  { value: "micro", label: "Micro" },
  { value: "pro_micro", label: "Pro Micro" },
];

export default function BoardsView() {
  const { project, pinMaps, upsertBoard, deleteBoard, allocateIdentity, refreshPinMap } =
    useProjectStore();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-[#484f58]">
        No project open
      </div>
    );
  }

  const selectedBoard = project.boards.find((b) => b.id === selectedBoardId);
  const pinMap = selectedBoardId ? pinMaps[selectedBoardId] : null;

  const addBoard = async () => {
    const id = crypto.randomUUID();
    const name = `Board ${project.boards.length + 1}`;
    const board: Board = {
      id,
      name,
      type: "leonardo",
      identity: { usbProduct: name, usbVid: 0x1209, usbPid: 1 },
    };
    await upsertBoard(board);
    await allocateIdentity(id);
    setSelectedBoardId(id);
    await refreshPinMap(id);
  };

  const startRenaming = (board: Board) => {
    setRenamingBoardId(board.id);
    setRenameDraft(board.name);
  };

  const commitRename = (board: Board) => {
    if (renameDraft.trim()) upsertBoard({ ...board, name: renameDraft.trim() });
    setRenamingBoardId(null);
  };

  const deleteWithConfirm = (board: Board) => {
    const count = project.controls.filter((c) => c.boardId === board.id).length;
    const message =
      count > 0
        ? `Delete board "${board.name}"? ${count} control${count === 1 ? "" : "s"} will become unassigned (their pin assignments will be cleared).`
        : `Delete board "${board.name}"?`;
    if (window.confirm(message)) {
      deleteBoard(board.id);
      if (selectedBoardId === board.id) setSelectedBoardId(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Board list */}
      <aside className="w-72 border-r border-[#30363d] bg-[#161b22] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <span className="text-sm font-semibold">Boards</span>
          <span className="text-xs text-[#484f58]">{project.boards.length} total</span>
        </div>
        <div className="px-4 py-2 border-b border-[#30363d]">
          <button
            type="button"
            onClick={addBoard}
            className="w-full text-xs px-2 py-1.5 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
          >
            + Add Board
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {project.boards.length === 0 ? (
            <div className="px-4 py-8 text-center text-[#484f58] text-sm">
              No boards in project
            </div>
          ) : (
            project.boards.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                selected={board.id === selectedBoardId}
                renaming={renamingBoardId === board.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onSelect={() => {
                  setSelectedBoardId(board.id);
                  refreshPinMap(board.id);
                }}
                onStartRename={() => startRenaming(board)}
                onCommitRename={() => commitRename(board)}
                onCancelRename={() => setRenamingBoardId(null)}
                onDelete={() => deleteWithConfirm(board)}
                onAllocateIdentity={() => allocateIdentity(board.id)}
                boardTypeLabel={BOARD_TYPES.find((t) => t.value === board.type)?.label ?? board.type}
              />
            ))
          )}
        </div>
      </aside>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedBoard && pinMap ? (
          <PinMapDisplay board={selectedBoard} pinMap={pinMap} />
        ) : selectedBoard ? (
          <div className="text-[#484f58] text-sm">Loading pin map…</div>
        ) : (
          <div className="flex items-center justify-center h-full text-[#484f58]">
            Select a board to view its pin map
          </div>
        )}
      </div>
    </div>
  );
}

function BoardCard({
  board,
  selected,
  renaming,
  renameDraft,
  onRenameDraftChange,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onAllocateIdentity,
  boardTypeLabel,
}: {
  board: Board;
  selected: boolean;
  renaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onAllocateIdentity: () => void;
  boardTypeLabel: string;
}) {
  return (
    <div
      onClick={onSelect}
      className={`px-4 py-3 cursor-pointer border-b border-[#21262d] transition-colors ${
        selected ? "bg-[#1c2333] border-l-2 border-l-[#58a6ff]" : "hover:bg-[#1c2333]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={renameDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              className="text-sm font-medium bg-[#0d1117] border border-[#30363d] rounded px-1 w-full"
            />
          ) : (
            <div
              className="text-sm font-medium truncate"
              onClick={onStartRename}
            >
              {board.name}
            </div>
          )}
          <div className="text-xs text-[#8b949e] mt-0.5">{boardTypeLabel}</div>
          <div className="text-xs text-[#58a6ff] font-mono mt-1">
            {board.identity.usbProduct}
          </div>
          <div className="text-xs text-[#484f58] font-mono">
            VID:{board.identity.usbVid.toString(16).toUpperCase().padStart(4, "0")}{" "}
            PID:{board.identity.usbPid.toString(16).toUpperCase().padStart(4, "0")}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete board ${board.name}`}
          className="text-[#f85149] text-xs shrink-0"
        >
          ✕
        </button>
      </div>
      {board.identity.usbPid <= 0x000f && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAllocateIdentity();
          }}
          className="mt-2 text-xs px-2 py-1 rounded bg-[#1f3a5f] text-[#79c0ff] hover:bg-[#1f6feb] transition-colors"
          title="Allocate a permanent USB PID for this board"
        >
          Allocate Identity
        </button>
      )}
    </div>
  );
}
