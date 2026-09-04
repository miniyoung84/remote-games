import type { Server } from "node:http";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { attachGameServer } from "./src/server/index.js";

/** Serve /display and /host without the .html suffix, in dev and preview alike. */
function prettyRoutes(): Plugin {
  const rewrite = (url: string | undefined): string | undefined => {
    const path = url?.split("?")[0];
    if (path === "/display" || path === "/host") return `${path}.html`;
    return undefined;
  };
  return {
    name: "remote-games:pretty-routes",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const next_ = rewrite(req.url);
        if (next_) req.url = next_;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const next_ = rewrite(req.url);
        if (next_) req.url = next_;
        next();
      });
    },
  };
}

/** Run the websocket game server inside Vite so `npm run dev` is the whole app. */
function gameServer(): Plugin {
  return {
    name: "remote-games:game-server",
    // Vite types httpServer as possibly HTTP/2; this app never enables it, so
    // the narrowing is safe.
    configureServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer as Server);
    },
    configurePreviewServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer as Server);
    },
  };
}

export default defineConfig({
  plugins: [prettyRoutes(), gameServer()],
  server: {
    // Localhost only: the app is never exposed, the screen is what gets shared.
    host: "127.0.0.1",
    port: 5173,
    watch: {
      // The game server writes data/state.json on every pick. Watching it means
      // a full page reload mid-game, on the window everyone is looking at.
      ignored: ["**/data/**", "**/notes/**", "**/screenshots/**"],
    },
  },
  preview: { host: "127.0.0.1", port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        display: resolve(import.meta.dirname, "display.html"),
        host: resolve(import.meta.dirname, "host.html"),
      },
    },
  },
});
