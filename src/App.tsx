import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { setupBuildListeners } from "@/lib/events";
import { useProjectStore } from "@/store";
import Layout from "@/components/Layout";
import ControlsView from "@/views/ControlsView";
import BoardsView from "@/views/BoardsView";
import BuildView from "@/views/BuildView";
import TestView from "@/views/TestView";

export type Tab = "controls" | "boards" | "build" | "test";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("controls");
  const { appendBuildLog, setBuildStatus } = useProjectStore();

  useEffect(() => {
    const unsub = setupBuildListeners({
      onLog: appendBuildLog,
      onStatus: setBuildStatus,
    });

    checkForUpdates();

    return () => {
      unsub.then((fn) => fn());
    };
  }, [appendBuildLog, setBuildStatus]);

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === "controls" && <ControlsView />}
      {activeTab === "boards" && <BoardsView />}
      {activeTab === "build" && <BuildView />}
      {activeTab === "test" && <TestView />}
    </Layout>
  );
}

async function checkForUpdates() {
  try {
    const update = await check();
    if (update?.available) {
      const yes = await ask(
        `Version ${update.version} is available.\n\n${update.body ?? ""}\n\nInstall now?`,
        { title: "Update Available", kind: "info" },
      );
      if (yes) {
        await update.downloadAndInstall();
      }
    }
  } catch (e) {
    // Non-blocking — network or config issues should not surface to the user on startup
    console.warn("Update check failed:", e);
  }
}
