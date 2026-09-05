/**
 * The louder half of the motion system.
 *
 * Same rules as motion/index.jsx — motion must mean something, 150-350 ms,
 * springs only for direct manipulation, everything degrades under
 * useReducedMotionPref. These are the effects with more personality: text that
 * physically falls when you delete it, headings that decode into place,
 * sections that pin while you scroll past them.
 */
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import {
  AnimatePresence, motion, useInView, useMotionValue, useScroll,
  useSpring, useTransform, useVelocity,
} from "framer-motion";
import { useReducedMotionPref } from "./preference";

export const EASE = [0.25, 0.1, 0.25, 1];

/* ------------------------------------------------------------------ *
 * FallingInput — the osu! effect, on a real text field.
 *
 * Characters you type rise into place. Characters you DELETE detach and fall
 * out of the box, tumbling, with the ones nearest the cursor leaving first.
 * The trick is that the visible text is an overlay of per-character spans and
 * the actual <input> is transparent on top, so the caret, selection, IME,
 * autofill and screen readers all keep working normally.
 * ------------------------------------------------------------------ */
export function FallingInput({
  value,
  onChange,
  onKeyDown,
  placeholder = "",
  className = "",
  inputClassName = "",
  charClassName = "",
  type = "text",
  autoFocus = false,
  onFocus,
  onBlur,
  id,
  name,
  autoComplete = "off",
  "data-testid": testId,
  disabled = false,
  maxLength,
}) {
  const reduced = useReducedMotionPref();
  const inputRef = useRef(null);
  const seq = useRef(0);
  // Each character carries a stable key, so React only animates the ones that
  // actually left. Keying by index would make deleting the first character
  // look like every character was replaced.
  const [chars, setChars] = useState([]);

  useLayoutEffect(() => {
    setChars((prev) => {
      const next = [];
      const text = String(value ?? "");
      // Reuse keys for the longest common prefix; mint new ones after that.
      let i = 0;
      while (i < text.length && i < prev.length && prev[i].c === text[i]) {
        next.push(prev[i]);
        i++;
      }
      for (; i < text.length; i++) {
        next.push({ c: text[i], k: `c${seq.current++}` });
      }
      return next;
    });
  }, [value]);

  const masked = type === "password";

  return (
    <div className={`relative ${className}`}>
      {/* Visible, animated rendering of the text */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre ${inputClassName}`}
        style={{ color: "inherit" }}
      >
        <AnimatePresence initial={false}>
          {chars.map(({ c, k }, i) => (
            <motion.span
              key={k}
              className={`inline-block ${charClassName}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.8, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0, transition: { duration: 0.12 } } : {
                opacity: 0,
                y: 34 + (i % 4) * 7,
                x: (i % 2 ? 1 : -1) * (4 + (i % 3) * 5),
                scale: 0.72,
                rotate: (i % 2 ? 1 : -1) * (10 + (i % 5) * 6),
                filter: "blur(4px)",
                transition: { duration: 0.42, ease: [0.4, 0, 1, 1] },   // gravity-ish
              }}
              transition={{ duration: reduced ? 0.12 : 0.24, ease: EASE }}
            >
              {masked ? "•" : c === " " ? " " : c}
            </motion.span>
          ))}
        </AnimatePresence>
        {!chars.length && placeholder && (
          <span className="opacity-30">{placeholder}</span>
        )}
      </div>

      {/* The real field. Transparent text, visible caret. */}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={type}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        onChange={(e) => onChange?.(e.target.value, e)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        data-testid={testId}
        aria-label={placeholder || name}
        className={`relative w-full bg-transparent outline-none ${inputClassName}`}
        style={{ color: "transparent", caretColor: "#C97B4A" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * FallingList — the same physics for removable chips/rows.
 * ------------------------------------------------------------------ */
export function FallingList({ children, className = "" }) {
  return (
    <div className={className}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}

export function FallingItem({ children, className = "", index = 0 }) {
  const reduced = useReducedMotionPref();
  return (
    <motion.div
      layout={!reduced}
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : {
        opacity: 0, y: 40, scale: 0.85,
        rotate: (index % 2 ? 1 : -1) * 8,
        transition: { duration: 0.38, ease: [0.4, 0, 1, 1] },
      }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Scramble — a heading decodes into place. Reads as "resolving a signal",
 * which is what the recogniser does, so it earns its place here.
 * ------------------------------------------------------------------ */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\|<>[]{}=+*";

export function Scramble({ text, className = "", speed = 28, delay = 0, once = true }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-12% 0px" });
  const [shown, setShown] = useState(reduced ? text : "");

  useEffect(() => {
    if (reduced || !inView) { if (reduced) setShown(text); return undefined; }
    const target = String(text);
    let frame = 0;
    let timer = null;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        frame++;
        const settled = Math.floor(frame / 2);
        setShown(
          target
            .split("")
            .map((ch, i) => {
              if (i < settled) return ch;
              if (ch === " ") return " ";
              return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            })
            .join("")
        );
        if (settled >= target.length) clearInterval(timer);
      }, speed);
    }, delay * 1000);
    return () => { clearTimeout(start); if (timer) clearInterval(timer); };
  }, [text, inView, reduced, speed, delay]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden="true">{shown || " "}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Parallax — moves at a different rate to the scroll. Depth cue.
 * ------------------------------------------------------------------ */
export function Parallax({ children, distance = 60, className = "" }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  const smooth = useSpring(y, { stiffness: 90, damping: 26, mass: 0.4 });

  return (
    <motion.div ref={ref} className={className} style={reduced ? undefined : { y: smooth }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * ScrollSkew — content leans in the direction you are scrolling, and
 * straightens when you stop. Gives the page a sense of weight.
 * ------------------------------------------------------------------ */
export function ScrollSkew({ children, className = "", intensity = 1 }) {
  const reduced = useReducedMotionPref();
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { stiffness: 250, damping: 42, mass: 0.35 });
  const skew = useTransform(smooth, [-2200, 0, 2200], [-3.2 * intensity, 0, 3.2 * intensity], {
    clamp: true,
  });

  return (
    <motion.div className={className} style={reduced ? undefined : { skewY: skew }}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * ScrollScene — pins a block and reports 0..1 progress through it, so a
 * visual can be driven by scroll position rather than by time.
 * ------------------------------------------------------------------ */
export function ScrollScene({ children, height = "220vh", className = "" }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const [p, setP] = useState(0);
  useEffect(() => scrollYProgress.on("change", setP), [scrollYProgress]);

  return (
    <div ref={ref} style={{ height }} className={`relative ${className}`}>
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        {typeof children === "function" ? children(p) : children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Marquee — an endless ribbon. Used for the vocabulary strip, where the
 * point is that there are more words than fit on screen.
 * ------------------------------------------------------------------ */
export function Marquee({ children, speed = 40, reverse = false, className = "", pauseOnHover = true }) {
  const reduced = useReducedMotionPref();
  const [paused, setPaused] = useState(false);

  if (reduced) {
    return <div className={`overflow-hidden ${className}`}>
      <div className="flex gap-8 whitespace-nowrap">{children}</div>
    </div>;
  }

  return (
    <div
      className={`overflow-hidden ${className}`}
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
    >
      <motion.div
        className="flex gap-8 whitespace-nowrap w-max"
        animate={paused ? {} : { x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: speed, ease: "linear", repeat: Infinity }}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Spotlight — a card that lights up where the cursor is.
 * ------------------------------------------------------------------ */
export function Spotlight({ children, className = "", color = "rgba(201,123,74,0.16)", size = 320 }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const x = useMotionValue(-999);
  const y = useMotionValue(-999);
  const [on, setOn] = useState(false);

  const onMove = (e) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set(e.clientX - r.left);
    y.set(e.clientY - r.top);
  };

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={onMove}
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
    >
      {!reduced && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            left: x, top: y, width: size, height: size,
            translateX: "-50%", translateY: "-50%",
            background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
          }}
          animate={{ opacity: on ? 1 : 0 }}
          transition={{ duration: 0.25 }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * LandmarkCursor — the pointer becomes a hand landmark over interactive
 * elements. On-theme, and a genuine affordance: it tells you what is
 * clickable without changing the element itself.
 * ------------------------------------------------------------------ */
export function LandmarkCursor() {
  const reduced = useReducedMotionPref();
  const x = useMotionValue(-99);
  const y = useMotionValue(-99);
  const sx = useSpring(x, { stiffness: 900, damping: 45, mass: 0.25 });
  const sy = useSpring(y, { stiffness: 900, damping: 45, mass: 0.25 });
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reduced) return undefined;
    if (window.matchMedia("(pointer: coarse)").matches) return undefined;

    const move = (e) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
      const el = e.target instanceof Element ? e.target.closest("a,button,input,select,textarea,[role=button]") : null;
      setActive(!!el);
    };
    const leave = () => setVisible(false);
    window.addEventListener("mousemove", move, { passive: true });
    document.addEventListener("mouseleave", leave);
    return () => {
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseleave", leave);
    };
  }, [x, y, reduced]);

  if (reduced || !visible) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed z-[70]"
      style={{ left: sx, top: sy, translateX: "-50%", translateY: "-50%" }}
    >
      <motion.div
        animate={{ scale: active ? 1 : 0.55, opacity: active ? 1 : 0.45 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
      >
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="17" r="12" fill="none" stroke="#C97B4A" strokeWidth="1" opacity="0.55" />
          {/* Five points, spaced like fingertips around the ring. */}
          {[0, 1, 2, 3, 4].map((i) => {
            const a = -Math.PI / 2 + (i - 2) * 0.42;
            return (
              <circle key={i} cx={17 + Math.cos(a) * 12} cy={17 + Math.sin(a) * 12}
                r="1.6" fill="#6EE7F2" />
            );
          })}
          <circle cx="17" cy="17" r="2" fill="#C97B4A" />
        </svg>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Typewriter — types a string, then deletes it and moves to the next.
 * The deletion uses the same falling characters as FallingInput.
 * ------------------------------------------------------------------ */
export function Typewriter({ words = [], className = "", charClassName = "", typeMs = 62, holdMs = 1700 }) {
  const reduced = useReducedMotionPref();
  const [text, setText] = useState(reduced ? (words[0] ?? "") : "");
  const [wi, setWi] = useState(0);
  const seq = useRef(0);
  const [chars, setChars] = useState([]);

  useEffect(() => {
    if (reduced || !words.length) return undefined;
    const target = words[wi % words.length];
    let i = 0;
    let timer = null;
    let holdTimer = null;

    const typeNext = () => {
      i++;
      setText(target.slice(0, i));
      if (i < target.length) {
        timer = setTimeout(typeNext, typeMs);
      } else {
        holdTimer = setTimeout(() => {
          const eraseNext = () => {
            i--;
            setText(target.slice(0, Math.max(0, i)));
            if (i > 0) timer = setTimeout(eraseNext, typeMs * 0.5);
            else setWi((v) => v + 1);
          };
          eraseNext();
        }, holdMs);
      }
    };
    timer = setTimeout(typeNext, typeMs);
    return () => { clearTimeout(timer); clearTimeout(holdTimer); };
  }, [wi, words, reduced, typeMs, holdMs]);

  useLayoutEffect(() => {
    setChars((prev) => {
      const next = [];
      let i = 0;
      while (i < text.length && i < prev.length && prev[i].c === text[i]) { next.push(prev[i]); i++; }
      for (; i < text.length; i++) next.push({ c: text[i], k: `t${seq.current++}` });
      return next;
    });
  }, [text]);

  return (
    <span className={className}>
      <AnimatePresence initial={false}>
        {chars.map(({ c, k }, i) => (
          <motion.span
            key={k}
            className={`inline-block ${charClassName}`}
            initial={reduced ? {} : { opacity: 0, y: -12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? {} : {
              opacity: 0, y: 30, rotate: (i % 2 ? 1 : -1) * 12, scale: 0.75,
              transition: { duration: 0.36, ease: [0.4, 0, 1, 1] },
            }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {c === " " ? " " : c}
          </motion.span>
        ))}
      </AnimatePresence>
      {!reduced && (
        <motion.span
          className="inline-block w-[2px] h-[0.95em] align-middle bg-copper ml-1"
          animate={{ opacity: [1, 1, 0, 0] }}
          transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
        />
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * useKeystrokes — a small hook that turns an input's events into the
 * imperative calls the 3-D hand wants. Keeps pages free of key handling.
 * ------------------------------------------------------------------ */
export function useKeystrokes(handRef) {
  return useMemo(() => ({
    onKeyDown(e) {
      const h = handRef?.current;
      if (!h) return;
      if (e.key === "Backspace" || e.key === "Delete") h.sweep();
      else if (e.key.length === 1) h.press(e.key);
    },
  }), [handRef]);
}

/* ------------------------------------------------------------------ *
 * useCountUp — numeric easing as a value, for callers that need the
 * number rather than a rendered span.
 * ------------------------------------------------------------------ */
export function useCountUp(value, duration = 0.9) {
  const reduced = useReducedMotionPref();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced || value == null) { setShown(value); return undefined; }
    const start = performance.now();
    const a = from.current;
    const b = Number(value) || 0;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      setShown(a + (b - a) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return shown;
}

/* ------------------------------------------------------------------ *
 * ScrollSpine — a vertical progress rail drawn as a hand skeleton, so the
 * page's own scroll indicator is made of the thing the project is about.
 * ------------------------------------------------------------------ */
export function ScrollSpine() {
  const reduced = useReducedMotionPref();
  const { scrollYProgress } = useScroll();
  const [p, setP] = useState(0);
  useEffect(() => scrollYProgress.on("change", setP), [scrollYProgress]);

  const dots = 12;
  const lit = Math.round(p * dots);

  if (reduced) return null;

  return (
    <div className="fixed right-5 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center gap-2 pointer-events-none">
      <div className="w-px h-16 bg-gradient-to-b from-transparent to-cream/15" />
      {Array.from({ length: dots }).map((_, i) => (
        <motion.span
          key={i}
          className="block rounded-full"
          animate={{
            width: i < lit ? 7 : 4,
            height: i < lit ? 7 : 4,
            backgroundColor: i < lit ? "#C97B4A" : "rgba(242,236,224,0.18)",
          }}
          transition={{ duration: 0.25, ease: EASE }}
        />
      ))}
      <div className="w-px h-16 bg-gradient-to-t from-transparent to-cream/15" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Reveal-on-scroll for tabular rows, staggered by index.
 * ------------------------------------------------------------------ */
export function RowReveal({ children, index = 0, className = "" }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-6% 0px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: -14 }}
      animate={inView ? { opacity: 1, x: 0 } : undefined}
      transition={{ duration: 0.42, delay: Math.min(index * 0.035, 0.5), ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * useHoverSign — hovering a word plays that sign on a shared 3-D hand.
 * Debounced, so sweeping the cursor across a list does not thrash the
 * network or flicker the rig.
 * ------------------------------------------------------------------ */
export function useHoverSign(handRef, fetchFrames, { delay = 220 } = {}) {
  const timer = useRef(null);
  const cache = useRef(new Map());

  const enter = useCallback((word) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const h = handRef?.current;
      if (!h) return;
      let frames = cache.current.get(word);
      if (!frames) {
        frames = await fetchFrames(word);
        if (frames) cache.current.set(word, frames);
      }
      if (frames) h.playSign(frames.frames, { ...frames.meta, label: word, loop: true });
    }, delay);
  }, [handRef, fetchFrames, delay]);

  const leave = useCallback(() => {
    clearTimeout(timer.current);
    handRef?.current?.stopSign();
  }, [handRef]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { enter, leave };
}
