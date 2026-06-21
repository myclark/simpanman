import type { ReactNode } from "react";
import type { Tab } from "@/App";
import TitleBar from "./TitleBar";
import TabBar from "./TabBar";
import ErrorAlert from "./ErrorAlert";

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: ReactNode;
}

export default function Layout({ activeTab, onTabChange, children }: Props) {
  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-[#e6edf3] select-none">
      <TitleBar />
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />
      <ErrorAlert />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
