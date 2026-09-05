/**
 * Shown once, only when the operating system asks for reduced motion.
 *
 * The app animates by default (see motion/preference.js for why). That is a
 * deliberate override of prefers-reduced-motion, and overriding an
 * accessibility signal silently would be indefensible — so when we detect it,
 * we say so and put the choice one click away.
 *
 * Appears only if: the OS asks for reduced motion, AND the user has never
 * chosen a motion mode, AND they have not dismissed this before.
 */
import { motion, AnimatePresence } from "framer-motion";
import { X, Accessibility } from "lucide-react";
import { useMotionNotice, setMotionMode, dismissNotice } from "./motion/preference";

export default function MotionNotice() {
  const show = useMotionNotice();

  const honour = () => { setMotionMode("off"); dismissNotice(); };
  const keep = () => { setMotionMode("on"); dismissNotice(); };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          data-testid="motion-notice"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="fixed bottom-5 left-5 z-[75] max-w-sm bg-ink border border-cream/20 rounded-sm shadow-2xl p-4"
        >
          <div className="flex items-start gap-3">
            <Accessibility className="w-4 h-4 text-copper shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-cream/90 mb-1.5">Your system asks for reduced motion</div>
              <p className="text-xs text-cream/45 leading-relaxed mb-3">
                Windows turns this on by default on many machines, so we animate
                anyway. If you want motion reduced for real, that is one click —
                and it is always in Settings → Motion.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={honour}
                  data-testid="motion-notice-reduce"
                  className="focus-ring text-[11px] uppercase tracking-widest px-3 py-1.5 bg-copper text-ink rounded-sm"
                >
                  Reduce motion
                </button>
                <button
                  onClick={keep}
                  data-testid="motion-notice-keep"
                  className="focus-ring text-[11px] uppercase tracking-widest px-3 py-1.5 border border-cream/20 text-cream/70 hover:text-cream rounded-sm transition-colors"
                >
                  Keep animations
                </button>
              </div>
            </div>
            <button
              onClick={dismissNotice}
              aria-label="Dismiss"
              className="focus-ring text-cream/30 hover:text-cream transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
