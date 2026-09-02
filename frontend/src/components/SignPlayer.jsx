import { useEffect, useRef, useState, useCallback, useMemo } from "react";

/**
 * Plays back a real signer's skeleton on a canvas.
 *
 * The frames come from ml/data/processed — the same landmark tensors the
 * recogniser was trained on — so what the viewer sees is literally a recording
 * of a human performing that sign, not an animated approximation.
 *
 * Frame shape (from /api/text-to-sign):
 *   { l: [x,y, …21 pts] | null, r: [...] | null, p: [...7 pts] }
 * Coordinates are integers 0..quant in image space; divide by quant.
 */

const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// pose_indices = [nose, L-shoulder, R-shoulder, L-elbow, R-elbow, L-wrist, R-wrist]
const POSE_EDGES = [[1, 2], [1, 3], [3, 5], [2, 4], [4, 6]];

const CYAN = "#6EE7F2";
const COPPER = "#C97B4A";
const CREAM = "#F2ECE0";

export default function SignPlayer({
  items = [],
  fps = 12,
  quant = 1000,
  playing = true,
  loop = true,
  onWordChange,
  className = "",
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const stateRef = useRef({ word: 0, frame: 0, last: 0 });
  const [tick, setTick] = useState(0);

  const playable = items.filter((it) => it.available && it.frames?.length);

  /**
   * Auto-fit the camera to the signer.
   *
   * INCLUDE was filmed wide: the signer occupies only ~18% of frame width, so
   * played back raw the hands are ~9% of the canvas and completely unreadable.
   * We compute one bounding box across the WHOLE sequence (not per frame, or
   * the view would jitter; not per word, or it would jump between signs) and
   * map that box to the canvas.
   */
  const fit = useMemo(() => {
    const xs = [];
    const ys = [];
    playable.forEach((it) =>
      it.frames.forEach((f) => {
        ["l", "r", "p"].forEach((k) => {
          const v = f[k];
          if (!v) return;
          for (let i = 0; i < v.length; i += 2) {
            xs.push(v[i]);
            ys.push(v[i + 1]);
          }
        });
      })
    );
    if (xs.length < 8) return null;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    // Percentiles, not min/max: arms hanging at rest stretch the box vertically
    // and shrink the signing area to nothing. Clipping the extremes keeps the
    // frame on the part of the body that actually carries the sign.
    const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
    let x0 = pct(xs, 0.01);
    let x1 = pct(xs, 0.99);
    let y0 = pct(ys, 0.01);
    let y1 = pct(ys, 0.90);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    const padX = (x1 - x0) * 0.22;
    const padY = (y1 - y0) * 0.12;
    return { x0: x0 - padX, x1: x1 + padX, y0: y0 - padY, y1: y1 + padY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const draw = useCallback(
    (ctx, w, h, frame) => {
      ctx.clearRect(0, 0, w, h);

      // Map the fitted box onto the canvas, preserving aspect ratio, and mirror
      // horizontally so the viewer sees the sign as if facing the signer.
      const bx0 = fit ? fit.x0 : 0;
      const bx1 = fit ? fit.x1 : quant;
      const by0 = fit ? fit.y0 : 0;
      const by1 = fit ? fit.y1 : quant;
      const scale = Math.min(w / (bx1 - bx0), h / (by1 - by0));
      const offX = (w - (bx1 - bx0) * scale) / 2;
      const offY = (h - (by1 - by0) * scale) / 2;

      const X = (v) => w - (offX + (v - bx0) * scale);   // mirrored
      const Y = (v) => offY + (v - by0) * scale;

      // Line weights must scale with the SIGNER, not the canvas: on a wide
      // canvas a width-derived stroke swamps a small figure.
      const unit = scale * quant;

      const pts = (flat) => {
        if (!flat) return null;
        const out = [];
        for (let i = 0; i < flat.length; i += 2) out.push([X(flat[i]), Y(flat[i + 1])]);
        return out;
      };

      const body = pts(frame.p);
      if (body) {
        ctx.strokeStyle = "rgba(242,236,224,0.30)";
        ctx.lineWidth = Math.max(2, unit * 0.010);
        ctx.lineCap = "round";
        POSE_EDGES.forEach(([a, b]) => {
          if (!body[a] || !body[b]) return;
          ctx.beginPath();
          ctx.moveTo(body[a][0], body[a][1]);
          ctx.lineTo(body[b][0], body[b][1]);
          ctx.stroke();
        });
        // head
        const nose = body[0];
        if (nose) {
          const r = Math.max(6, unit * 0.055);
          ctx.beginPath();
          ctx.arc(nose[0], nose[1] - r * 0.2, r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(242,236,224,0.22)";
          ctx.stroke();
        }
      }

      [["l", frame.l], ["r", frame.r]].forEach(([side, flat]) => {
        const hand = pts(flat);
        if (!hand) return;
        ctx.strokeStyle = side === "l" ? CYAN : COPPER;
        ctx.lineWidth = Math.max(2.5, unit * 0.009);
        ctx.shadowColor = side === "l" ? CYAN : COPPER;
        ctx.shadowBlur = unit * 0.03;
        HAND_EDGES.forEach(([a, b]) => {
          if (!hand[a] || !hand[b]) return;
          ctx.beginPath();
          ctx.moveTo(hand[a][0], hand[a][1]);
          ctx.lineTo(hand[b][0], hand[b][1]);
          ctx.stroke();
        });
        ctx.fillStyle = side === "l" ? CYAN : COPPER;
        hand.forEach(([x, y], i) => {
          const tip = [4, 8, 12, 16, 20].includes(i);
          ctx.beginPath();
          ctx.arc(x, y, tip ? unit * 0.016 : unit * 0.011, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.shadowBlur = 0;
      });
    },
    [quant, fit]
  );

  useEffect(() => {
    stateRef.current = { word: 0, frame: 0, last: 0 };
    setTick((t) => t + 1);
  }, [items]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || playable.length === 0) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const interval = 1000 / fps;

    const loopFn = (now) => {
      const st = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const word = playable[Math.min(st.word, playable.length - 1)];
      const frames = word.frames;
      draw(ctx, rect.width, rect.height, frames[Math.min(st.frame, frames.length - 1)]);

      if (playing && now - st.last >= interval) {
        st.last = now;
        st.frame += 1;
        if (st.frame >= frames.length) {
          st.frame = 0;
          const next = st.word + 1;
          if (next >= playable.length) {
            if (loop) st.word = 0;
            else st.word = playable.length - 1;
          } else {
            st.word = next;
          }
          onWordChange?.(playable[st.word]?.label ?? null, st.word);
        }
      }
      rafRef.current = requestAnimationFrame(loopFn);
    };

    rafRef.current = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playable, fps, playing, loop, draw, onWordChange, tick]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="sign-player"
      className={`w-full h-full block ${className}`}
      aria-label="Sign language skeleton playback"
    />
  );
}
