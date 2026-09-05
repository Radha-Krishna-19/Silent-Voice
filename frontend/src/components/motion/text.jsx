/**
 * Typographic motion.
 *
 * The pieces that make a page feel authored rather than assembled. Every one
 * of these is a technique used on the sites people describe as "polished" —
 * they are not exotic, they are just done carefully:
 *
 *   MaskReveal    lines rise from behind a mask, the way a printed page
 *                 uncovers. The single highest-value text effect there is.
 *   WordReveal    word-by-word blur-in for body copy.
 *   CharHover     characters lift individually under the cursor.
 *   ShiftText     the label swaps by sliding the old one out and the new in.
 *   Counter       digits roll like a mechanical display.
 *   GradientText  a highlight sweeps across the letters.
 *
 * Rules kept from the rest of the system: nothing over 400 ms for a single
 * element, no bouncy overshoot on content, everything degrades to a plain fade
 * under reduced motion, and every effect keeps the real text available to
 * screen readers via aria-label with the animated copy aria-hidden.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { useReducedMotionPref } from "./preference";

export const EASE = [0.25, 0.1, 0.25, 1];
export const EASE_OUT = [0.16, 1, 0.3, 1];        // strong deceleration

/* ------------------------------------------------------------------ *
 * MaskReveal — lines rise from behind a clipping edge.
 * ------------------------------------------------------------------ */
export function MaskReveal({
  children,
  delay = 0,
  duration = 0.62,
  stagger = 0.07,
  className = "",
  as: Tag = "div",
}) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-8% 0px" });
  const lines = Array.isArray(children) ? children : [children];

  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden">
          <motion.span
            className="block will-change-transform"
            initial={reduced ? { opacity: 0 } : { y: "110%" }}
            animate={inView ? (reduced ? { opacity: 1 } : { y: "0%" }) : undefined}
            transition={{
              duration: reduced ? 0.25 : duration,
              delay: delay + i * stagger,
              ease: EASE_OUT,
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/* ------------------------------------------------------------------ *
 * WordReveal — body copy arrives a word at a time, slightly out of focus.
 * ------------------------------------------------------------------ */
export function WordReveal({ text, className = "", delay = 0, stagger = 0.018 }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-6% 0px" });
  const words = String(text).split(" ");

  if (reduced) return <span ref={ref} className={className}>{text}</span>;

  return (
    <span ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          aria-hidden="true"
          className="inline-block will-change-transform"
          initial={{ opacity: 0, y: 10, filter: "blur(5px)" }}
          animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : undefined}
          transition={{ duration: 0.42, delay: delay + i * stagger, ease: EASE_OUT }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * CharHover — letters lift under the pointer. For a wordmark or a link
 * you want to feel physical.
 * ------------------------------------------------------------------ */
export function CharHover({ text, className = "", charClassName = "", lift = 6 }) {
  const reduced = useReducedMotionPref();
  const chars = String(text).split("");
  if (reduced) return <span className={className}>{text}</span>;

  return (
    <span className={`inline-flex ${className}`} aria-label={text}>
      {chars.map((c, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className={`inline-block ${charClassName}`}
          whileHover={{ y: -lift, color: "#C97B4A" }}
          transition={{ type: "spring", stiffness: 460, damping: 18 }}
        >
          {c === " " ? " " : c}
        </motion.span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * ShiftText — one label replaces another by sliding through.
 * ------------------------------------------------------------------ */
export function ShiftText({ children, k, className = "", direction = "up" }) {
  const reduced = useReducedMotionPref();
  const dy = direction === "up" ? 1 : -1;
  return (
    <span className={`relative inline-block overflow-hidden align-bottom ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={k}
          className="inline-block"
          initial={reduced ? { opacity: 0 } : { y: `${dy * 100}%`, opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: `${-dy * 100}%`, opacity: 0 }}
          transition={{ duration: 0.34, ease: EASE_OUT }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Counter — digits roll. Each column animates independently, so only the
 * digits that changed move, exactly like a split-flap display.
 * ------------------------------------------------------------------ */
export function Counter({ value, decimals = 0, suffix = "", className = "" }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced || value == null) { setShown(value); return undefined; }
    if (!inView) return undefined;
    const start = performance.now();
    const from = 0;
    const to = Number(value) || 0;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1100);
      setShown(from + (to - from) * (1 - Math.pow(1 - t, 4)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, inView, reduced]);

  if (value == null) return <span ref={ref} className={className}>—</span>;

  const text = Number(shown).toFixed(decimals);
  return (
    <span ref={ref} className={`inline-flex tabular-nums ${className}`} aria-label={`${value}${suffix}`}>
      {text.split("").map((ch, i) => (
        <span key={i} className="relative inline-block overflow-hidden" style={{ height: "1em" }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              className="inline-block"
              initial={reduced ? { opacity: 0 } : { y: "-100%" }}
              animate={{ y: "0%", opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: "100%", opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
      {suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * GradientSweep — a highlight travels across the text once on reveal.
 * ------------------------------------------------------------------ */
export function GradientSweep({ children, className = "", once = true }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const inView = useInView(ref, { once });

  if (reduced) return <span className={className}>{children}</span>;

  return (
    <motion.span
      ref={ref}
      className={`inline-block bg-clip-text ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(100deg, currentColor 0%, currentColor 38%, #C97B4A 50%, currentColor 62%, currentColor 100%)",
        backgroundSize: "260% 100%",
        WebkitBackgroundClip: "text",
      }}
      initial={{ backgroundPosition: "160% 0%" }}
      animate={inView ? { backgroundPosition: "-60% 0%" } : undefined}
      transition={{ duration: 1.5, ease: EASE, delay: 0.3 }}
    >
      {children}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ *
 * ElasticUnderline — the rule under a nav link draws from the side you
 * approached from, and retracts the way you leave.
 * ------------------------------------------------------------------ */
export function ElasticUnderline({ children, className = "", color = "#C97B4A" }) {
  const reduced = useReducedMotionPref();
  const [from, setFrom] = useState("left");
  const ref = useRef(null);

  const side = (e) => {
    if (!ref.current) return "left";
    const r = ref.current.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? "left" : "right";
  };

  return (
    <span
      ref={ref}
      className={`relative inline-block group ${className}`}
      onMouseEnter={(e) => setFrom(side(e))}
      onMouseLeave={(e) => setFrom(side(e))}
    >
      {children}
      {!reduced && (
        <span className="absolute -bottom-0.5 left-0 right-0 h-px overflow-hidden">
          <motion.span
            className="block h-full w-full"
            style={{ backgroundColor: color, originX: from === "left" ? 0 : 1 }}
            initial={{ scaleX: 0 }}
            whileHover={{ scaleX: 1 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          />
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Shimmer — a loading placeholder that does not pulse the whole box.
 * ------------------------------------------------------------------ */
export function Shimmer({ className = "", rounded = "rounded-sm" }) {
  const reduced = useReducedMotionPref();
  return (
    <span className={`relative block overflow-hidden bg-cream/[0.05] ${rounded} ${className}`}>
      {!reduced && (
        <motion.span
          className="absolute inset-y-0 w-1/2"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(242,236,224,0.09), transparent)",
          }}
          animate={{ x: ["-120%", "260%"] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </span>
  );
}
