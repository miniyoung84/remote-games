import { lookup } from "node:dns/promises";

const MAX_BYTES = 10_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

/**
 * Addresses the server should never be talked into fetching. This runs on the
 * host's own machine, so the risk is modest — but a URL pasted from a chat
 * shouldn't be able to probe the local network, and checking is nearly free.
 */
function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd]/.test(v6)) return true; // unique local
  if (/^fe[89ab]/.test(v6)) return true; // link-local
  return false;
}

async function assertPublic(hostname: string): Promise<void> {
  // URL.hostname keeps the brackets on an IPv6 literal, which would slip past
  // the literal check below and only fail later on DNS.
  const host = hostname.replace(/^\[|\]$/g, "");
  // A bare IP in the URL never reaches DNS, so check the literal too.
  if (isPrivateAddress(host)) throw new Error("That address is not allowed.");
  const results = await lookup(host, { all: true });
  if (!results.length) throw new Error("Could not resolve that host.");
  if (results.some((r) => isPrivateAddress(r.address))) throw new Error("That address is not allowed.");
}

export type FetchedImage = { type: string; bytes: Buffer };

/**
 * Fetch a remote image on the browser's behalf. The browser can't do this
 * itself: drawing a cross-origin image to a canvas taints it, and the resize
 * step needs `toBlob()`. Coming back same-origin keeps that working.
 */
export async function fetchRemoteImage(raw: string): Promise<FetchedImage> {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("That isn't a valid URL.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http and https URLs work.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let response: Response | null = null;
    // Redirects are followed by hand so every hop is checked — otherwise a
    // public URL could bounce straight to a private one.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublic(target.hostname);
      response = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "image/*" },
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        target = new URL(location, target);
        continue;
      }
      break;
    }

    if (!response) throw new Error("Too many redirects.");
    if (!response.ok) throw new Error(`That URL returned ${response.status}.`);

    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!type.startsWith("image/")) throw new Error("That URL isn't an image.");

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error("That image is too large.");

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error("That image is too large.");
    if (!bytes.length) throw new Error("That URL returned nothing.");

    return { type, bytes };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("That URL took too long.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
