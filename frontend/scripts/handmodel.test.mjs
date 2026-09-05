/**
 * Kinematics check for the 3-D hand.
 *
 *   node scripts/handmodel.test.mjs
 *
 * A hand rig is easy to get subtly wrong in ways that only show up as "it looks
 * a bit off". These assertions pin down the properties that make it read as a
 * hand: bones keep their length, curling moves tips toward the palm, fingers
 * do not pass through each other, and replayed frames stay anatomically sane.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../src/components/handModel.js"), "utf8");
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(src).toString("base64")}`
);
const {
  solveHand, makeBuffer, applyFrame, FINGERS, EDGES, KEY_FINGER, KEY_X, REST_CURL,
} = mod;

let pass = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const flat = [0, 0, 0, 0, 0];
const full = [1, 1, 1, 1, 1];

console.log("\n=== structure ===");
const out = solveHand(flat, flat, makeBuffer());
check("21 joints are produced", out.length === 21);
check("every joint is finite", out.every((p) => p.every(Number.isFinite)),
  JSON.stringify(out.filter((p) => !p.every(Number.isFinite))));
check("the wrist is at the origin", dist(out[0], [0, 0, 0]) < 1e-9);
check("all 21 indices are written", new Set(FINGERS.flatMap((f) => f.joints)).size === 20);

console.log("\n=== bone lengths are invariant under curl ===");
// This is the property that separates a skeleton from a rubber band.
let worst = 0;
let worstName = "";
for (let c = 0; c <= 1.0001; c += 0.1) {
  const a = solveHand([c, c, c, c, c], flat, makeBuffer());
  for (const F of FINGERS) {
    for (let s = 0; s < 3; s++) {
      const measured = dist(a[F.joints[s]], a[F.joints[s + 1]]);
      const err = Math.abs(measured - F.len[s]);
      if (err > worst) { worst = err; worstName = `${F.name}[${s}] at curl ${c.toFixed(1)}`; }
    }
  }
}
check("no phalanx stretches by more than 1e-9", worst < 1e-9, `worst ${worst} (${worstName})`);

console.log("\n=== curling behaves like a hand ===");
const open = solveHand(flat, flat, makeBuffer());
const fist = solveHand(full, flat, makeBuffer());

for (const F of FINGERS.slice(1)) {          // fingers, not the thumb
  const tip = F.joints[3];
  check(`${F.name}: extended tip is above the knuckle`,
    open[tip][1] > open[F.joints[0]][1] + 0.2,
    `tip y ${open[tip][1].toFixed(2)} vs mcp y ${open[F.joints[0]][1].toFixed(2)}`);
  check(`${F.name}: curling brings the tip down`,
    fist[tip][1] < open[tip][1] - 0.3,
    `${open[tip][1].toFixed(2)} -> ${fist[tip][1].toFixed(2)}`);
  check(`${F.name}: curling brings the tip toward the viewer (+z, palm side)`,
    fist[tip][2] > open[tip][2] + 0.1,
    `${open[tip][2].toFixed(2)} -> ${fist[tip][2].toFixed(2)}`);
  check(`${F.name}: a closed tip lands near the palm, not out in space`,
    Math.hypot(fist[tip][0], fist[tip][1], fist[tip][2]) < 0.95,
    `|tip| = ${Math.hypot(fist[tip][0], fist[tip][1], fist[tip][2]).toFixed(2)}`);
}

console.log("\n=== finger ordering ===");
// Left to right on screen: thumb, index, middle, ring, pinky.
const xs = FINGERS.map((F) => open[F.joints[3]][0]);
check("tips run left to right in anatomical order",
  xs.every((v, i) => i === 0 || v > xs[i - 1]), JSON.stringify(xs.map((v) => v.toFixed(2))));

const gaps = [];
for (let i = 2; i < 5; i++) gaps.push(Math.abs(xs[i] - xs[i - 1]));
check("adjacent fingertips do not overlap", gaps.every((g) => g > 0.08),
  JSON.stringify(gaps.map((g) => g.toFixed(3))));

console.log("\n=== curl trajectory ===");
// The tip should sweep down smoothly, then TUCK against the palm rather than
// swinging back out into space. A real fist ends with the fingertip slightly
// above the lowest point of its arc, so demanding strict monotonicity all the
// way to 1.0 would be demanding something anatomically wrong.
const traj = [];
for (let c = 0; c <= 1.0001; c += 0.05) {
  traj.push(solveHand([c, c, c, c, c], flat, makeBuffer())[FINGERS[2].joints[3]].slice());
}
const ys = traj.map((p) => p[1]);
const closing = ys.slice(0, Math.floor(ys.length * 0.85));
check("the tip descends monotonically while the hand is closing",
  closing.every((y, i) => i === 0 || y <= closing[i - 1] + 1e-9));

const lowest = Math.min(...ys);
check("the tip tucks at the end rather than swinging back out",
  ys[ys.length - 1] - lowest < 0.05,
  `rise of ${(ys[ys.length - 1] - lowest).toFixed(3)} after the lowest point`);

check("the tip never passes behind the palm",
  traj.every((p) => p[2] > -0.05), "a tip went through the back of the hand");

// No sudden jumps: a discontinuity here would look like the finger snapping.
const steps = traj.slice(1).map((p, i) => dist(p, traj[i]));
check("the trajectory is continuous — no snapping",
  Math.max(...steps) < 0.22, `largest single step ${Math.max(...steps).toFixed(3)}`);

check("a closed fist is meaningfully smaller than an open hand",
  Math.hypot(...traj[traj.length - 1]) < Math.hypot(...traj[0]) * 0.5);

console.log("\n=== splay ===");
const splayed = solveHand(flat, [0, 0.25, 0, -0.25, 0], makeBuffer());
check("positive splay rotates the index tip", Math.abs(splayed[8][0] - open[8][0]) > 0.05);
check("splay preserves bone length",
  Math.abs(dist(splayed[5], splayed[6]) - FINGERS[1].len[0]) < 1e-9);

console.log("\n=== rest pose is a relaxed hand, not a flat plank ===");
const rest = solveHand([REST_CURL, REST_CURL, REST_CURL, REST_CURL, REST_CURL], flat, makeBuffer());
check("resting fingers are slightly bent",
  rest[12][2] > 0.02 && rest[12][2] < 0.5, `z=${rest[12][2].toFixed(3)}`);
check("resting hand is still open", rest[12][1] > 0.9, `y=${rest[12][1].toFixed(2)}`);

console.log("\n=== key map ===");
const letters = "abcdefghijklmnopqrstuvwxyz".split("");
check("every letter is assigned a finger", letters.every((c) => KEY_FINGER[c] != null),
  letters.filter((c) => KEY_FINGER[c] == null).join(","));
check("every assignment is a valid finger index",
  Object.values(KEY_FINGER).every((f) => Number.isInteger(f) && f >= 0 && f <= 4));
check("space is the thumb", KEY_FINGER[" "] === 0);
check("home-row anchors match touch typing",
  KEY_FINGER.a === 4 && KEY_FINGER.s === 3 && KEY_FINGER.d === 2 && KEY_FINGER.f === 1);
check("all four fingers are actually used",
  new Set(letters.map((c) => KEY_FINGER[c])).size >= 4);
check("key x positions stay in range",
  Object.values(KEY_X).every((v) => v >= 0 && v <= 1));

console.log("\n=== replay of real landmarks ===");
// A synthetic but realistically shaped frame: 21 points in image space.
const frame = { r: [], l: null };
for (let i = 0; i < 21; i++) {
  frame.r.push(500 + Math.cos(i) * 40, 300 + Math.sin(i) * 40);
}
const rbuf = makeBuffer();
check("a frame with a right hand is applied", applyFrame(frame, rbuf) === true);
check("replay puts the wrist at the origin", dist(rbuf[0], [0, 0, 0]) < 1e-9);
check("replay is planar — no invented depth", rbuf.every((p) => p[2] === 0));
const extent = Math.max(...rbuf.map((p) => Math.hypot(p[0], p[1])));
check("replay is normalised to a sane size", extent > 0.3 && extent < 4, `extent ${extent.toFixed(2)}`);

check("a frame with only a left hand still works",
  applyFrame({ l: frame.r, r: null }, rbuf) === true);
check("an empty frame is refused", applyFrame({ l: null, r: null }, rbuf) === false);
check("a malformed frame is refused", applyFrame({ r: [1, 2, 3] }, rbuf) === false);
check("undefined is refused", applyFrame(undefined, rbuf) === false);

// Far and near recordings of the same gesture must land at the same scale.
const near = { r: frame.r.map((v, i) => (i % 2 ? 300 + (v - 300) * 3 : 500 + (v - 500) * 3)) };
const nbuf = makeBuffer();
applyFrame(near, nbuf);
applyFrame(frame, rbuf);
const scaleDiff = Math.abs(
  Math.max(...nbuf.map((p) => Math.hypot(p[0], p[1]))) -
  Math.max(...rbuf.map((p) => Math.hypot(p[0], p[1])))
);
check("distance from the camera does not change the rendered size", scaleDiff < 1e-6,
  `diff ${scaleDiff}`);

console.log("\n=== edges ===");
check("21 bones", EDGES.length === 21);
check("all edge indices are in range",
  EDGES.every(([a, b]) => a >= 0 && a < 21 && b >= 0 && b < 21));
check("no bone connects a joint to itself", EDGES.every(([a, b]) => a !== b));
check("every joint is connected to something",
  new Set(EDGES.flat()).size === 21, `${new Set(EDGES.flat()).size} of 21`);

console.log(`\n${"=".repeat(52)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(52)}`);
process.exit(fail ? 1 : 0);
