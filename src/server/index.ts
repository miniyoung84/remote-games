import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Action, ClientMessage, Role, ServerMessage } from "../shared/protocol.js";
import type { AppState } from "../shared/types.js";
import { projectDisplay, projectHost } from "./project.js";
import { reduce } from "./reducer.js";
import { loadState, saveState } from "./store.js";

const clients = new Map<WebSocket, Role>();
let state: AppState = loadState();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function pushTo(socket: WebSocket, role: Role): void {
  send(
    socket,
    role === "display"
      ? { type: "state", role: "display", state: projectDisplay(state) }
      : { type: "state", role: "host", state: projectHost(state) },
  );
}

function broadcast(): void {
  for (const [socket, role] of clients) pushTo(socket, role);
}

function handle(socket: WebSocket, action: Action): void {
  const before = state;
  const result = reduce(state, action);

  if (result.error) send(socket, { type: "error", message: result.error });
  if (result.notice) send(socket, { type: "notice", message: result.notice });
  if (result.state !== before) {
    state = result.state;
    saveState(state);
  }
  // Set edits touch disk without changing AppState, so they still need a push.
  if (result.state !== before || result.setsChanged) broadcast();
}

const WS_PATH = "/ws";

/** Vite re-runs configureServer on restart; don't stack duplicate listeners. */
const attached = new WeakSet<Server>();

export function attachGameServer(server: Server): void {
  if (attached.has(server)) return;
  attached.add(server);

  // `noServer` plus our own upgrade listener, NOT `new WebSocketServer({ server,
  // path })`. Given a `server`, ws claims every upgrade request and aborts the
  // ones whose path doesn't match — which kills Vite's HMR socket, and Vite's
  // client then reloads the page over and over trying to recover.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      return;
    }
    if (pathname !== WS_PATH) {
      // Someone else's socket (Vite HMR in dev). Only destroy it if we are the
      // sole upgrade listener, in which case nothing else will ever serve it.
      if (server.listenerCount("upgrade") <= 1) socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  wss.on("connection", (socket, request) => {
    const role: Role = new URL(request.url ?? "/", "http://localhost").searchParams.get("role") === "host"
      ? "host"
      : "display";
    clients.set(socket, role);
    pushTo(socket, role);

    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return send(socket, { type: "error", message: "Malformed message." });
      }
      // The display is a projection, never an input surface.
      if (role !== "host") return send(socket, { type: "error", message: "Read-only connection." });
      if (message.type === "action") handle(socket, message.action);
    });

    socket.on("close", () => clients.delete(socket));
  });

  console.log(`[server] game server attached at ${WS_PATH}`);
}
