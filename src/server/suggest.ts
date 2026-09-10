/**
 * Image suggestions from Wikimedia Commons.
 *
 * Chosen over an image-search API for two reasons that matter here: it needs no
 * API key, so there's nothing to configure and nothing to leak from a public
 * repo, and everything on it is freely licensed — which matters because packs
 * embed image bytes, so a shared pack carries whatever was pulled in.
 */
export type Suggestion = {
  title: string;
  mime: string;
  width: number;
  thumb: string;
  source: string;
  license: string;
  artist: string;
};

const ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const UA = "remote-games/0.1 (local party game; https://github.com/miniyoung84/remote-games)";
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX = 200;

const cache = new Map<string, { at: number; results: Suggestion[] }>();

/** extmetadata values are HTML fragments. */
function plain(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function suggestImages(query: string, limit = 8): Promise<Suggestion[]> {
  const q = query.trim();
  if (!q) return [];

  const key = `${q}::${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    // Bitmaps only: SVG and PDF results are rarely what someone wants on a chip.
    gsrsearch: `filetype:bitmap ${q}`,
    gsrnamespace: "6",
    gsrlimit: String(Math.min(20, Math.max(1, limit))),
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime|size",
    iiurlwidth: "480",
    format: "json",
    origin: "*",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}?${params}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: controller.signal,
    });
    // Commons rate-limits bursts; say so plainly rather than showing a number.
    if (response.status === 429) throw new Error("Commons is rate-limiting — wait a moment and try again.");
    if (!response.ok) throw new Error(`Commons returned ${response.status}.`);

    const body = (await response.json()) as {
      query?: { pages?: Record<string, Record<string, unknown>> };
    };

    const results: Suggestion[] = [];
    for (const page of Object.values(body.query?.pages ?? {})) {
      const info = (page.imageinfo as Record<string, unknown>[] | undefined)?.[0];
      const thumb = info?.thumburl;
      if (typeof thumb !== "string") continue;
      const meta = (info?.extmetadata ?? {}) as Record<string, { value?: unknown }>;
      results.push({
        title: String(page.title ?? "").replace(/^File:/, ""),
        mime: typeof info?.mime === "string" ? info.mime : "",
        width: typeof info?.width === "number" ? info.width : 0,
        thumb,
        source: typeof info?.descriptionurl === "string" ? info.descriptionurl : "",
        license: plain(meta.LicenseShortName?.value) || "see source",
        artist: plain(meta.Artist?.value).slice(0, 80),
      });
    }

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), results });
    return results;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Commons took too long.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
