import { useEffect, useState } from "react";
import { setupBuildListeners } from "@/lib/events";
import { useProjectStore } from "@/store";
import Layout from "@/components/Layout";
import ControlsView from "@/views/ControlsView";
import BoardsView from "@/views/BoardsView";
import BuildView from "@/views/BuildView";
import TestView from "@/views/TestView";

export type Tab = "controls" | "boards" | "build" | "test";

declare const __APP_VERSION__: string;

const RELEASES_API =
  "https://api.github.com/repos/myclark/simpanman/releases/latest";

type UpdateInfo = { version: string; url: string };

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("controls");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const { appendBuildLog, setBuildStatus } = useProjectStore();

  useEffect(() => {
    const unsub = setupBuildListeners({
      onLog: appendBuildLog,
      onStatus: setBuildStatus,
    });

    checkForUpdates().then(setUpdate);

    return () => {
      unsub.then((fn) => fn());
    };
  }, [appendBuildLog, setBuildStatus]);

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {update && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#1f6feb] text-white text-sm">
          <span>
            Version {update.version} is available.
          </span>
          <a
            href={update.url}
            target="_blank"
            rel="noreferrer"
            className="underline font-medium"
          >
            Download
          </a>
          <button
            onClick={() => setUpdate(null)}
            className="ml-auto text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {activeTab === "controls" && <ControlsView />}
      {activeTab === "boards" && <BoardsView />}
      {activeTab === "build" && <BuildView />}
      {activeTab === "test" && <TestView />}
    </Layout>
  );
}

/// Check GitHub for a newer release. Non-blocking: any failure (offline,
/// rate-limited) simply yields no banner, mirroring the old updater behavior.
async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    if (latest && isNewer(latest, __APP_VERSION__)) {
      return { version: latest, url: data.html_url ?? RELEASES_API };
    }
    return null;
  } catch {
    return null;
  }
}

/// Loose numeric version compare: is `a` newer than `b`?
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  return false;
}
