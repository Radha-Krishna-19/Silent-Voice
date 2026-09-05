/**
 * Hand skeleton definition and forward kinematics.
 *
 * Deliberately free of any three.js import: the maths is plain arithmetic, so
 * it can be unit-tested in node without a WebGL context. HandRig.jsx renders
 * what this file computes.
 *
 * Topology is MediaPipe's 21-point hand — the same indices the recogniser is
 * trained on, so a landmark array from the sign bank drops straight in.
 */

export const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const TIP_INDICES = [4, 8, 12, 16, 20];

/**
 * A right hand, palm toward the camera, fingers up. The thumb sits on the left
 * of the screen, which is where a right thumb appears when the palm faces you.
 *
 *   base  MCP knuckle position, relative to the wrist at the origin
 *   dir   direction the extended finger points
 *   len   proximal, middle, distal phalanx lengths
 *   flex  maximum bend (radians) at MCP, PIP, DIP for a full curl
 *   axis  the axis the finger rotates about when curling
 */
export const FINGERS = [
  {
    name: "thumb", joints: [1, 2, 3, 4],
    base: [-0.50, 0.20, 0.10], dir: [-0.42, 0.86, 0.28],
    len: [0.34, 0.27, 0.21], flex: [0.55, 0.95, 0.75], axis: [0.35, 0, 1],
  },
  {
    name: "index", joints: [5, 6, 7, 8],
    base: [-0.19, 0.93, 0.0], dir: [-0.10, 0.99, 0.02],
    len: [0.43, 0.27, 0.20], flex: [1.45, 1.75, 1.20], axis: [1, 0, 0],
  },
  {
    name: "middle", joints: [9, 10, 11, 12],
    base: [0.03, 1.00, 0.0], dir: [0.0, 1.0, 0.0],
    len: [0.47, 0.30, 0.21], flex: [1.45, 1.80, 1.20], axis: [1, 0, 0],
  },
  {
    name: "ring", joints: [13, 14, 15, 16],
    base: [0.25, 0.95, -0.02], dir: [0.10, 0.99, -0.02],
    len: [0.43, 0.28, 0.20], flex: [1.45, 1.78, 1.20], axis: [1, 0, 0],
  },
  {
    name: "pinky", joints: [17, 18, 19, 20],
    base: [0.44, 0.83, -0.05], dir: [0.22, 0.97, -0.04],
    len: [0.34, 0.21, 0.17], flex: [1.40, 1.70, 1.15], axis: [1, 0, 0],
  },
];

export const REST_CURL = 0.16;

/* ------------------------------------------------------------------ *
 * Touch-typing key map. One hand is on screen, so a key belonging to the
 * other hand maps to the mirrored finger — the gesture still reads as
 * "that finger typed that key".
 * ------------------------------------------------------------------ */
export const KEY_FINGER = {};
const assign = (keys, f) => keys.split(" ").forEach((k) => { KEY_FINGER[k] = f; });
assign("q a z 1 p ; ' [ ] \\ 0 - =", 4);        // pinky
assign("w s x 2 o l . 9", 3);                   // ring
assign("e d c 3 i k , 8", 2);                   // middle
assign("r f v t g b 4 5 y h n u j m 6 7", 1);   // index
KEY_FINGER[" "] = 0;                            // thumb

/** Rough horizontal position of a key, 0 (left) to 1 (right). */
export const KEY_X = {};
"1234567890".split("").forEach((c, i) => { KEY_X[c] = i / 9; });
"qwertyuiop".split("").forEach((c, i) => { KEY_X[c] = i / 9; });
"asdfghjkl".split("").forEach((c, i) => { KEY_X[c] = i / 8; });
"zxcvbnm".split("").forEach((c, i) => { KEY_X[c] = i / 6; });

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ *
 * Rodrigues rotation: rotate v about the unit axis k by angle t.
 * Cheaper than building a quaternion and avoids the three.js dependency.
 * ------------------------------------------------------------------ */
function rotate(v, k, t, out) {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cx = k[1] * v[2] - k[2] * v[1];
  const cy = k[2] * v[0] - k[0] * v[2];
  const cz = k[0] * v[1] - k[1] * v[0];
  out[0] = v[0] * c + cx * s + k[0] * dot * (1 - c);
  out[1] = v[1] * c + cy * s + k[1] * dot * (1 - c);
  out[2] = v[2] * c + cz * s + k[2] * dot * (1 - c);
  return out;
}

function norm(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

const _seg = [0, 0, 0];

/**
 * Solve the whole hand.
 *
 * @param {number[]} curls   five values in [0,1]; 0 straight, 1 fully curled
 * @param {number[]} spreads five values in radians; splay about the palm normal
 * @param {number[][]} out   21 x 3, written in place
 */
export function solveHand(curls, spreads, out) {
  out[0][0] = 0; out[0][1] = 0; out[0][2] = 0;      // wrist

  for (let fi = 0; fi < FINGERS.length; fi++) {
    const F = FINGERS[fi];
    const c = clamp(curls[fi] ?? 0, 0, 1.15);
    const sp = spreads[fi] ?? 0;

    const axis = norm(F.axis);
    let dir = norm(F.dir);
    let base = F.base.slice();

    if (sp) {                                       // splay about z
      dir = rotate(dir, [0, 0, 1], sp, [0, 0, 0]);
      base = rotate(base, [0, 0, 1], sp, [0, 0, 0]);
    }

    const j0 = F.joints[0];
    out[j0][0] = base[0]; out[j0][1] = base[1]; out[j0][2] = base[2];

    // Flexion accumulates down the chain: the middle phalanx inherits the
    // knuckle's bend and the distal inherits both. That is what makes a
    // curling finger roll into a fist instead of folding like a hinge.
    let acc = 0;
    for (let s = 0; s < 3; s++) {
      acc += F.flex[s] * c;
      rotate(dir, axis, acc, _seg);
      const m = Math.hypot(_seg[0], _seg[1], _seg[2]) || 1;
      const prev = out[F.joints[s]];
      const next = out[F.joints[s + 1]];
      next[0] = prev[0] + (_seg[0] / m) * F.len[s];
      next[1] = prev[1] + (_seg[1] / m) * F.len[s];
      next[2] = prev[2] + (_seg[2] / m) * F.len[s];
    }
  }
  return out;
}

export function makeBuffer() {
  return Array.from({ length: 21 }, () => [0, 0, 0]);
}

/**
 * Load a sign-bank frame onto the rig.
 *
 * Frames are MediaPipe x,y in image space, quantised to integers. There is no
 * z: the dataset is monocular video, so depth was never measured. We place the
 * points on a plane rather than inventing a third axis.
 *
 * @returns true if the frame contained a usable hand
 */
export function applyFrame(frame, out) {
  const arr = frame?.r?.length === 42 ? frame.r : frame?.l?.length === 42 ? frame.l : null;
  if (!arr) return false;

  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < 42; i += 2) {
    if (arr[i] < minX) minX = arr[i];
    if (arr[i] > maxX) maxX = arr[i];
    if (arr[i + 1] < minY) minY = arr[i + 1];
    if (arr[i + 1] > maxY) maxY = arr[i + 1];
  }
  // Normalise by hand span so any signer fills the same volume regardless of
  // how far they stood from the camera.
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const k = 1.9 / span;
  const wx = arr[0];
  const wy = arr[1];

  for (let i = 0; i < 21; i++) {
    // x is negated: image space is mirrored relative to a hand facing you.
    out[i][0] = -(arr[i * 2] - wx) * k;
    out[i][1] = -(arr[i * 2 + 1] - wy) * k;
    out[i][2] = 0;
  }
  return true;
}
