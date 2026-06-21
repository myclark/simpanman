import type { Tab } from "@/App";

const TABS: { id: Tab; label: string }[] = [
  { id: "controls", label: "Controls" },
  { id: "boards", label: "Boards" },
  { id: "build", label: "Build & Upload" },
  { id: "test", label: "Test" },
];

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export default function TabBar({ activeTab, onTabChange }: Props) {
  return (
    <nav className="flex border-b border-[#30363d] bg-[#161b22] shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-5 py-2.5 text-sm border-b-2 transition-colors ${
            activeTab === tab.id
              ? "border-[#58a6ff] text-[#58a6ff]"
              : "border-transparent text-[#8b949e] hover:text-[#e6edf3] hover:border-[#30363d]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
