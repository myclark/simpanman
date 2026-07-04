import type { Board } from "@/types";

export default function BoardBuildCard({ board }: { board: Board }) {
  return (
    <div className="border border-[#30363d] rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-[#161b22] text-sm font-semibold">{board.name}</div>
    </div>
  );
}
