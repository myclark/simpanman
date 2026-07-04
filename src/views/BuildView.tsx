import { useEffect } from "react";
import { useProjectStore } from "@/store";
import type { PioStatus } from "@/types";
import BoardBuildCard from "./build/BoardBuildCard";

export default function BuildView() {
  const { project, pio, listPorts, detectPio } = useProjectStore();

  useEffect(() => {
    listPorts();
    detectPio();
  }, [listPorts, detectPio]);

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

      <PioBanner pio={pio} onRecheck={() => detectPio()} />

      {project.boards.length === 0 && (
        <div className="text-[#484f58] text-sm text-center py-8">
          No boards in project. Add boards in the Boards tab.
        </div>
      )}

      {project.boards.map((board) => (
        <BoardBuildCard key={board.id} board={board} />
      ))}
    </div>
  );
}

function PioBanner({ pio, onRecheck }: { pio: PioStatus; onRecheck: () => void }) {
  if (!pio.checked) {
    return (
      <div className="text-xs text-[#8b949e] px-3 py-2 rounded border border-[#30363d] bg-[#161b22]">
        Checking for PlatformIO…
      </div>
    );
  }

  if (pio.available) {
    return (
      <div className="text-xs text-[#3fb950] px-3 py-2 rounded border border-[#30363d] bg-[#161b22]">
        PlatformIO {pio.version ?? ""} detected.
      </div>
    );
  }

  return (
    <div className="text-xs px-3 py-2 rounded border border-[#3d1a1a] bg-[#161b22] space-y-1">
      <div className="text-[#f85149] font-medium">
        PlatformIO not found — Build and Program are unavailable until it's installed.
      </div>
      <div className="text-[#8b949e]">
        Install it with <code className="text-[#e6edf3]">pip install platformio</code> (or{" "}
        <code className="text-[#e6edf3]">pipx install platformio</code>), then recheck. See{" "}
        <a
          href="https://platformio.org/install/cli"
          target="_blank"
          rel="noreferrer"
          className="text-[#58a6ff] underline"
        >
          platformio.org/install/cli
        </a>{" "}
        for details.
      </div>
      <button
        onClick={onRecheck}
        className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
      >
        Recheck
      </button>
    </div>
  );
}
