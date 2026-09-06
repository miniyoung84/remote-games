import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRemoteImage } from "./fetch-image.js";
import { buildPack } from "./packs.js";
import { readImage } from "./store.js";

/**
 * Routes shared by the dev server (as Vite middleware) and the production
 * server, so images and pack downloads behave identically in both.
 * Returns true when the request was handled.
 */
export function handleApi(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname.startsWith("/images/")) {
    const id = url.pathname.slice("/images/".length).replace(/\.webp$/, "");
    const bytes = readImage(id);
    if (!bytes) {
      res.writeHead(404).end();
      return true;
    }
    res.writeHead(200, {
      "content-type": "image/webp",
      // Content-addressed, so the bytes behind an id can never change.
      "cache-control": "public, max-age=31536000, immutable",
    });
    res.end(bytes);
    return true;
  }

  if (url.pathname === "/fetch-image") {
    const target = url.searchParams.get("url") ?? "";
    fetchRemoteImage(target).then(
      ({ type, bytes }) => {
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
        res.end(bytes);
      },
      (err: unknown) => {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end(err instanceof Error ? err.message : "Could not fetch that image.");
      },
    );
    return true;
  }

  if (url.pathname === "/pack.json") {
    const name = url.searchParams.get("name") ?? "";
    const setsParam = url.searchParams.get("sets");
    const pack = buildPack(name, setsParam ? setsParam.split(",").filter(Boolean) : null);
    const filename = `${(pack.name || "pack").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack"}.pack.json`;
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    });
    res.end(JSON.stringify(pack));
    return true;
  }

  return false;
}
