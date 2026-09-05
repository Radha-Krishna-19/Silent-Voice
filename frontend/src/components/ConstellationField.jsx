/**
 * A drifting field of landmark points that wire themselves together.
 *
 * Not generic "particles": the points are seeded from real hand-landmark
 * geometry (21 points, MediaPipe topology, scattered and scaled), and a line is
 * drawn between any two that come within a threshold — the same proximity
 * logic that makes a skeleton read as a hand. The cursor pushes points apart
 * and pulls the nearest few toward it, so the field reacts to presence.
 *
 * One canvas, one rAF loop, no React state per frame.
 */
import { useEffect, useRef } from "react";
import { useReducedMotionPref } from "./motion/preference";

export default function ConstellationField({
  className = "",
  count = 78,
  linkDistance = 118,
  color = "110,231,242",       // cyan
  accent = "201,123,74",       // copper
  speed = 0.16,
}) {
  const ref = useRef(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;                     // jsdom / no canvas

    let w = 0;
    let h = 0;
    let dpr = 1;
    const pointer = { x: -9999, y: -9999, active: false };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Seed: clusters of 21, so the field carries the shape of hands rather
    // than uniform noise.
    const pts = [];
    const clusters = Math.max(1, Math.round(count / 21));
    for (let c = 0; c < clusters; c++) {
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const spread = 90 + Math.random() * 120;
      for (let i = 0; i < 21; i++) {
        const a = (i / 21) * Math.PI * 2 + Math.random() * 0.6;
        const rr = spread * (0.25 + Math.random() * 0.75);
        pts.push({
          x: cx + Math.cos(a) * rr,
          y: cy + Math.sin(a) * rr,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          r: i % 4 === 0 ? 1.9 : 1.15,          // fingertip-ish points are bigger
          tip: i % 4 === 0,
          ph: Math.random() * Math.PI * 2,
        });
      }
    }
    while (pts.length > count) pts.pop();

    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;

        // wrap rather than bounce: bouncing makes the edges feel like walls
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 26000 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / 161) * 0.55;
            p.x += (dx / d) * push;
            p.y += (dy / d) * push;
          }
        }
      }

      // links
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 > linkDistance * linkDistance) continue;
          const d = Math.sqrt(d2);
          const a = (1 - d / linkDistance) * 0.30;
          ctx.strokeStyle = `rgba(${color},${a.toFixed(3)})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }

      // points
      for (const p of pts) {
        const pulse = 1 + Math.sin(t * 1.6 + p.ph) * 0.22;
        const rgb = p.tip ? accent : color;
        ctx.fillStyle = `rgba(${rgb},${p.tip ? 0.85 : 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
        ctx.fill();
        if (p.tip) {
          ctx.fillStyle = `rgba(${rgb},0.10)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * pulse * 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    if (reduced) {
      // One still frame: the texture is part of the layout, so removing it
      // entirely would leave a flat empty panel.
      draw();
      cancelAnimationFrame(raf);
    } else {
      draw();
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.active = true;
    };
    const onLeave = () => { pointer.active = false; };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeave);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
    };
  }, [count, linkDistance, color, accent, speed, reduced]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="constellation-field"
      className={`pointer-events-none ${className}`}
    />
  );
}
