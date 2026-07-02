import type { Board, PinMap } from "@/types";

interface Props {
  board: Board;
  pinMap: PinMap;
}

export default function PinMapDisplay({ board, pinMap }: Props) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold mb-1">{board.name}</h2>
      <div className="text-sm text-[#8b949e] mb-4 font-mono">
        {board.identity.usbProduct} — VID 0x
        {board.identity.usbVid.toString(16).toUpperCase().padStart(4, "0")} / PID 0x
        {board.identity.usbPid.toString(16).toUpperCase().padStart(4, "0")}
      </div>

      {pinMap.warnings.length > 0 && (
        <div className="mb-4 space-y-1">
          {pinMap.warnings.map((w, i) => (
            <div
              key={i}
              className="text-xs text-[#d29922] bg-[#2d2000] border border-[#d29922]/30 rounded px-3 py-1.5"
            >
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Used pins */}
        <div>
          <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
            Used Pins ({pinMap.used.length})
          </h3>
          {pinMap.used.length === 0 ? (
            <p className="text-xs text-[#484f58]">No pins assigned</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#30363d]">
                  <th className="py-1 text-left text-xs text-[#484f58] font-normal w-16">Pin</th>
                  <th className="py-1 text-left text-xs text-[#484f58] font-normal">Control</th>
                  <th className="py-1 text-left text-xs text-[#484f58] font-normal w-20">Kind</th>
                </tr>
              </thead>
              <tbody>
                {pinMap.used.map((up, i) => (
                  <tr key={i} className="border-b border-[#21262d]">
                    <td className="py-1.5 font-mono text-xs text-[#79c0ff]">{up.pin}</td>
                    <td className="py-1.5 text-xs">{up.controlLabel}</td>
                    <td className="py-1.5 text-xs text-[#8b949e]">{up.controlKind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Free pins */}
        <div>
          <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
            Free Pins ({pinMap.free.length})
          </h3>
          {pinMap.free.length === 0 ? (
            <p className="text-xs text-[#484f58]">All pins are assigned</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {pinMap.free.map(({ pin, interruptCapable }) => (
                <span
                  key={pin}
                  title={interruptCapable ? "Interrupt-capable" : undefined}
                  className="font-mono text-xs px-2 py-0.5 rounded bg-[#1e3a2e] text-[#3fb950]"
                >
                  {pin}
                  {interruptCapable ? " ⚡" : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
