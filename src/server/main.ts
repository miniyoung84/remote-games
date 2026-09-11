/**
 * Standalone server for the built app. `npm run dev` runs the same game server
 * inside Vite; this exists so a real session can run off a production build
 * rather than a dev server with HMR attached.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { attachGameServer } from "./index.js";
import { handleApi } from "./http.js";

const DIST = join(process.cwd(), "dist");
const PORT = Number(process.env.PORT ?? 5173);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
};

const server = createServer((req, res) => {
  if (handleApi(req, res)) return;
  const path = (req.url ?? "/").split("?")[0];
  const route = path === "/" ? "/index.html" : path === "/display" || path === "/host" ? `${path}.html` : path;

  // Contain path traversal before it ever reaches the filesystem.
  const file = join(DIST, normalize(route).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("Not found");
  }

  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});

attachGameServer(server);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Display  http://127.0.0.1:${PORT}/display`);
  console.log(`  Host     http://127.0.0.1:${PORT}/host\n`);
});
