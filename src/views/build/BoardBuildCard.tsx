import { useState } from "react";
import { useProjectStore } from "@/store";
import { BOARD_TYPES } from "@/views/BoardsView";
import { formatError, formatWarning } from "@/views/ControlsView";
import type { Board, BuildLogLine } from "@/types";
import { LogPane, StatusBadge } from "./shared";

export default function BoardBuildCard({ board }: { board: Board }) {
  const { project, validationReport, pio, boardBuild, generateFirmware, exportArduinoSketch, exportPlatformioProject, compileBoard } =
    useProjectStore();

  const build = boardBuild[board.id] ?? {
    compileStatus: "idle" as const,
    compileLogs: [] as BuildLogLine[],
    compiledAtVersion: null as number | null,
    flashStatus: "idle" as const,
    flashLogs: [] as BuildLogLine[],
  };

  const relevantErrors = (validationReport?.errors ?? []).filter((e) => {
    if (e.boardId === board.id) return true;
    if (e.controlId) {
      return project?.controls.find((c) => c.id === e.controlId)?.boardId === board.id;
    }
    return false;
  });
  const relevantWarnings = (validationReport?.warnings ?? []).filter((w) => {
    if (!w.controlId) return false;
    return project?.controls.find((c) => c.id === w.controlId)?.boardId === board.id;
  });

  const buildVariant = board.type === "pro_micro" ? "sparkfun_promicro" : board.type;
  const envName = board.id.replace(/-/g, "_");
  const typeLabel = BOARD_TYPES.find((t) => t.value === board.type)?.label ?? board.type;

  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [arduinoExportPath, setArduinoExportPath] = useState<string | null>(null);
  const [pioExportPath, setPioExportPath] = useState<string | null>(null);

  async function handleCopy() {
    const generated = await generateFirmware(board.id);
    const mainCpp = generated?.files.find((f) => f.relativePath === "src/main.cpp");
    if (!mainCpp) return;
    await navigator.clipboard.writeText(mainCpp.content);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 1500);
  }

  async function handleExportArduino() {
    const result = await exportArduinoSketch(board.id);
    if (result) setArduinoExportPath(result.path);
  }

  async function handleExportPlatformio() {
    const result = await exportPlatformioProject(board.id);
    if (result) setPioExportPath(result.path);
  }

  return (
    <div className="border border-[#30363d] rounded-lg overflow-hidden">
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
      </div>

      {/* Stage 1: Generate & Export */}
      <div className="px-4 py-3 space-y-2">
        <div className="text-xs font-semibold text-[#8b949e]">Generate & Export</div>
        {relevantErrors.length > 0 ? (
          <div className="text-xs text-[#f85149] space-y-0.5">
            {relevantErrors.map((e, i) => (
              <div key={i}>✕ {formatError(e)}</div>
            ))}
            <div className="text-[#8b949e]">Resolve these in the Controls tab before generating.</div>
          </div>
        ) : (
          <>
            {relevantWarnings.length > 0 && (
              <div className="text-xs text-[#d29922] space-y-0.5">
                {relevantWarnings.map((w, i) => (
                  <div key={i}>⚠ {formatWarning(w)}</div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopy}
                className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
              >
                {copyState === "copied" ? "Copied!" : "Copy firmware to clipboard"}
              </button>
              <button
                onClick={handleExportArduino}
                className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
              >
                Export as Arduino sketch…
              </button>
              {arduinoExportPath && (
                <span className="text-xs text-[#3fb950]">Exported to {arduinoExportPath}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Stage 2: Build */}
      <div className="border-t border-[#30363d]">
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22]">
          <span className="text-xs font-semibold text-[#8b949e]">Build</span>
          <StatusBadge status={build.compileStatus} activeLabel="Compiling…" />
        </div>
        {!pio.available ? (
          <div className="px-4 py-3 text-xs text-[#484f58]">
            Requires PlatformIO — see the banner above.
          </div>
        ) : (
          <>
            <div className="px-4 py-2 text-xs text-[#8b949e]">
              Board type: {typeLabel} · Build variant: {buildVariant} · Env: {envName}
            </div>
            <div className="flex items-center gap-2 px-4 py-2">
              <button
                onClick={() => compileBoard(board.id)}
                disabled={build.compileStatus === "compiling"}
                className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                  build.compileStatus === "compiling"
                    ? "bg-[#21262d] text-[#484f58] cursor-not-allowed"
                    : "bg-[#1f6feb] hover:bg-[#388bfd] text-white"
                }`}
              >
                {build.compileStatus === "compiling" ? "Compiling…" : "Compile"}
              </button>
              <button
                onClick={handleExportPlatformio}
                className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
              >
                Export PlatformIO Project…
              </button>
              {pioExportPath && (
                <span className="text-xs text-[#3fb950]">Exported to {pioExportPath}</span>
              )}
            </div>
            {build.compileStatus === "error" && (
              <div className="px-4 py-3 bg-[#161b22] border-t border-[#30363d] space-y-2 text-xs">
                <div className="text-[#f85149]">
                  This wasn't caused by your panel design — it's likely an environment/toolchain
                  issue, or a bug in Sim Panel Manager's code generator.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(build.compileLogs.map((l) => l.line).join("\n"))
                    }
                    className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]"
                  >
                    Copy log
                  </button>
                  <a
                    href={issueUrl(board.name, build.compileLogs)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-[#58a6ff]"
                  >
                    File an issue
                  </a>
                </div>
              </div>
            )}
            {build.compileLogs.length > 0 && <LogPane logs={build.compileLogs} />}
          </>
        )}
      </div>
    </div>
  );
}

function issueUrl(boardName: string, logs: BuildLogLine[]): string {
  const tail = logs
    .slice(-60)
    .map((l) => l.line)
    .join("\n");
  const title = encodeURIComponent(`Build failed for board "${boardName}"`);
  const body = encodeURIComponent(
    `Compiling the generated firmware for "${boardName}" failed. This looks like an environment/toolchain issue or a bug in Sim Panel Manager's code generator, not a problem with the panel design.\n\n\`\`\`\n${tail}\n\`\`\`\n`,
  );
  return `https://github.com/myclark/simpanman/issues/new?title=${title}&body=${body}`;
}
