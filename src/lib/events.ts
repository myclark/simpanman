import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BuildLogEvent, BuildStatusEvent } from "@/types";

type BuildListeners = {
  onLog: (e: BuildLogEvent) => void;
  onStatus: (e: BuildStatusEvent) => void;
};

export async function setupBuildListeners(
  listeners: BuildListeners,
): Promise<UnlistenFn> {
  const unlistenLog = await listen<BuildLogEvent>("build://log", (event) => {
    listeners.onLog(event.payload);
  });

  const unlistenStatus = await listen<BuildStatusEvent>(
    "build://status",
    (event) => {
      listeners.onStatus(event.payload);
    },
  );

  return () => {
    unlistenLog();
    unlistenStatus();
  };
}
