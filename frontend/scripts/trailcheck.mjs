/**
 * Prove the trail renderer actually draws, and that it draws the real data.
 *
 *   node scripts/trailcheck.mjs
 *
 * Tests signTrailDraw.js DIRECTLY, as its own header says it was built for:
 * "so a node script can render the identical code ... and be looked at."
 * This used to boot the full compiled app bundle at "/" instead — but SignTrail
 * is only ever mounted on /reverse and /practice (behind a live API call and a
 * "has a reference recording" gate, respectively), so with fetch stubbed to
 * fail, "/" rendered nothing but the Gate page's decorative starfield
 * (ConstellationField). That component also draws with a plain per-particle
 * strokeStyle, so every "does it draw" check happened to pass anyway — which
 * is exactly how this kept silently testing the wrong component: the one
 * check specific to SignTrail's actual behavior (the copper->cyan gradient
 * ramp) failed, because a starfield has no such ramp. Driving the real
 * exported functions with real bundled sample data is both more direct and
 * more honest about what's actually being verified.
 *
 * A canvas component can mount, pass a route check, and still paint nothing —
 * jsdom returns null from getContext, so the render loop silently bails and no
 * test notices. This uses a RECORDING 2-D context and counts the draw calls,
 * so "it renders" is measured rather than assumed.
 *
 * It also checks the geometry the renderer is fed: that the bundled signs are
 * trimmed, that activeHands is present, and that cropping to the active hand
 * actually makes the mark bigger — which is the whole point of the change.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

/* ------------------------------------------------------------------ *
 * 1. The data the renderer consumes
 * ------------------------------------------------------------------ */
console.log("\n=== bundled sign data ===");
const samplesSrc = readFileSync(join(here, "../src/lib/signSamples.js"), "utf8");
const samples = await import(
  `data:text/javascript;base64,${Buffer.from(samplesSrc).toString("base64")}`
);

check("words are bundled", samples.SAMPLE_WORDS.length >= 8,
  `${samples.SAMPLE_WORDS.length} words`);

const entries = samples.SAMPLE_WORDS.map((w) => [w, samples.sampleSign(w)]);
check("every bundled word resolves", entries.every(([, e]) => e && e.frames?.length));
check("every word declares activeHands",
  entries.every(([, e]) => Array.isArray(e.activeHands) && e.activeHands.length));
check("activeHands only ever contains l or r",
  entries.every(([, e]) => e.activeHands.every((h) => h === "l" || h === "r")));

// Trimming: clips should be short now. Untrimmed they were 20 frames.
const lens = entries.map(([, e]) => e.frames.length);
check("clips are trimmed to the signing window",
  Math.max(...lens) <= 12, `longest is ${Math.max(...lens)} frames`);

// Frames must still be well-formed landmark arrays.
check("hand arrays are 42 numbers (21 points, x/y)",
  entries.every(([, e]) => e.frames.every((f) =>
    ["l", "r"].every((h) => f[h] == null || f[h].length === 42))));

/* --- the crop actually helps ------------------------------------- */
console.log("\n=== cropping to the active hand ===");
function extent(frames, hands) {
  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  for (const f of frames) {
    for (const h of hands) {
      const a = f[h];
      if (!a) continue;
      for (let i = 0; i < 42; i += 2) {
        if (a[i] < minX) minX = a[i];
        if (a[i] > maxX) maxX = a[i];
        if (a[i + 1] < minY) minY = a[i + 1];
        if (a[i + 1] > maxY) maxY = a[i + 1];
      }
    }
  }
  return Number.isFinite(minX) ? Math.max(maxX - minX, maxY - minY) : 0;
}

const oneHanded = entries.filter(([, e]) => e.activeHands.length === 1);
check("some bundled signs are one-handed", oneHanded.length > 0,
  `${oneHanded.length} of ${entries.length}`);

// Cropping must never make the box BIGGER. How much smaller varies: when the
// resting hand happens to sit near the working one the gain is small, and for
// `city` it is only 4% — that is a property of the recording, not a bug.
const ratios = oneHanded.map(([, e]) =>
  extent(e.frames, e.activeHands) / Math.max(1, extent(e.frames, ["l", "r"])));
check("cropping never enlarges the box", ratios.every((r) => r <= 1.0001),
  `worst ratio ${Math.max(...ratios).toFixed(3)}`);

const median = ratios.slice().sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
check("cropping typically shrinks the box a lot, so the hand renders bigger",
  median < 0.8, `median ratio ${median.toFixed(2)} (lower is better)`);

/* ------------------------------------------------------------------ *
 * 2. The renderer actually paints — signTrailDraw.js's real exports,
 *    driven directly with real bundled sample frames, sweeping the
 *    write-on "head" the same way SignTrail.jsx's rAF loop does
 *    (0 -> 1 over time, per its `s.t += dt * 0.42 * speed`).
 * ------------------------------------------------------------------ */
console.log("\n=== canvas output ===");
const drawSrc = readFileSync(join(here, "../src/components/signTrailDraw.js"), "utf8");
const draw = await import(
  `data:text/javascript;base64,${Buffer.from(drawSrc).toString("base64")}`
);

const calls = {};
const bump = (k) => { calls[k] = (calls[k] || 0) + 1; };
const strokeStyles = new Set();

function recordingContext() {
  return {
    canvas: { width: 800, height: 800 },
    setTransform: () => bump("setTransform"),
    clearRect: () => bump("clearRect"),
    beginPath: () => bump("beginPath"),
    moveTo: () => bump("moveTo"),
    lineTo: () => bump("lineTo"),
    stroke: () => bump("stroke"),
    fill: () => bump("fill"),
    arc: () => bump("arc"),
    createRadialGradient: () => { bump("gradient"); return { addColorStop: () => {} }; },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    ellipse: () => bump("ellipse"),
    drawImage: () => bump("drawImage"),
    save: () => {}, restore: () => {},
    set strokeStyle(v) { strokeStyles.add(String(v)); },
    get strokeStyle() { return "#000"; },
    set filter(_v) {}, get filter() { return "none"; },
    fillStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    globalCompositeOperation: "", globalAlpha: 1,
  };
}

// A two-handed word with a decent number of trimmed frames, so tracks for
// both hands exist and the path has enough points to actually curve.
const [, sample] = entries.reduce((best, cur) =>
  cur[1].frames.length > best[1].frames.length ? cur : best);
const hands = sample.activeHands?.length ? sample.activeHands : ["l", "r"];
const tracks = draw.buildTracks(sample.frames, hands);
const box = draw.fitBox(tracks);

check("sample word produced usable tracks", tracks.length > 0, `${tracks.length} tracks`);
check("sample word produced a fit box", box != null);

// Sweep head 0.05 -> 1, same range SignTrail.jsx's render loop passes through
// on every play, and paint each step into the recording context — real
// glow pass + core pass, exactly as the component calls it.
const scratch = recordingContext();
const ctx = recordingContext();
let paintError = null;
for (let i = 1; i <= 20 && !paintError; i++) {
  const head = i / 20;
  try {
    draw.paint(ctx, scratch, { w: 800, h: 800, tracks, box, head, unitScale: 1 });
  } catch (e) {
    paintError = `head=${head}: ${e.message}`;
  }
}
check("paint() runs across the full head sweep without throwing", !paintError, paintError || "");

console.log(`  draw calls: ${JSON.stringify(calls)}`);
check("the canvas was cleared each frame", (calls.clearRect || 0) > 10,
  `${calls.clearRect || 0} clears`);
check("strokes were drawn", (calls.stroke || 0) > 50, `${calls.stroke || 0} strokes`);
check("paths were built", (calls.moveTo || 0) > 50 && (calls.lineTo || 0) > 50,
  `moveTo ${calls.moveTo || 0}, lineTo ${calls.lineTo || 0}`);
check("glow heads were painted", (calls.gradient || 0) > 0 || (calls.arc || 0) > 0);
check("more than one colour was used along the stroke", strokeStyles.size > 5,
  `${strokeStyles.size} distinct stroke styles`);
// The stroke colour is INTERPOLATED copper->cyan along the path, so the exact
// endpoint colours may never be emitted. What must be true is that the range is
// traversed: some segments warm (r > b), some cool (b > r).
const rgbTriples = [...strokeStyles]
  .map((s) => s.match(/rgba?\((\d+),(\d+),(\d+)/))
  .filter(Boolean)
  .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
check("stroke colours were parsed", rgbTriples.length > 5, `${rgbTriples.length} parsed`);
check("the stroke traverses a warm-to-cool ramp",
  rgbTriples.some(([r, , b]) => r > b) && rgbTriples.some(([r, , b]) => b > r),
  `warm ${rgbTriples.filter(([r, , b]) => r > b).length}, cool ${rgbTriples.filter(([r, , b]) => b > r).length}`);

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
