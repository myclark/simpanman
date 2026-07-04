import { useEffect, useRef } from "react";
import type { BuildLogLine } from "@/types";

export function LogPane({ logs }: { logs: BuildLogLine[] }) {
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

type Status = "idle" | "compiling" | "flashing" | "success" | "error";

const STATUS_STYLES: Record<"idle" | "active" | "success" | "error", string> = {
  idle: "bg-[#21262d] text-[#8b949e]",
  active: "bg-[#1f3a5f] text-[#58a6ff] animate-pulse",
  success: "bg-[#1e3a2e] text-[#3fb950]",
  error: "bg-[#3d1a1a] text-[#f85149]",
};

/** Status pill shared by the Build and Program stages. `activeLabel` is
 * "Compiling…" or "Flashing…" depending on which stage is rendering it. */
export function StatusBadge({ status, activeLabel }: { status: Status; activeLabel: string }) {
  const kind: keyof typeof STATUS_STYLES =
    status === "idle" ? "idle" : status === "success" ? "success" : status === "error" ? "error" : "active";
  const label =
    kind === "active" ? activeLabel : kind === "idle" ? "Idle" : kind === "success" ? "Success" : "Failed";
  return <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[kind]}`}>{label}</span>;
}
