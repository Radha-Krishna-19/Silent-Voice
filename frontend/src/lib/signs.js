/**
 * Getting a playable sign, with the bundle first and the API second.
 *
 * Sixteen words ship inside the bundle (see signSamples.js), so the 3-D hand
 * performs real recordings the instant the page paints — no request, no
 * spinner, and nothing that breaks when the backend is not running. Any other
 * word falls through to /api/text-to-sign, which covers the full 261.
 *
 * Both paths return the same shape, and both are real landmark data. The
 * `source` field says which one answered so the interface can be honest about
 * it rather than implying a live server when there is not one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
      source: "api",
    };
    cache.set(word, hit);
    return hit;
  } catch {
    return null;                     // backend down; caller keeps the bundle
  }
}

/**
 * Cycle a hand rig through a list of words forever.
 *
 * @param handRef  ref to a HandRig
 * @param words    words to cycle; bundled ones are preferred automatically
 * @param options  { intervalMs, enabled }
 * @returns {{ word, source, play, pause, resume }}
 */
export function useSignLoop(handRef, words, { intervalMs = 4200, enabled = true } = {}) {
  const [word, setWord] = useState(null);
  const [source, setSource] = useState(null);
  const timer = useRef(null);
  const idx = useRef(Math.floor(Math.random() * Math.max(1, words.length)));
  const paused = useRef(false);

  const play = useCallback(async (w, loop = false) => {
    const hit = await resolveSign(w);
    const h = handRef?.current;
    if (!hit || !h) return false;
    h.playSign(hit.frames, {
      fps: hit.fps, quant: hit.quant, label: hit.label, loop,
    });
    setWord(hit.label);
    setSource(hit.source);
    return true;
  }, [handRef]);

  useEffect(() => {
    if (!enabled || !words.length) return undefined;

    let alive = true;
    const step = async () => {
      if (!alive) return;
      if (!paused.current) {
        // Try a few words before giving up, so one missing entry does not
        // stall the loop on a dead frame.
        for (let attempt = 0; attempt < 3; attempt++) {
          const w = words[idx.current % words.length];
          idx.current += 1;
          // eslint-disable-next-line no-await-in-loop
          if (await play(w)) break;
        }
      }
      if (alive) timer.current = setTimeout(step, intervalMs);
    };

    timer.current = setTimeout(step, 400);
    return () => { alive = false; clearTimeout(timer.current); };
  }, [words, intervalMs, enabled, play]);

  return {
    word,
    source,
    play,
    pause: () => { paused.current = true; },
    resume: () => { paused.current = false; },
  };
}
