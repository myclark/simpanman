import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/store";
import type { BuildStatus } from "@/types";

export default function BuildView() {
  const { project, buildLogs, buildStatus, serialPorts, listPorts, buildBoard } =
    useProjectStore();
  const [selectedPorts, setSelectedPorts] = useState<Record<string, string>>({});

  useEffect(() => {
    listPorts();
  }, [listPorts]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-[#484f58]">
        No project open
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Build &amp; Upload</h2>
        <button
          onClick={() => listPorts()}
          className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
        >
          Refresh Ports
        </button>
      </div>

      {project.boards.length === 0 && (
        <div className="text-[#484f58] text-sm text-center py-8">
          No boards in project. Add boards in the Boards tab.
        </div>
      )}

      {project.boards.map((board) => {
        const status: BuildStatus = buildStatus[board.id] ?? "idle";
        const logs = buildLogs[board.id] ?? [];
        const selectedPort = selectedPorts[board.id] ?? "";

        return (
          <div
            key={board.id}
            className="border border-[#30363d] rounded-lg overflow-hidden"
          >
            {/* Board header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{board.name}</div>
                <div className="text-xs text-[#58a6ff] font-mono">
                  {board.identity.usbProduct} — VID 0x
                  {board.identity.usbVid.toString(16).toUpperCase().padStart(4, "0")} / PID 0x
                  {board.identity.usbPid.toString(16).toUpperCase().padStart(4, "0")}
                </div>
              </div>
              <StatusBadge status={status} />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 px-4 py-3 bg-[#1c2333]">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-xs text-[#8b949e] shrink-0">Port:</label>
                <select
                  value={selectedPort}
                  onChange={(e) =>
                    setSelectedPorts((s) => ({ ...s, [board.id]: e.target.value }))
                  }
                  className="flex-1 min-w-0 text-xs bg-[#21262d] border border-[#30363d] rounded px-2 py-1 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="">— Let PlatformIO detect —</option>
                  {serialPorts.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}{p.description ? ` (${p.description})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() =>
                  buildBoard(board.id, selectedPort || null)
                }
                disabled={status === "building"}
                className={`px-4 py-1.5 text-sm rounded font-medium transition-colors shrink-0 ${
                  status === "building"
                    ? "bg-[#21262d] text-[#484f58] cursor-not-allowed"
                    : "bg-[#1f6feb] hover:bg-[#388bfd] text-white"
                }`}
              >
                {status === "building" ? "Building…" : "Build & Upload"}
              </button>
            </div>

            {/* Log */}
            {logs.length > 0 && <LogPane logs={logs} />}
          </div>
        );
      })}
    </div>
  );
}

function LogPane({
  logs,
}: {
  logs: Array<{ line: string; isErr: boolean; timestamp: number }>;
}) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs.length]);

  return (
    <pre
      ref={ref}
      className="bg-[#0d1117] text-xs font-mono px-4 py-3 max-h-48 overflow-y-auto border-t border-[#30363d] whitespace-pre-wrap break-all leading-5"
    >
      {logs.map((l, i) => (
        <span key={i} className={l.isErr ? "text-[#f85149]" : "text-[#8b949e]"}>
          {l.line}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function StatusBadge({ status }: { status: BuildStatus }) {
  const styles: Record<BuildStatus, string> = {
    idle: "bg-[#21262d] text-[#8b949e]",
    building: "bg-[#1f3a5f] text-[#58a6ff] animate-pulse",
    success: "bg-[#1e3a2e] text-[#3fb950]",
    error: "bg-[#3d1a1a] text-[#f85149]",
  };
  const labels: Record<BuildStatus, string> = {
    idle: "Idle",
    building: "Building…",
    success: "Success",
    error: "Failed",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
