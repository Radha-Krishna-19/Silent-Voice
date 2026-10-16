import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useReducedMotionPref } from "./motion/preference";
import { prepHand, drawHand, END_HOLD_S } from "./hand3dDraw";
import { cn } from "../lib/utils";

/**
 * 3-D hand view of a reference sign, drawn from MediaPipe's xyz hand landmarks
 * (the exact tensor Practice scores against) — no avatar, no guessed geometry.
 *
 *  - x/z are stretched by the source aspect ratio (INCLUDE is 16:9), otherwise
 *    every hand looks squeezed sideways, which is what made handshapes hard to read
 *  - shown mirrored, like the webcam, so the learner copies it as a mirror
 *  - gaps where tracking dropped out are held, then smoothed over time
 *  - perspective projection; bones drawn far-to-near and thicker when nearer
 *  - drag to rotate, auto-sways gently otherwise; play/pause and half speed
 *
 * Plain canvas 2D, ~30 fps, paused when off-screen or the tab is hidden.
 */

export default function Hand3D({
  frames, aspect = 16 / 9, fps = 24, className = "",
  loop = true,          // false: play once, hold the last frame, then call onEnd
  onEnd,
  playing: playingProp, // optional external play/pause (Reverse's button)
  showControls = true,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const reduced = useReducedMotionPref();
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  const barRef = useRef(null);
  const view = useRef({ yaw: 0, pitch: 0.12, drag: null });
  const clock = useRef({ t: 0, last: null });
  const ctl = useRef({ playing: true, slow: false });
  ctl.current = { playing: playingProp ?? playing, slow };
  const endRef = useRef({ onEnd, loop, fired: false });
  endRef.current.onEnd = onEnd;
  endRef.current.loop = loop;

  // signer's left hand is at 0:63, right at 63:126. Mirrored, the right hand
  // shows on the right — exactly where the learner's own right hand appears.
  const hands = useMemo(() => {
    if (!frames?.length) return [];
    const out = [];
    const L = prepHand(frames, 0, aspect);
    const Rh = prepHand(frames, 63, aspect);
    if (L) out.push({ side: "Left hand", ...L });
    if (Rh) out.push({ side: "Right hand", ...Rh });
    return out;
  }, [frames, aspect]);

  useEffect(() => { clock.current = { t: 0, last: null }; endRef.current.fired = false; }, [frames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;                       // jsdom
    let raf = 0;
    let visible = true;
    let lastPaint = 0;
    let w = 0, h = 0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(wrap);

    const T = hands[0]?.frames.length ?? 0;
    const loopS = T / fps + END_HOLD_S;

    const paint = (now) => {
      raf = requestAnimationFrame(paint);
      if (!visible || document.hidden || now - lastPaint < 33) return;
      const dt = clock.current.last == null ? 0 : (now - clock.current.last) / 1000;
      clock.current.last = now;
      lastPaint = now;
      if (ctl.current.playing && T) {
        const next = clock.current.t + dt * (ctl.current.slow ? 0.5 : 1);
        if (endRef.current.loop) {
          clock.current.t = next % loopS;
        } else if (next >= loopS) {
          clock.current.t = loopS;
          if (!endRef.current.fired) {
            endRef.current.fired = true;
            setTimeout(() => endRef.current.onEnd?.(), 0);
          }
        } else {
          clock.current.t = next;
        }
      }
      const ti = Math.min(T - 1, Math.floor(clock.current.t * fps));

      const v = view.current;
      const sway = reduced || v.drag ? 0 : Math.sin(now / 2200) * 0.38;

      ctx.clearRect(0, 0, w, h);
      // floor grid for depth cues
      ctx.strokeStyle = "rgba(242,236,224,0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = h * (0.62 + i * 0.07);
        ctx.beginPath(); ctx.moveTo(w * 0.05, y); ctx.lineTo(w * 0.95, y); ctx.stroke();
      }

      if (!hands.length) return;
      const n = hands.length;
      hands.forEach((hand, i) => {
        const cx = (w / n) * (i + 0.5);
        const cy = h * 0.46;
        const R = Math.min((w / n) * 0.62, h * 0.4);
        drawHand(ctx, hand.frames[ti], cx, cy, R, v.yaw + sway, v.pitch);
        ctx.fillStyle = "rgba(242,236,224,0.35)";
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(hand.side.toUpperCase(), cx, h * 0.12);
      });
      if (T && barRef.current) barRef.current.style.width = `${Math.min(1, clock.current.t / (T / fps)) * 100}%`;
    };
    raf = requestAnimationFrame(paint);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [hands, fps, reduced]);

  const onDown = (e) => {
    view.current.drag = { x: e.clientX, y: e.clientY, yaw: view.current.yaw, pitch: view.current.pitch };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = view.current.drag;
    if (!d) return;
    view.current.yaw = d.yaw + (e.clientX - d.x) * 0.01;
    view.current.pitch = Math.max(-1.2, Math.min(1.2, d.pitch + (e.clientY - d.y) * 0.01));
  };
  const onUp = () => { view.current.drag = null; };
  const reset = () => { view.current.yaw = 0; view.current.pitch = 0.12; };

  return (
    <div ref={wrapRef} className={cn("relative select-none", className)} data-testid="hand3d">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDoubleClick={reset}
      />
      {!hands.length && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-cream/30">
          No hand tracked in this reference.
        </div>
      )}
      {showControls && <div className="absolute top-3 right-3 flex gap-1">
        <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}
          className="focus-ring p-1.5 rounded-sm bg-black/50 text-cream/70 hover:text-cream">
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => setSlow((s) => !s)} aria-label="Toggle half speed"
          className={`focus-ring px-2 rounded-sm text-[10px] tracking-widest ${slow ? "bg-copper text-ink" : "bg-black/50 text-cream/70 hover:text-cream"}`}>
          0.5×
        </button>
        <button onClick={reset} aria-label="Reset view"
          className="focus-ring p-1.5 rounded-sm bg-black/50 text-cream/70 hover:text-cream">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>}
      <div className="absolute left-4 right-4 top-[70%] h-0.5 bg-cream/10 rounded-full overflow-hidden pointer-events-none">
        <div ref={barRef} className="h-full bg-copper" style={{ width: "0%" }} />
      </div>
      <div className="absolute left-0 right-0 top-[72%] text-center text-[9px] uppercase tracking-widest text-cream/25 pointer-events-none">
        drag to rotate · double-click to reset
      </div>
    </div>
  );
}
