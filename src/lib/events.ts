import type { BuildLogEvent, BuildStatusEvent } from "@/types";

type BuildListeners = {
  onLog: (e: BuildLogEvent) => void;
  onStatus: (e: BuildStatusEvent) => void;
};

type ServerEvent =
  | { event: "build://log"; payload: BuildLogEvent }
  | { event: "build://status"; payload: BuildStatusEvent };

/// Connect to the backend's build-event WebSocket and dispatch frames to the
/// given listeners. Returns an unlisten function that closes the socket.
/// Reconnects automatically if the connection drops while the app is open.
export async function setupBuildListeners(
  listeners: BuildListeners,
): Promise<() => void> {
  let closed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const wsUrl = () => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/api/events`;
  };

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(wsUrl());

    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string) as ServerEvent;
        if (data.event === "build://log") listeners.onLog(data.payload);
        else if (data.event === "build://status") listeners.onStatus(data.payload);
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, 1000);
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
  };
}
