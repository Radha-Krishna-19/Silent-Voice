/**
 * The hero: the vocabulary itself, as architecture.
 *
 * Why this and not a rendering of the sign data
 * ---------------------------------------------
 * Three visualisations of the landmark data were built for this slot — a 3-D
 * skeleton, then motion trails, then smoothed motion trails with a real
 * Gaussian blur — and all three were rejected, correctly. The data is nine
 * frames of monocular tracking from a wide shot. Rendered small in Practice,
 * where you are deliberately inspecting what the model saw, it is useful.
 * Rendered two feet tall as decoration it looks like scratches, and no
 * renderer fixes that because the problem is the source material.
 *
 * So the hero stops trying. What is genuinely impressive about this project is
 * the SCALE of the vocabulary — 261 word-level signs, where most published ISL
 * work reports on twenty. That is a fact worth showing, and typography is the
 * right medium for a fact.
 *
 * Three layers:
 *   1. a slow column of every word in the vocabulary, low contrast, drifting
 *   2. the current word, large, arriving with a mask reveal
 *   3. a hairline index that ticks along as the selection moves
 *
 * All of it is real: the words come from lib/vocabulary.js, generated from the
 * trained label map, so this can never advertise a sign the model lacks.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ALL_WORDS, VOCAB_SIZE, pretty } from "../lib/vocabulary";
import { useReducedMotionPref } from "./motion/preference";
import { EASE_OUT } from "./motion/text";
import { cn } from "../lib/utils";

export default function VocabularyWall({
  className = "",
  intervalMs = 3200,
  columns = 3,
  onWord,
}) {
  const reduced = useReducedMotionPref();
  const [i, setI] = useState(() => Math.floor(Math.random() * ALL_WORDS.length));
  const word = ALL_WORDS[i % ALL_WORDS.length];

  useEffect(() => { onWord?.(word); }, [word, onWord]);

  useEffect(() => {
    if (reduced) return undefined;
    const t = setInterval(() => setI((n) => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, reduced]);

  // Static columns of the whole vocabulary, drifting at different rates. Each
  // column repeats its slice twice so the loop is seamless.
  const cols = useMemo(() => {
    const per = Math.ceil(ALL_WORDS.length / columns);
    return Array.from({ length: columns }, (_, c) => {
      const slice = ALL_WORDS.slice(c * per, (c + 1) * per);
      return slice.length ? slice : ALL_WORDS.slice(0, per);
    });
  }, [columns]);

  return (
    <div className={cn("relative overflow-hidden", className)} data-testid="vocabulary-wall">
      {/* ---- layer 1: the drifting index -------------------------------- */}
      <div
        className="absolute inset-0 flex justify-center gap-10 md:gap-16 select-none pointer-events-none"
        aria-hidden="true"
      >
        {cols.map((slice, c) => (
          <motion.div
            key={c}
            className="flex flex-col gap-3 shrink-0"
            animate={reduced ? undefined : { y: c % 2 ? ["-50%", "0%"] : ["0%", "-50%"] }}
            transition={{ duration: 150 + c * 40, ease: "linear", repeat: Infinity }}
          >
            {[...slice, ...slice].map((w, n) => (
              <span
                key={`${w}-${n}`}
                className={`text-[11px] uppercase tracking-[0.28em] whitespace-nowrap transition-colors duration-500 ${
                  w === word ? "text-copper" : "text-cream/[0.16]"
                }`}
              >
                {pretty(w)}
              </span>
            ))}
          </motion.div>
        ))}
      </div>

      {/* fade the column edges so it reads as a field, not a list */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, #0B0B0D 0%, transparent 22%, transparent 78%, #0B0B0D 100%)",
        }}
      />

      {/* ---- layer 2: the current word ---------------------------------- */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
        <div className="micro-caps text-cream/35 mb-4">In the vocabulary</div>

        <div className="relative h-[1.15em] overflow-hidden font-display text-[13vw] lg:text-[6.5rem] leading-[1.05]">
          <AnimatePresence mode="wait">
            <motion.div
              key={word}
              className="font-display leading-[1.05] tracking-tight text-cream text-center whitespace-nowrap"
              initial={reduced ? { opacity: 0 } : { y: "105%" }}
              animate={reduced ? { opacity: 1 } : { y: "0%" }}
              exit={reduced ? { opacity: 0 } : { y: "-105%" }}
              transition={{ duration: reduced ? 0.2 : 0.62, ease: EASE_OUT }}
            >
              {pretty(word)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ---- layer 3: position in the set ----------------------------- */}
        <div className="flex items-center gap-3 mt-6">
          <span className="font-mono text-[11px] text-copper tabular-nums">
            {String((i % ALL_WORDS.length) + 1).padStart(3, "0")}
          </span>
          <div className="w-32 h-px bg-cream/12 relative overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-copper"
              animate={{ width: `${(((i % ALL_WORDS.length) + 1) / VOCAB_SIZE) * 100}%` }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            />
          </div>
          <span className="font-mono text-[11px] text-cream/30 tabular-nums">{VOCAB_SIZE}</span>
        </div>

        <div className="text-[10px] uppercase tracking-[0.22em] text-cream/25 mt-4 text-center">
          every word the model was trained to recognise
        </div>
      </div>
    </div>
  );
}
