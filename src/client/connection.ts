import type { Action, Role, ServerMessage } from "../shared/protocol.js";

type Handlers<S> = {
  onState: (state: S) => void;
  onError?: (message: string) => void;
  onStatus?: (connected: boolean) => void;
};

/**
 * Reconnecting websocket client. A dropped connection mid-meeting must recover
 * on its own — nobody is going to debug a socket while eleven people watch.
 * State is server-authoritative, so reconnecting simply re-receives the truth.
 */
export function connect<S>(role: Role, handlers: Handlers<S>): (action: Action) => void {
  let socket: WebSocket | null = null;
  let retry = 500;

  const open = () => {
    const url = new URL(`/ws?role=${role}`, location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      retry = 500;
      handlers.onStatus?.(true);
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      if (message.type === "state") handlers.onState(message.state as S);
      else if (message.type === "error") handlers.onError?.(message.message);
    });

    socket.addEventListener("close", () => {
      handlers.onStatus?.(false);
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 5000);
    });

    socket.addEventListener("error", () => socket?.close());
  };

  open();

  return (action: Action) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "action", action }));
    }
  };
}
