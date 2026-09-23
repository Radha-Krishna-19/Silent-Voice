/**
 * Headless smoke test for every route.
 *
 *   node scripts/routecheck.mjs [bundleDir]
 *
 * Boots the real compiled bundle inside jsdom, visits each route, and fails on
 * any console error, unhandled rejection, or page that renders nothing. This
 * catches the class of bug that a successful webpack build does not: a missing
 * export used at runtime, a hook called conditionally, a null deref in an
 * effect, a route that renders an empty shell.
 *
 * The backend is stubbed, so this also verifies that every page degrades
 * honestly when the server is down rather than white-screening.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const bundleDir = process.argv[2] || join(here, "../build");
const jsDir = join(bundleDir, "static/js");

// craco/CRA production builds emit a content-hashed entry file
// (main.<hash>.js), never an unhashed bundle.js — this hardcoded name meant
// `npm run verify` failed at this exact step on every real `npm run build`
// output. Locate the actual entry file instead of assuming its name.
function findBundle() {
  if (!existsSync(jsDir)) return null;
  const candidate = readdirSync(jsDir).find(
    (f) => /^main\.[a-f0-9]+\.js$/.test(f) || f === "bundle.js"
  );
  return candidate ? join(jsDir, candidate) : null;
}

const bundlePath = findBundle();

if (!bundlePath) {
  console.error(`No built entry .js found under ${jsDir}\nBuild first, then re-run.`);
  process.exit(2);
}

const ROUTES = [
  "/", "/home", "/live", "/reverse", "/practice",
  "/transcripts", "/research", "/rubric", "/settings", "/about",
];

// What each route must actually put on the page. An empty <div id="root"> is a
// pass for "no errors" and a failure for "the page works", so check both.
const EXPECT = {
  "/": ["gate-page"],
  "/home": ["landing-page"],
  "/live": ["live-page"],
  "/reverse": ["reverse-page"],
  "/practice": ["practice-page"],
  "/transcripts": ["transcripts-page"],
  "/research": ["research-page"],
  "/rubric": ["rubric-page"],
  "/settings": ["settings-page"],
  "/about": ["about-page"],
};

const bundle = readFileSync(bundlePath, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>`;

let totalErrors = 0;
const results = [];

for (const route of ROUTES) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => {
    // Canvas and WebGL are not implemented in jsdom. The app is expected to
    // detect that and fall back, so those are not app bugs.
    const m = String(e?.message || e);
    if (/not implemented|WebGL|getContext/i.test(m)) return;
    errors.push(`jsdomError: ${m.split("\n")[0]}`);
  });
  vc.on("error", (...a) => {
    const m = a.map(String).join(" ");
    if (/not implemented|WebGL|getContext|Warning: /i.test(m)) return;
    errors.push(`console.error: ${m.slice(0, 300)}`);
  });

  const dom = new JSDOM(html, {
    url: `http://localhost:3000${route}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;

  // ---- environment shims jsdom lacks -------------------------------
  window.matchMedia = (q) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, target: el, intersectionRatio: 1 }], this); }
    unobserve() {} disconnect() {} takeRecords() { return []; }
  };
  window.scrollTo = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
  window.navigator.mediaDevices = { getUserMedia: () => Promise.reject(new Error("no camera in jsdom")) };

  // ---- backend is DOWN on purpose ----------------------------------
  window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  class FakeXHR {
    open() {} setRequestHeader() {} abort() {}
    addEventListener(t, fn) { if (t === "error") this._err = fn; }
    send() { setTimeout(() => { this.onerror?.(new Error("network")); this._err?.(new Error("network")); }, 0); }
    get readyState() { return 4; }
    get status() { return 0; }
  }
  window.XMLHttpRequest = FakeXHR;

  // Everything past the gate needs an identity. Use guest, so this also
  // exercises the "nothing is persisted" path.
  if (route !== "/") {
    try { window.localStorage.setItem("silentvoice.guest.v1", "1"); } catch { /* ignore */ }
  }

  const rejections = [];
  window.addEventListener("unhandledrejection", (e) => {
    rejections.push(String(e.reason?.message || e.reason).slice(0, 200));
  });

  try {
    window.eval(bundle);
  } catch (e) {
    errors.push(`bundle threw: ${String(e.message || e).split("\n")[0]}`);
  }

  // Let effects, promises and timers settle.
  await new Promise((r) => setTimeout(r, 700));

  const root = window.document.getElementById("root");
  const text = (root?.textContent || "").trim();
  const testIds = [...window.document.querySelectorAll("[data-testid]")].map((n) =>
    n.getAttribute("data-testid")
  );

  const wanted = EXPECT[route] || [];
  const missing = wanted.filter((id) => !testIds.includes(id));
  if (missing.length) errors.push(`missing testid: ${missing.join(", ")}`);
  if (text.length < 20) errors.push(`rendered almost nothing (${text.length} chars)`);

  // Unhandled rejections that are not the deliberate network failure.
  const realRejections = rejections.filter((r) => !/Failed to fetch|network|Cannot reach/i.test(r));
  realRejections.forEach((r) => errors.push(`unhandled rejection: ${r}`));

  totalErrors += errors.length;
  results.push({ route, errors, chars: text.length, ids: testIds.length });

  const status = errors.length ? "FAIL" : "PASS";
  console.log(
    `  ${status}  ${route.padEnd(14)} ${String(text.length).padStart(6)} chars  ${String(testIds.length).padStart(3)} testids`
  );
  errors.forEach((e) => console.log(`         → ${e}`));

  window.close();
}

/* ------------------------------------------------------------------ *
 * The gate itself: with no identity, a deep link must NOT render the
 * page. A route guard that silently lets you through is worse than no
 * guard, so assert the redirect rather than assuming it.
 * ------------------------------------------------------------------ */
console.log("\n  gate redirect (no identity):");
{
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    url: "http://localhost:3000/transcripts",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
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
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));

  try { window.eval(bundle); } catch { /* reported below */ }
  await new Promise((r) => setTimeout(r, 500));

  const ids = [...window.document.querySelectorAll("[data-testid]")].map((n) =>
    n.getAttribute("data-testid")
  );
  const redirected = ids.includes("gate-page") && !ids.includes("transcripts-page");
  console.log(`  ${redirected ? "PASS" : "FAIL"}  /transcripts without an identity lands on the gate`);
  if (!redirected) totalErrors++;
  window.close();
}

console.log(`\n${"=".repeat(60)}`);
console.log(`  ${results.filter((r) => !r.errors.length).length}/${ROUTES.length} routes clean, ${totalErrors} errors`);
console.log("=".repeat(60));
process.exit(totalErrors ? 1 : 0);
