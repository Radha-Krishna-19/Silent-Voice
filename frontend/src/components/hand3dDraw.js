/**
 * Pure drawing/geometry for Hand3D.jsx. Kept free of React so it can be
 * rendered and checked in Node (scripts/hand3dcheck.mjs).
 */
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],            // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],            // index
  [9, 10], [10, 11], [11, 12],               // middle
  [13, 14], [14, 15], [15, 16],              // ring
  [0, 17], [17, 18], [18, 19], [19, 20],     // pinky
  [5, 9], [9, 13], [13, 17],                 // knuckle line
];
const FINGER_OF = (j) => (j <= 4 ? 0 : j <= 8 ? 1 : j <= 12 ? 2 : j <= 16 ? 3 : 4);
const COLORS = [
  [201, 123, 74],   // thumb  — copper
  [110, 231, 242],  // index  — cyan
  [242, 236, 224],  // middle — cream
  [154, 208, 168],  // ring   — sage
  [180, 156, 242],  // pinky  — lilac
];
const PALM = [0, 1, 5, 9, 13, 17];
const TIPS = new Set([4, 8, 12, 16, 20]);
export const END_HOLD_S = 0.6;   // pause on the last frame so the final handshape can be read

export function prepHand(frames, off, aspect) {
  const T = frames.length;
  const raw = new Array(T);
  let present = 0;
  for (let t = 0; t < T; t++) {
    const f = frames[t];
    let any = false;
    for (let k = off; k < off + 63; k++) if (f[k] !== 0) { any = true; break; }
    if (!any) { raw[t] = null; continue; }
    present++;
    const pts = new Array(21);
    for (let j = 0; j < 21; j++) {
      const b = off + j * 3;
      // mirror (-x) and restore true proportions (x, z in width units)
      pts[j] = [-f[b] * aspect, f[b + 1], f[b + 2] * aspect];
    }
    raw[t] = pts;
  }
  if (present < Math.max(2, T * 0.1)) return null;

  // hold through dropouts: forward fill, then back fill the head
  let last = null;
  for (let t = 0; t < T; t++) { if (raw[t]) last = raw[t]; else raw[t] = last; }
  let next = null;
  for (let t = T - 1; t >= 0; t--) { if (raw[t]) next = raw[t]; else raw[t] = next; }

  // temporal smoothing, binomial 5-tap
  const W = [1, 4, 6, 4, 1];
  const out = new Array(T);
  for (let t = 0; t < T; t++) {
    const pts = new Array(21);
    for (let j = 0; j < 21; j++) {
      let x = 0, y = 0, z = 0, s = 0;
      for (let k = -2; k <= 2; k++) {
        const tt = Math.min(T - 1, Math.max(0, t + k));
        const p = raw[tt][j];
        const w = W[k + 2];
        x += p[0] * w; y += p[1] * w; z += p[2] * w; s += w;
      }
      pts[j] = [x / s, y / s, z / s];
    }
    out[t] = pts;
  }

  // Size + position, per frame. Wrist-relative image coords shrink whenever the
  // hand turns edge-on or moves away, so a fixed scale makes it pulse in size and
  // often renders it tiny. Instead: centre each frame on the palm and divide by
  // the palm length (wrist -> middle knuckle, 3-D), smoothed over time so the
  // size does not flicker. The hand stays big, centred and readable.
  const PALM_IDX = [0, 5, 9, 13, 17];
  const lens = out.map((pts) => Math.hypot(pts[9][0] - pts[0][0], pts[9][1] - pts[0][1], pts[9][2] - pts[0][2]));
  const sm = lens.map((_, t) => {
    let s = 0, n = 0;
    for (let k = -1; k <= 1; k++) {
      const v = lens[Math.min(T - 1, Math.max(0, t + k))];
      if (v > 1e-4) { s += v; n++; }
    }
    return n ? s / n : 1;
  });
  let r = 1e-6;
  for (let t = 0; t < T; t++) {
    const pts = out[t];
    let cx = 0, cy = 0, cz = 0;
    for (const j of PALM_IDX) { cx += pts[j][0]; cy += pts[j][1]; cz += pts[j][2]; }
    cx /= 5; cy /= 5; cz /= 5;
    const L = sm[t] || 1;
    for (const p of pts) {
      p[0] = (p[0] - cx) / L; p[1] = (p[1] - cy) / L; p[2] = (p[2] - cz) / L;
      r = Math.max(r, Math.hypot(p[0], p[1], p[2]));
    }
  }
  // one scale for the clip; never zoom in past ~2 palm lengths
  r = Math.max(r, 1.9);
  for (const pts of out) for (const p of pts) { p[0] /= r; p[1] /= r; p[2] /= r; }
  return { frames: out, coverage: present / T };
}

export function project(p, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = p[1] * cp - z1 * sp;
  const z2 = p[1] * sp + z1 * cp;
  const D = 3.2;
  const f = D / (D + z2);              // MediaPipe: smaller z = nearer the camera
  return [x1 * f, y2 * f, z2, f];
}

export function drawHand(ctx, pts, cx, cy, R, yaw, pitch) {
  const P = pts.map((p) => project(p, yaw, pitch));
  const sx = (q) => cx + q[0] * R;
  const sy = (q) => cy + q[1] * R;

  // palm: a translucent plate gives the hand body and makes orientation obvious
  ctx.beginPath();
  PALM.forEach((j, i) => (i ? ctx.lineTo(sx(P[j]), sy(P[j])) : ctx.moveTo(sx(P[j]), sy(P[j]))));
  ctx.closePath();
  ctx.fillStyle = "rgba(242,236,224,0.07)";
  ctx.fill();

  // bones far -> near
  const order = BONES.map(([a, b], i) => [i, (P[a][2] + P[b][2]) / 2]).sort((u, v) => v[1] - u[1]);
  ctx.lineCap = "round";
  for (const [i, depth] of order) {
    const [a, b] = BONES[i];
    const col = COLORS[FINGER_OF(b)];
    const f = (P[a][3] + P[b][3]) / 2;
    const light = Math.max(0.35, Math.min(1, 0.8 - depth * 0.35));
    ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${light.toFixed(3)})`;
    ctx.lineWidth = Math.max(2.5, R * 0.075 * f);
    ctx.beginPath();
    ctx.moveTo(sx(P[a]), sy(P[a]));
    ctx.lineTo(sx(P[b]), sy(P[b]));
    ctx.stroke();
  }

  // joints near-last
  const jo = P.map((q, j) => [j, q[2]]).sort((u, v) => v[1] - u[1]);
  for (const [j] of jo) {
    const q = P[j];
    const col = j === 0 ? [242, 236, 224] : COLORS[FINGER_OF(j)];
    const rad = Math.max(2.5, R * (TIPS.has(j) ? 0.05 : j === 0 ? 0.065 : 0.042) * q[3]);
    const x = sx(q), y = sy(q);
    if (TIPS.has(j)) {
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.16)`;
      ctx.beginPath();
      ctx.arc(x, y, rad * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // shaded sphere: highlight up-left, so joints read as round, not flat dots
    const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.35, `rgb(${col[0]},${col[1]},${col[2]})`);
    g.addColorStop(1, `rgb(${Math.round(col[0] * 0.45)},${Math.round(col[1] * 0.45)},${Math.round(col[2] * 0.45)})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

