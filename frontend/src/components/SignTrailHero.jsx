/**
 * The hero visual: a sign being written in light, on a loop.
 *
 * Wraps SignTrail with the word rotation, the caption, and a ghost of the
 * previous mark fading underneath — so consecutive signs overlap the way
 * successive exposures would, rather than snapping from one to the next.
 *
 * Data comes from lib/signs.js: bundled words first (so the hero paints
 * instantly and works with the backend off), API for anything else.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SignTrail from "./SignTrail";
import { resolveSign, SAMPLE_WORDS } from "../lib/signs";
import { pretty } from "../lib/vocabulary";
import { EASE_OUT } from "./motion/text";
import { useReducedMotionPref } from "./motion/preference";
import { cn } from "../lib/utils";

export default function SignTrailHero({
  className = "",
  words = SAMPLE_WORDS,
  showCaption = true,
  captionClassName = "",
  lineScale = 1,
  onWord,
}) {
  const trailRef = useRef(null);
  const ghostRef = useRef(null);
  const [current, setCurrent] = useState(null);   // { word, frames, activeHands, source }
  const [ghost, setGhost] = useState(null);
  const idx = useRef(Math.floor(Math.random() * Math.max(1, words.length)));
  const holdRef = useRef(false);
  const reduced = useReducedMotionPref();

  const load = useCallback(async (word) => {
    const hit = await resolveSign(word);
    if (!hit) return false;
    setGhost((g) => (current ? current : g));
    setCurrent({
      word: hit.label,
      frames: hit.frames,
      activeHands: hit.activeHands,
      source: hit.source,
    });
    onWord?.(hit.label, hit.source);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, onWord]);

  // first paint
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < 4 && alive; i++) {
        const w = words[(idx.current + i) % words.length];
        // eslint-disable-next-line no-await-in-loop
        if (await load(w)) { idx.current = (idx.current + i + 1) % words.length; break; }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // advance when the mark finishes drawing
  const onCycle = useCallback(() => {
    if (holdRef.current || reduced) return;
    const w = words[idx.current % words.length];
    idx.current += 1;
    load(w);
  }, [words, load, reduced]);

  // pointer parallax
  useEffect(() => {
    const move = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      trailRef.current?.setPointer(x, y);
      ghostRef.current?.setPointer(x * 0.6, y * 0.6);
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // cn() is tailwind-merge: a later utility from the same group REPLACES an
  // earlier one, so a caller passing "absolute inset-0" correctly overrides the
  // "relative" default.
  //
  // Writing this as `relative ${className}` is what broke both heroes. Tailwind
  // emits `.relative` AFTER `.absolute`, so the browser resolved
  // class="relative absolute inset-0" to position:relative no matter what order
  // it was written in — and a relatively-positioned element ignores `inset` for
  // sizing, so this wrapper had zero height and the canvas inside it was 0x0.
  return (
    <div className={cn("relative", className)} data-testid="sign-trail-hero">
      {/* the previous mark, dissolving */}
      {ghost && !reduced && (
        <motion.div
          key={`ghost-${ghost.word}`}
          className="absolute inset-0"
          initial={{ opacity: 0.32 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2.4, ease: "linear" }}
        >
          <SignTrail
            ref={ghostRef}
            className="w-full h-full"
            frames={ghost.frames}
            activeHands={ghost.activeHands}
            progress={1}
            lineScale={lineScale * 0.8}
            showParticles={false}
          />
        </motion.div>
      )}

      <SignTrail
        ref={trailRef}
        className="absolute inset-0 w-full h-full"
        frames={current?.frames}
        activeHands={current?.activeHands}
        lineScale={lineScale}
        onCycle={onCycle}
      />

      {showCaption && (
        <div className={cn("absolute inset-x-0 bottom-0", captionClassName)}>
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.word}
                initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
                transition={{ duration: 0.38, ease: EASE_OUT }}
              >
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="micro-caps text-copper">now signing</span>
                  <span className="font-display text-3xl md:text-4xl tracking-tight">
                    {pretty(current.word)}
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-cream/30 mt-1.5">
                  the path a real signer's hands travelled ·{" "}
                  {current.source === "bundled" ? "bundled with the app" : "from the server"}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
