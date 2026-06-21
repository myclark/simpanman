import { useState } from "react";
import { useProjectStore } from "@/store";
import type { Board } from "@/types";
import PinMapDisplay from "./boards/PinMapDisplay";

export default function BoardsView() {
  const { project, pinMaps, allocateIdentity, refreshPinMap } = useProjectStore();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-[#484f58]">
        No project open
      </div>
    );
  }

  const selectedBoard = project.boards.find((b) => b.id === selectedBoardId);
  const pinMap = selectedBoardId ? pinMaps[selectedBoardId] : null;

  return (
    <div className="flex h-full">
      {/* Board list */}
      <aside className="w-72 border-r border-[#30363d] bg-[#161b22] flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
          <span className="text-sm font-semibold">Boards</span>
          <span className="text-xs text-[#484f58]">{project.boards.length} total</span>
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
                onClick={() => {
                  setSelectedBoardId(board.id);
                  refreshPinMap(board.id);
                }}
                onAllocateIdentity={() => allocateIdentity(board.id)}
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
  onClick,
  onAllocateIdentity,
}: {
  board: Board;
  selected: boolean;
  onClick: () => void;
  onAllocateIdentity: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer border-b border-[#21262d] transition-colors ${
        selected ? "bg-[#1c2333] border-l-2 border-l-[#58a6ff]" : "hover:bg-[#1c2333]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{board.name}</div>
          <div className="text-xs text-[#8b949e] mt-0.5">{board.type}</div>
          <div className="text-xs text-[#58a6ff] font-mono mt-1">
            {board.identity.usbProduct}
          </div>
          <div className="text-xs text-[#484f58] font-mono">
            VID:{board.identity.usbVid.toString(16).toUpperCase().padStart(4, "0")}{" "}
            PID:{board.identity.usbPid.toString(16).toUpperCase().padStart(4, "0")}
          </div>
        </div>
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
