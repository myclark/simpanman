import { useProjectStore } from "@/store";

export default function TitleBar() {
  const { project, isDirty, newProject, openProject, saveProject } =
    useProjectStore();

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-[#161b22] border-b border-[#30363d] shrink-0">
      <span className="text-sm font-semibold text-[#e6edf3] tracking-wide">
        Sim Panel Manager
      </span>

      <span className="text-[#30363d]">|</span>

      {project ? (
        <span className="text-sm text-[#8b949e] flex items-center gap-1">
          {project.name}
          {isDirty && (
            <span
              className="w-2 h-2 rounded-full bg-[#d29922] inline-block"
              title="Unsaved changes"
            />
          )}
        </span>
      ) : (
        <span className="text-sm text-[#484f58] italic">No project open</span>
      )}

      <div className="ml-auto flex gap-2">
        <button
          onClick={() => newProject("New Project")}
          className="px-3 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
        >
          New
        </button>
        <button
          onClick={() => openProject()}
          className="px-3 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
        >
          Open
        </button>
        {project && (
          <>
            <button
              onClick={() => saveProject()}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                isDirty
                  ? "bg-[#1f6feb] hover:bg-[#388bfd] border-[#388bfd] text-white"
                  : "bg-[#21262d] hover:bg-[#30363d] border-[#30363d]"
              }`}
            >
              Save
            </button>
            <button
              onClick={() => saveProject(true)}
              className="px-3 py-1 text-xs rounded bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] transition-colors"
            >
              Save As…
            </button>
          </>
        )}
      </div>
    </header>
  );
}
