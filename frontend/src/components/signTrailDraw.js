/**
 * The actual painting for SignTrail, as a pure function.
 *
 * Split out of the component so a node script can render the SAME code to a
 * PNG and be looked at. The first version of this was verified by counting
 * draw calls and by a Python re-implementation, and both lied: the call
 * counter cannot see that a stroke is ugly, and the Python version used a real
 * Gaussian blur where the canvas used wide low-alpha strokes. The output on
 * screen was scratchy in a way neither check could catch.
 *
 * Three things make the difference between "scratches" and a drawn mark:
 *
 *   1. SMOOTHING. A trimmed clip is ~9 frames, so a raw path is 8 straight
 *      segments — a zigzag, not a curve. Catmull-Rom resampling to ~14 points
 *      per segment turns it into something a hand could actually have traced.
 *   2. REAL BLUR. ctx.filter = "blur(Npx)" on an offscreen pass, not a stack
 *      of translucent wide strokes. This is what produces glow rather than
 *      grey fuzz.
 *   3. NO WRIST TRACK. The wrist travels furthest and carries the least
 *      information, so it dominated every image as one long streak. The sign
 *      lives in the fingers.
 */

export const TIPS = [4, 8, 12, 16, 20];
const COPPER = [201, 123, 74];
const CYAN = [110, 231, 242];
const CREAM = [242, 236, 224];

const lerp = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ------------------------------------------------------------------ *
 * Catmull-Rom: a spline through every control point, so the curve
 * actually passes through the recorded landmark positions rather than
 * being pulled off them the way a Bezier would.
 * ------------------------------------------------------------------ */
function smooth(points, per = 14) {
  const n = points.length;
  if (n < 3) return points.slice();
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= n ? n - 1 : i + 2];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
          + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
          + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
          + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
          + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[n - 1]);
  return out;
}

/**
 * Pull smoothed fingertip tracks out of a frame list.
 * The wrist is deliberately excluded — see the header.
 */
export function buildTracks(frames, hands) {
  const tracks = [];
  for (const hand of hands) {
    for (const idx of TIPS) {
      const pts = [];
      for (const f of frames) {
        const a = f?.[hand];
        if (!a || a.length < 42) continue;
        pts.push([a[idx * 2], a[idx * 2 + 1]]);
      }
      if (pts.length > 2) tracks.push({ hand, idx, pts: smooth(pts) });
    }
  }
  return tracks;
}

export function fitBox(tracks, pad = 0.2) {
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
  const span = Math.max(maxX - minX, maxY - minY, 1) * (1 + pad * 2);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, span };
}

/**
 * Paint one frame.
 *
 * @param ctx      destination 2-D context
 * @param scratch  a second 2-D context the same size, used for the glow pass.
 *                 Pass null to skip the glow (cheap mode).
 */
export function paint(ctx, scratch, opts) {
  const {
    w, h, tracks, box, head = 1, unitScale = 1,
    offsetX = 0, offsetY = 0,
  } = opts;

  ctx.clearRect(0, 0, w, h);
  if (!tracks?.length || !box) return;

  const size = Math.min(w, h);
  const scale = (size * 0.9) / box.span;
  const ox = w / 2 + offsetX;
  const oy = h / 2 + offsetY;
  const toPx = ([x, y]) => [(x - box.cx) * scale + ox, (y - box.cy) * scale + oy];
  const unit = Math.max(1.2, size / 300) * unitScale;

  // --- geometry, computed once and reused by both passes
  const paths = tracks.map((t) => {
    const px = t.pts.map(toPx);
    const visible = Math.max(1, Math.floor(head * (px.length - 1)));
    return { px, visible };
  });

  const strokeAll = (context, widthMul, alphaMul) => {
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const { px, visible } of paths) {
      const n = px.length;
      // One path per colour band rather than per segment: far fewer draw
      // calls, and the joins stay smooth.
      const BANDS = 12;
      for (let b = 0; b < BANDS; b++) {
        const from = Math.floor((b / BANDS) * visible);
        const to = Math.min(visible, Math.ceil(((b + 1) / BANDS) * visible));
        if (to - from < 1) continue;
        const t = (b + 0.5) / BANDS;
        const col = lerp(COPPER, CYAN, t);
        context.strokeStyle = rgba(col, alphaMul);
        context.lineWidth = unit * widthMul * (0.45 + 0.55 * (t / Math.max(head, 0.001)));
        context.beginPath();
        context.moveTo(px[from][0], px[from][1]);
        for (let i = from + 1; i <= to; i++) context.lineTo(px[i][0], px[i][1]);
        context.stroke();
      }
    }
  };

  // --- glow: draw fat, blur it hard, composite additively
  if (scratch) {
    scratch.clearRect(0, 0, w, h);
    scratch.filter = "blur(14px)";
    strokeAll(scratch, 3.4, 0.55);
    scratch.filter = "blur(34px)";
    strokeAll(scratch, 5.5, 0.4);
    scratch.filter = "none";

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(scratch.canvas, 0, 0);
  }

  // --- core: a thin bright line on top
  ctx.globalCompositeOperation = "lighter";
  strokeAll(ctx, 0.55, 0.95);

  // --- the head of each stroke
  for (const { px, visible } of paths) {
    const [hx, hy] = px[visible];
    const r = unit * 1.5;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 6);
    g.addColorStop(0, rgba(CREAM, 0.9));
    g.addColorStop(0.3, rgba(CYAN, 0.28));
    g.addColorStop(1, rgba(CYAN, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}
