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
 * trimmed to the signing window by ml/scripts/trim_sign_bank.py. Nothing is
 * smoothed, interpolated or invented.
 *
 * Canvas 2D on purpose: no WebGL, no 3-D engine, ~4 KB of code.
 */
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from "react";
import { useReducedMotionPref } from "./motion/preference";

const TIPS = [4, 8, 12, 16, 20];
const WRIST = 0;
const COPPER = [201, 123, 74];
const CYAN = [110, 231, 242];
const CREAM = [242, 236, 224];

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * Pull per-landmark tracks out of a frame list.
 * @param hands which hands to include — crop to the working hand so a hand
 *              resting at the signer's hip cannot shrink the view.
 */
function buildTracks(frames, hands) {
  const tracks = [];
  for (const hand of hands) {
    for (const idx of [WRIST, ...TIPS]) {
      const pts = [];
      for (const f of frames) {
        const a = f?.[hand];
        if (!a || a.length < 42) continue;
        pts.push([a[idx * 2], a[idx * 2 + 1]]);
      }
      if (pts.length > 2) tracks.push({ hand, idx, pts, wrist: idx === WRIST });
    }
  }
  return tracks;
}

function fitBox(tracks, pad = 0.18) {
  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  for (const t of tracks) {
    for (const [x, y] of t.pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  const span = Math.max(w, h, 1) * (1 + pad * 2);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, span };
}

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

    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let last = performance.now();

    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = stateRef.current;

      ctx.clearRect(0, 0, w, h);

      if (!s.tracks.length || !s.box) {
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
      const head = Math.min(1, s.t);

      // parallax: the whole mark leans a little toward the cursor
      const p = pointerRef.current;
      p.x += (p.tx - p.x) * 0.06;
      p.y += (p.ty - p.y) * 0.06;

      const size = Math.min(w, h);
      const scale = (size * 0.86) / s.box.span;
      const ox = w / 2 + p.x * size * 0.035;
      const oy = h / 2 + p.y * size * 0.028;
      const toPx = ([x, y]) => [
        (x - s.box.cx) * scale + ox,
        (y - s.box.cy) * scale + oy,
      ];
      const unit = Math.max(1, size / 240) * lineScale;

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const track of s.tracks) {
        const px = track.pts.map(toPx);
        const n = px.length;
        const visible = Math.max(1, Math.floor(head * (n - 1)));

        // three passes: wide soft glow, mid, then a bright core
        const passes = track.wrist
          ? [[unit * 9, 0.045], [unit * 4.2, 0.10], [unit * 1.5, 0.85]]
          : [[unit * 6, 0.040], [unit * 2.8, 0.085], [unit * 0.9, 0.70]];

        for (const [width, alpha] of passes) {
          for (let i = 1; i <= visible; i++) {
            const t = i / (n - 1);
            // colour runs copper -> cyan along the stroke, so you can read
            // the direction of travel at a glance
            const col = lerp(COPPER, CYAN, t);
            // older parts of the stroke fade slightly: the mark has a comet tail
            const age = 1 - Math.max(0, head - t) * 0.55;
            ctx.strokeStyle = rgba(col, alpha * age);
            ctx.lineWidth = width * (0.55 + 0.45 * t);
            ctx.beginPath();
            ctx.moveTo(px[i - 1][0], px[i - 1][1]);
            ctx.lineTo(px[i][0], px[i][1]);
            ctx.stroke();
          }
        }

        // the bright head of the stroke
        if (showParticles && visible >= 1) {
          const [hx, hy] = px[visible];
          const r = (track.wrist ? unit * 2.4 : unit * 1.5);
          const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 5);
          g.addColorStop(0, rgba(CREAM, 0.95));
          g.addColorStop(0.35, rgba(CYAN, 0.35));
          g.addColorStop(1, rgba(CYAN, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(hx, hy, r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = "source-over";
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
