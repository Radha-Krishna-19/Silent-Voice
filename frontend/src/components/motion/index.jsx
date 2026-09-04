/**
 * Shared motion primitives.
 *
 * Design rules, so this stays professional rather than gaudy:
 *   1. Motion must explain something — where an element came from, that a value
 *      changed, that input was received. Decoration for its own sake is noise.
 *   2. 150–350 ms. Anything slower feels broken when you use the app daily.
 *   3. No bouncy overshoot on content. Springs are reserved for direct
 *      manipulation (hover, drag), where overshoot reads as physical.
 *   4. Every effect checks prefers-reduced-motion and degrades to a plain fade
 *      or to nothing. Vestibular disorders are not an edge case in an
 *      accessibility product.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useReducedMotion, useInView, useSpring, useMotionValue, useTransform } from "framer-motion";

export const EASE = [0.25, 0.1, 0.25, 1];       // the deck's editorial curve

/* ------------------------------------------------------------------ *
 * Reveal — fades/slides in the first time it enters the viewport.
 * ------------------------------------------------------------------ */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  x = 0,
  duration = 0.5,
  className = "",
  once = true,
  as = "div",
}) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-10% 0px -10% 0px" });
  const M = motion[as] ?? motion.div;

  return (
    <M
      ref={ref}
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y, x }}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : undefined}
      transition={{ duration: reduced ? 0.2 : duration, delay, ease: EASE }}
    >
      {children}
    </M>
  );
}

/* ------------------------------------------------------------------ *
 * Stagger — children arrive in sequence rather than all at once.
 * ------------------------------------------------------------------ */
export function Stagger({ children, gap = 0.06, className = "", delay = 0 }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-8% 0px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduced ? 0 : gap, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "", y = 16 }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduced ? { opacity: 0 } : { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Magnetic — the element leans toward the cursor, then springs back.
 * Direct manipulation, so a spring is appropriate here.
 * ------------------------------------------------------------------ */
export function Magnetic({ children, strength = 0.28, className = "", ...rest }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 18, mass: 0.5 });
  const y = useSpring(my, { stiffness: 260, damping: 18, mass: 0.5 });

  const onMove = (e) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => { mx.set(0); my.set(0); };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x, y }}
      onMouseMove={onMove}
      onMouseLeave={reset}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * SplitText — per-character entrance. Characters rise into place.
 * ------------------------------------------------------------------ */
export function SplitText({ text, className = "", delay = 0, stagger = 0.022, y = "0.5em" }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const chars = String(text).split("");

  if (reduced) return <span ref={ref} className={className}>{text}</span>;

  return (
    <span ref={ref} className={`inline-block ${className}`} aria-label={text}>
      {chars.map((c, i) => (
        <motion.span
          key={`${c}-${i}`}
          aria-hidden="true"
          className="inline-block will-change-transform"
          initial={{ opacity: 0, y }}
          animate={inView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.42, delay: delay + i * stagger, ease: EASE }}
        >
          {c === " " ? " " : c}
        </motion.span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * FallingText — characters DROP AWAY when removed, osu!-style.
 *
 * The trick: a character animates out only when it actually leaves the
 * string, so deleting text makes the tail fall while the rest stays put.
 * Keying by index+char keeps identity stable for unchanged characters.
 * ------------------------------------------------------------------ */
export function FallingText({ text, className = "", charClass = "" }) {
  const reduced = useReducedMotion();
  const chars = String(text ?? "").split("");

  return (
    <span className={`inline-flex flex-wrap ${className}`} aria-label={text}>
      {chars.map((c, i) => (
        <motion.span
          key={`${i}-${c}`}
          aria-hidden="true"
          layout={!reduced}
          className={`inline-block ${charClass}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.86, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={reduced ? { opacity: 0 } : {
            opacity: 0,
            y: 26,
            scale: 0.8,
            rotate: (i % 2 ? 1 : -1) * (6 + (i % 5) * 3),
            filter: "blur(3px)",
          }}
          transition={{ duration: reduced ? 0.15 : 0.28, ease: EASE }}
        >
          {c === " " ? " " : c}
        </motion.span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * CountUp — animates a number to its new value. Signals "this changed".
 * ------------------------------------------------------------------ */
export function CountUp({ value, decimals = 0, suffix = "", prefix = "", duration = 0.9, className = "" }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const raf = useRef(null);
  const from = useRef(0);

  useEffect(() => {
    if (reduced || value == null) { setShown(value); return undefined; }
    const start = performance.now();
    const a = from.current;
    const b = Number(value) || 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);           // easeOutCubic
      setShown(a + (b - a) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration, reduced]);

  if (value == null) return <span className={className}>—</span>;
  return (
    <span className={className}>
      {prefix}{Number(shown).toFixed(decimals)}{suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Tilt — card leans in 3D under the cursor. Subtle: 6° maximum.
 * ------------------------------------------------------------------ */
export function Tilt({ children, className = "", max = 6, scale = 1.012 }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });

  const onMove = (e) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      onMouseMove={onMove}
      onMouseLeave={() => { px.set(0.5); py.set(0.5); }}
      whileHover={reduced ? undefined : { scale }}
      style={{ rotateX: reduced ? 0 : rx, rotateY: reduced ? 0 : ry, transformPerspective: 900 }}
      transition={{ duration: 0.2, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Ripple — expanding ring on click. Confirms the tap landed.
 * ------------------------------------------------------------------ */
export function useRipple() {
  const [ripples, setRipples] = useState([]);
  const reduced = useReducedMotion();

  const fire = useCallback((e) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setRipples((rs) => [...rs, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
    setTimeout(() => setRipples((rs) => rs.filter((v) => v.id !== id)), 600);
  }, [reduced]);

  const layer = (
    <span className="pointer-events-none absolute inset-0 overflow-hidden">
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          className="absolute rounded-full bg-cream/25"
          style={{ left: r.x, top: r.y, translateX: "-50%", translateY: "-50%" }}
          initial={{ width: 0, height: 0, opacity: 0.5 }}
          animate={{ width: 240, height: 240, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
      ))}
    </span>
  );

  return { fire, layer };
}

/* ------------------------------------------------------------------ *
 * ScrollProgress — thin bar showing position in a long page.
 * ------------------------------------------------------------------ */
export function ScrollProgress({ className = "" }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? window.scrollY / h : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className={`fixed top-0 left-0 right-0 h-px z-[60] ${className}`}>
      <div
        className="h-full bg-copper origin-left"
        style={{ transform: `scaleX(${p})`, transition: "transform 90ms linear" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * CursorGlow — soft light that follows the pointer. Desktop only.
 * ------------------------------------------------------------------ */
export function CursorGlow({ size = 380, color = "rgba(201,123,74,0.07)" }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(-9999);
  const y = useMotionValue(-9999);
  const sx = useSpring(x, { stiffness: 120, damping: 22, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 120, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (reduced || window.matchMedia("(pointer: coarse)").matches) return undefined;
    const move = (e) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [x, y, reduced]);

  if (reduced) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed z-0 rounded-full"
      style={{
        left: sx, top: sy, width: size, height: size,
        translateX: "-50%", translateY: "-50%",
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * PageTransition — wraps a route so navigation reads as movement.
 * ------------------------------------------------------------------ */
export function PageTransition({ children, className = "" }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * AnimatedRing — progress ring that draws itself to a value.
 * ------------------------------------------------------------------ */
export function AnimatedRing({ value = 0, size = 132, stroke = 7, color = "#C97B4A", track = "rgba(242,236,224,0.10)", children }) {
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: reduced ? 0 : 1.0, ease: EASE }}
          style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
