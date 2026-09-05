/**
 * Getting a playable sign, with the bundle first and the API second.
 *
 * Sixteen words ship inside the bundle (see signSamples.js), so a hero can
 * draw a real recording the instant the page paints — no request, no
 * spinner, and nothing that breaks when the backend is not running. Any other
 * word falls through to /api/text-to-sign, which covers the full 261.
 *
 * Both paths return the same shape, and both are real landmark data. The
 * `source` field says which one answered so the interface can be honest about
 * it rather than implying a live server when there is not one.
 *
 * `activeHands` says which hands carry the sign, so a renderer can crop to the
 * working hand instead of having to contain one resting at the signer's hip —
 * which is what made the old player render hands at ~8% of the frame.
 */
import { sampleSign, SAMPLE_FPS, SAMPLE_QUANT, SAMPLE_WORDS } from "./signSamples";
import { textToSign } from "./api";

export { SAMPLE_WORDS };

const cache = new Map();

/**
 * @returns {Promise<{frames, fps, quant, label, source} | null>}
 */
export async function resolveSign(word) {
  if (!word) return null;
  if (cache.has(word)) return cache.get(word);

  const bundled = sampleSign(word);
  if (bundled) {
    const hit = {
      frames: bundled.frames,
      fps: SAMPLE_FPS,
      quant: SAMPLE_QUANT,
      label: word,
      takes: bundled.takes,
      activeHands: bundled.activeHands,
      source: "bundled",
    };
    cache.set(word, hit);
    return hit;
  }

  try {
    const data = await textToSign(word);
    const item = data?.items?.find((it) => it.available && it.frames?.length);
    if (!item) return null;
    const hit = {
      frames: item.frames,
      fps: data.fps,
      quant: data.quant,
      label: item.label,
      takes: item.takes,
      activeHands: item.activeHands,
      source: "api",
    };
    cache.set(word, hit);
    return hit;
  } catch {
    return null;                     // backend down; caller keeps the bundle
  }
}
