import { useProjectStore } from "@/store";

export default function ErrorAlert() {
  const { error, clearError } = useProjectStore();
  if (!error) return null;

  return (
    <div className="mx-4 mt-2 px-4 py-2 bg-[#3d1a1a] border border-[#f85149] rounded text-sm text-[#f85149] flex items-start gap-2">
      <span className="shrink-0 mt-0.5">⚠</span>
      <span className="flex-1 break-words">{error}</span>
      <button
        onClick={clearError}
        className="shrink-0 text-[#8b949e] hover:text-[#e6edf3] ml-2"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
