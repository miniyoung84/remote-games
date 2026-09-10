/**
 * Recover image bytes referenced by the sets from any pack in packs/.
 * The server does this automatically on start; this is for doing it by hand.
 *
 *   npm run restore
 */
import { restoreMissingImages } from "../src/server/restore.js";
const restored = restoreMissingImages();
console.log(restored ? `restored ${restored} image(s)` : "nothing missing");
