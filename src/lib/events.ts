import type { BuildLogEvent, BuildStatusEvent } from "@/types";

type StageListeners = {
  onLog: (e: BuildLogEvent) => void;
  onStatus: (e: BuildStatusEvent) => void;
};

/// Subscribe to the main process's compile log/status stream over the preload
/// bridge. Returns an unlisten function that removes both subscriptions.
export function setupCompileListeners(listeners: StageListeners): () => void {
  const offLog = window.api.onCompileLog(listeners.onLog);
  const offStatus = window.api.onCompileStatus(listeners.onStatus);
  return () => {
    offLog();
    offStatus();
  };
}

/// Subscribe to the main process's flash log/status stream over the preload
/// bridge. Returns an unlisten function that removes both subscriptions.
export function setupFlashListeners(listeners: StageListeners): () => void {
  const offLog = window.api.onFlashLog(listeners.onLog);
  const offStatus = window.api.onFlashStatus(listeners.onStatus);
  return () => {
    offLog();
    offStatus();
  };
}
