/**
 * A sign, drawn as light.
 *
 * Instead of rendering a skeleton, this draws only the PATHS the fingertips and
 * wrist travel through — the way a long-exposure photograph of someone signing
 * with lights on their fingers would look. The stroke is laid down over time,
 * so you watch the sign being written.
 *
 * Why paths instead of a skeleton
 * -------------------------------
 * A skeleton has joints, and joints can look anatomically wrong. Monocular
 * landmark data has no depth, so a rendered hand is always a flat approximation
 * that reads as slightly broken. A trajectory has no such failure mode: it is
 * just where the hand went, which is exactly what the data measures. It is also
 * a truer picture of what a sign IS — handshape plus movement — than a frozen
 * pose ever is.
 *
 * Everything drawn is real recorded landmark data from the INCLUDE dataset,
 * trimmed to the signing window by ml/scripts/trim_sign_bank.py. The path is
 * spline-resampled for drawing (a 9-frame clip is otherwise 8 straight
 * segments), but no position is invented — the curve passes through every
 * recorded point.
 *
 * Used on Reverse and Practice, where you are choosing to inspect what the
 * model actually saw. It is NOT used as decoration on the marketing pages: the
 * data is 9 frames of monocular tracking from a wide shot, and rendering it
 * large is honest but not handsome. See VocabularyWall for what the heroes use.
 *
 * The painting itself lives in signTrailDraw.js so a node script can render
 * the identical code to a PNG and be looked at.
 */
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from "react";
import { useReducedMotionPref } from "./motion/preference";

import { buildTracks, fitBox, paint } from "./signTrailDraw";

const SignTrail = forwardRef(function SignTrail(
  {
    className = "",
    frames = null,
    activeHands = null,
    // 0..1; when null the trail draws itself on a timer
    progress = null,
    loop = true,
    speed = 1,
    lineScale = 1,
    showParticles = true,
    onCycle,
  },
  ref
) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ frames: null, hands: null, tracks: [], box: null, t: 0 });
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const reduced = useReducedMotionPref();
  const [, force] = useState(0);

  // ---- ingest new frames -------------------------------------------
  useEffect(() => {
    const s = stateRef.current;
    const hands = activeHands?.length ? activeHands : ["l", "r"];
    s.frames = frames;
    s.hands = hands;
    s.tracks = frames?.length ? buildTracks(frames, hands) : [];
    // If cropping to the active hand yielded nothing usable, fall back to both
    // rather than rendering an empty canvas.
    if (!s.tracks.length && frames?.length) {
      s.tracks = buildTracks(frames, ["l", "r"]);
    }
    s.box = s.tracks.length ? fitBox(s.tracks) : null;
    s.t = 0;
    force((n) => n + 1);
  }, [frames, activeHands]);

  // ---- render loop --------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;                 // jsdom / canvas unavailable

    // The glow is a real Gaussian blur on an offscreen pass, not a stack of
    // wide translucent strokes. That difference is the whole reason the first
    // version looked like scratches on screen while every check passed.
    const scratch = document.createElement("canvas");
    const scratchCtx = scratch.getContext("2d");

    let raf = 0;
    let w = 0;
    let h = 0;

    // Measure defensively. A canvas whose own box has collapsed still has a
    // laid-out ancestor almost all the time, and silently painting into a 0x0
    // buffer is the worst failure mode there is: everything "works", nothing
    // appears. If we cannot find a real size, say so once in the console rather
    // than rendering nothing in silence.
    let warned = false;
    const measure = () => {
      const own = canvas.getBoundingClientRect();
      if (own.width >= 2 && own.height >= 2) return own;
      const parent = canvas.parentElement?.getBoundingClientRect();
      if (parent && parent.width >= 2 && parent.height >= 2) return parent;
      const grand = canvas.parentElement?.parentElement?.getBoundingClientRect();
      if (grand && grand.width >= 2 && grand.height >= 2) return grand;
      if (!warned) {
        warned = true;
        // eslint-disable-next-line no-console
        console.warn(
          "[SignTrail] the canvas and its ancestors have no measurable size, so " +
          "nothing can be drawn. Check for a container with collapsed height " +
          "(a common cause is combining `relative` and `absolute inset-0` on one " +
          "element — Tailwind's `.relative` wins and the box stops being sized)."
        );
      }
      return null;
    };

    const resize = () => {
      const r = measure();
      if (!r) { w = 0; h = 0; return; }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      scratchCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let last = performance.now();

    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = stateRef.current;

      // The box can arrive after mount (fonts, images, a late layout pass), so
      // keep trying rather than giving up on the first zero measurement.
      if (w < 2 || h < 2) {
        resize();
        raf = requestAnimationFrame(draw);
        return;
      }

      if (!s.tracks.length || !s.box) {
        ctx.clearRect(0, 0, w, h);
        raf = requestAnimationFrame(draw);
        return;
      }

      // advance the write-on head
      if (progress == null) {
        if (reduced) s.t = 1;
        else {
          s.t += dt * 0.42 * speed;
          if (s.t > 1.32) {                     // brief hold on the finished mark
            if (loop) { s.t = 0; onCycle?.(); }
            else s.t = 1.32;
          }
        }
      } else {
        s.t = progress;
      }

      // parallax: the whole mark leans a little toward the cursor
      const p = pointerRef.current;
      p.x += (p.tx - p.x) * 0.06;
      p.y += (p.ty - p.y) * 0.06;

      const size = Math.min(w, h);
      paint(ctx, showParticles ? scratchCtx : null, {
        w, h,
        tracks: s.tracks,
        box: s.box,
        head: Math.min(1, s.t),
        unitScale: lineScale,
        offsetX: p.x * size * 0.035,
        offsetY: p.y * size * 0.028,
      });

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [progress, loop, speed, lineScale, showParticles, reduced, onCycle]);

  useImperativeHandle(ref, () => ({
    setPointer(x, y) {
      pointerRef.current.tx = x;
      pointerRef.current.ty = y;
    },
    restart() { stateRef.current.t = 0; },
    /** Jump the write-on head, for scroll-linked drawing. */
    setProgress(v) { stateRef.current.t = v; },
  }), []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-testid="sign-trail"
      aria-hidden="true"
    />
  );
});

export default SignTrail;
