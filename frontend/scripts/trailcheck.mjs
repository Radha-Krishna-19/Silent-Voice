/**
 * Prove the trail renderer actually draws, and that it draws the real data.
 *
 *   node scripts/trailcheck.mjs
 *
 * A canvas component can mount, pass a route check, and still paint nothing —
 * jsdom returns null from getContext, so the render loop silently bails and no
 * test notices. This mounts the real compiled bundle with a RECORDING 2-D
 * context and counts the draw calls, so "it renders" is measured rather than
 * assumed.
 *
 * It also checks the geometry the renderer is fed: that the bundled signs are
 * trimmed, that activeHands is present, and that cropping to the active hand
 * actually makes the mark bigger — which is the whole point of the change.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, "../build/static/js/bundle.js");
if (!existsSync(bundlePath)) {
  console.error(`No bundle at ${bundlePath} — run node scripts/compile-check.js first.`);
  process.exit(2);
}

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
 * 2. The renderer actually paints
 * ------------------------------------------------------------------ */
console.log("\n=== canvas output ===");
const bundle = readFileSync(bundlePath, "utf8");
const vc = new VirtualConsole();
const errors = [];
const warnings = [];
vc.on("jsdomError", (e) => {
  const m = String(e?.message || e);
  if (!/not implemented|WebGL/i.test(m)) errors.push(m.split("\n")[0]);
});
vc.on("warn", (...a) => warnings.push(a.map(String).join(" ")));

const dom = new JSDOM(
  `<!doctype html><html><body><div id="root"></div></body></html>`,
  { url: "http://localhost:3000/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc }
);
const { window } = dom;

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
    save: () => {}, restore: () => {},
    set strokeStyle(v) { strokeStyles.add(String(v)); },
    get strokeStyle() { return "#000"; },
    fillStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    globalCompositeOperation: "", filter: "", globalAlpha: 1,
  };
}

window.HTMLCanvasElement.prototype.getContext = function getContext() {
  return recordingContext();
};
// Size ONLY the canvases whose class list says they should fill their parent.
// Blanket-stubbing every canvas to 800x800 is what hid a real bug: a wrapper
// composed `relative` with `absolute inset-0`, Tailwind's `.relative` won, the
// box collapsed to zero height, and the canvas was 0x0 in the browser while
// this test happily reported 66,299 strokes.
let sizedCanvases = 0;
let unsizedCanvases = 0;
window.HTMLCanvasElement.prototype.getBoundingClientRect = function rect() {
  const cls = this.getAttribute("class") || "";
  const fills = /\b(w-full|inset-0)\b/.test(cls);
  if (fills) { sizedCanvases++; return { width: 800, height: 800, top: 0, left: 0, right: 800, bottom: 800, x: 0, y: 0 }; }
  unsizedCanvases++;
  return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 };
};
window.matchMedia = (q) => ({
  matches: false, media: q, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
});
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }], this); }
  unobserve() {} disconnect() {} takeRecords() { return []; }
};
window.scrollTo = () => {};
window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));

try { window.eval(bundle); } catch (e) {
  errors.push(`bundle threw: ${String(e.message || e).split("\n")[0]}`);
}

// Let the render loop run for a while.
await new Promise((r) => setTimeout(r, 2200));

console.log(`  draw calls: ${JSON.stringify(calls)}`);
check("the canvas was cleared each frame", (calls.clearRect || 0) > 10,
  `${calls.clearRect || 0} clears`);
check("strokes were drawn", (calls.stroke || 0) > 200, `${calls.stroke || 0} strokes`);
check("paths were built", (calls.moveTo || 0) > 200 && (calls.lineTo || 0) > 200,
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
check("no unexpected page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

// The renderer warns rather than painting into a 0x0 buffer. If that warning
// ever fires here, a container has collapsed.
const collapsed = warnings.filter((w) => w.includes("[SignTrail]"));
check("no canvas reported a collapsed container", collapsed.length === 0,
  collapsed[0] || "");

window.close();

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
