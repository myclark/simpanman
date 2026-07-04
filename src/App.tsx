import { useEffect, useState } from "react";
import { setupCompileListeners, setupFlashListeners } from "@/lib/events";
import { useProjectStore } from "@/store";
import Layout from "@/components/Layout";
import ControlsView from "@/views/ControlsView";
import BoardsView from "@/views/BoardsView";
import BuildView from "@/views/BuildView";
import TestView from "@/views/TestView";
import type { UpdateStatus } from "@/types";

export type Tab = "controls" | "boards" | "build" | "test";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("controls");
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const { appendCompileLog, setCompileStatus, appendFlashLog, setFlashStatus } =
    useProjectStore();

  useEffect(() => {
    const unsubCompile = setupCompileListeners({
      onLog: appendCompileLog,
      onStatus: setCompileStatus,
    });
    const unsubFlash = setupFlashListeners({
      onLog: appendFlashLog,
      onStatus: setFlashStatus,
    });

    // electron-updater drives this now (download happens in the background);
    // the banner only appears once an update is available/downloaded.
    const offUpdate = window.api.onUpdateStatus(setUpdate);

    return () => {
      unsubCompile();
      unsubFlash();
      offUpdate();
    };
  }, [appendCompileLog, setCompileStatus, appendFlashLog, setFlashStatus]);

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <UpdateBanner status={update} onDismiss={() => setUpdate(null)} />
      {activeTab === "controls" && <ControlsView />}
      {activeTab === "boards" && <BoardsView />}
      {activeTab === "build" && <BuildView />}
      {activeTab === "test" && <TestView />}
    </Layout>
  );
}

/// Auto-update banner. Shows download progress and, once staged, a button to
/// restart into the new version (electron-updater installs on quit).
function UpdateBanner({
  status,
  onDismiss,
}: {
  status: UpdateStatus | null;
  onDismiss: () => void;
}) {
  if (!status || status.state === "error") return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[#1f6feb] text-white text-sm">
      {status.state === "available" && (
        <span>Version {status.version} is available — downloading…</span>
      )}
      {status.state === "downloading" && (
        <span>Downloading update… {status.percent}%</span>
      )}
      {status.state === "downloaded" && (
        <>
          <span>Version {status.version} is ready to install.</span>
          <button
            onClick={() => window.api.installUpdate()}
            className="underline font-medium"
          >
            Restart to update
          </button>
        </>
      )}
      <button
        onClick={onDismiss}
        className="ml-auto text-white/80 hover:text-white"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
