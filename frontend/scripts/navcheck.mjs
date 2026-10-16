/**
 * In-app navigation test — ONE page load, then click through the nav.
 *
 *   node scripts/navcheck.mjs [bundleDir]
 *
 * routecheck.mjs loads every route fresh, so it cannot see bugs that only
 * appear when you move BETWEEN pages. This one does: after each click it
 * requires the new page to be mounted and the old one gone. It is the test for
 * "after Live / Practice / Reverse, every page is blank" (route exit animation
 * that never completed).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const jsDir = join(process.argv[2] || join(here, "../build"), "static/js");
const entry = existsSync(jsDir) && readdirSync(jsDir).find((f) => /^main\.[a-f0-9]+\.js$/.test(f) || f === "bundle.js");
if (!entry) { console.error("build first"); process.exit(2); }
const bundle = readFileSync(join(jsDir, entry), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => { const m = String(e?.message || e); if (!/not implemented|getContext/i.test(m)) errors.push(m.split("\n")[0]); });
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`,
  { url: "http://localhost:3000/live", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
w.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }], this); } unobserve() {} disconnect() {} };
w.scrollTo = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
w.navigator.mediaDevices = { getUserMedia: () => Promise.reject(new Error("no camera")) };
w.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
w.XMLHttpRequest = class { open() {} setRequestHeader() {} abort() {} addEventListener() {} send() { setTimeout(() => this.onerror?.(new Error("network")), 0); } };
w.localStorage.setItem("silentvoice.guest.v1", "1");
w.eval(bundle);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (id) => !!w.document.querySelector(`[data-testid="${id}"]`);
const PAGES = { "/live": "live-page", "/settings": "settings-page", "/practice": "practice-page",
  "/about": "about-page", "/reverse": "reverse-page", "/transcripts": "transcripts-page",
  "/contribute": "contribute-page", "/rubric": "rubric-page", "/research": "research-page", "/home": "landing-page" };
const PATH = ["/settings", "/practice", "/about", "/reverse", "/transcripts", "/live", "/contribute",
  "/rubric", "/practice", "/reverse", "/research", "/live", "/home"];

let pass = 0, fail = 0;
await sleep(800);
let from = "/live";
console.log(`  start  ${from}: ${has(PAGES[from]) ? "mounted" : "MISSING"}`);
for (const to of PATH) {
  const link = [...w.document.querySelectorAll("a[href]")].find((a) => new URL(a.href).pathname === to);
  if (!link) { fail++; console.log(`  FAIL  no nav link to ${to} on ${from}`); continue; }
  link.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  await sleep(900);
  const ok = has(PAGES[to]) && !has(PAGES[from]) && w.location.pathname === to;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${from.padEnd(12)} -> ${to.padEnd(12)} ${ok ? "" :
    `(new mounted: ${has(PAGES[to])}, old still there: ${has(PAGES[from])}, url: ${w.location.pathname})`}`);
  from = to;
}
errors.slice(0, 5).forEach((e) => console.log(`  error: ${e}`));
console.log(`\n${"=".repeat(52)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(52)}`);
process.exit(fail ? 1 : 0);
