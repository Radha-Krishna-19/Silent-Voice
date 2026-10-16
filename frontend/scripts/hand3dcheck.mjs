/**
 * Checks the Practice page's 3-D hand geometry (src/components/hand3dDraw.js)
 * against a REAL reference clip, and that drawing runs and paints.
 *
 *   node scripts/hand3dcheck.mjs   (needs ../backend/models/practice_refs.npz
 *                                   exported once to scripts/.hand3d_ref.json;
 *                                   falls back to a synthetic hand otherwise)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../src/components/hand3dDraw.js"), "utf8");
const H = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };

// --- input: a real reference clip if available, else a synthetic open hand ---
let frames;
const refFile = join(here, ".hand3d_ref.json");
if (existsSync(refFile)) {
  frames = JSON.parse(readFileSync(refFile, "utf8"));
  console.log(`\n=== real reference clip (${frames.length} frames) ===`);
} else {
  console.log("\n=== synthetic hand (no .hand3d_ref.json) ===");
  frames = Array.from({ length: 60 }, (_, t) => {
    const f = new Array(126).fill(0);
    for (let j = 0; j < 21; j++) {
      const s = 0.5 + 0.5 * Math.sin(t / 8);          // hand moves nearer/farther: size changes
      f[63 + j * 3] = (j % 5) * 0.05 * s;
      f[63 + j * 3 + 1] = -Math.floor(j / 5) * 0.08 * s;
      f[63 + j * 3 + 2] = 0.01 * j * s;
    }
    if (t % 7 === 3) for (let k = 63; k < 126; k++) f[k] = 0;   // tracking dropouts
    return f;
  });
}

const right = H.prepHand(frames, 63, 16 / 9) || H.prepHand(frames, 0, 16 / 9);
check("a tracked hand is prepared", !!right);
check("one pose per frame, 21 joints each", right.frames.length === frames.length && right.frames.every((p) => p.length === 21));
check("no NaN anywhere", right.frames.every((p) => p.every((q) => q.every(Number.isFinite))));

const maxR = Math.max(...right.frames.flatMap((p) => p.map((q) => Math.hypot(...q))));
check("fits the unit sphere (never drawn off-canvas)", maxR <= 1.0001, `max ${maxR}`);

const palmLen = right.frames.map((p) => Math.hypot(p[9][0] - p[0][0], p[9][1] - p[0][1], p[9][2] - p[0][2]));
const sorted = [...palmLen].sort((a, b) => a - b);
const spread = sorted[Math.floor(sorted.length * 0.9)] / sorted[Math.floor(sorted.length * 0.1)];
check("hand size is stable over the clip (palm length p90/p10 < 1.6)", spread < 1.6, spread.toFixed(2));
check("hand is large in its panel (palm length >= 0.3 of the radius)", sorted[Math.floor(sorted.length / 2)] >= 0.3,
  sorted[Math.floor(sorted.length / 2)].toFixed(2));

const empty = H.prepHand(frames.map(() => new Array(126).fill(0)), 0, 16 / 9);
check("an untracked hand is skipped, not drawn as a blob", empty === null);

// mirror: x is negated relative to the raw data
const one = frames.findIndex((f) => f.slice(63, 126).some((v) => v !== 0));
const raw = H.prepHand([frames[one], frames[one], frames[one]], 63, 1);
check("reference is mirrored like the webcam", raw && Math.sign(raw.frames[0][4][0] - raw.frames[0][0][0]) ===
  -Math.sign(frames[one][63 + 12] - frames[one][63]) || frames[one][63 + 12] === frames[one][63]);

// --- drawing -------------------------------------------------------------------
const calls = { stroke: 0, arc: 0, fill: 0 };
const ctx = new Proxy({}, {
  get: (_, k) => (k in calls ? () => { calls[k]++; }
    : k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
H.drawHand(ctx, right.frames[10], 200, 200, 120, 0.3, 0.1);
check("all 21 bones stroked", calls.stroke === 21, JSON.stringify(calls));
check("joints painted", calls.arc >= 21);
const P = H.project([0, 0, -0.5], 0, 0), Q = H.project([0, 0, 0.5], 0, 0);
check("perspective: nearer points (smaller z) drawn larger", P[3] > Q[3]);

console.log(`\n${"=".repeat(52)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(52)}`);
process.exit(fail ? 1 : 0);
