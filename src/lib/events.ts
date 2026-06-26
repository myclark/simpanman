import type { BuildLogEvent, BuildStatusEvent } from "@/types";

type BuildListeners = {
  onLog: (e: BuildLogEvent) => void;
  onStatus: (e: BuildStatusEvent) => void;
};

/// Subscribe to the main process's build log/status stream over the preload
/// bridge. Returns an unlisten function that removes both subscriptions.
/// Async to preserve the previous (WebSocket-era) call contract.
export async function setupBuildListeners(
  listeners: BuildListeners,
): Promise<() => void> {
  const offLog = window.api.onBuildLog(listeners.onLog);
  const offStatus = window.api.onBuildStatus(listeners.onStatus);
  return () => {
    offLog();
    offStatus();
  };
}
