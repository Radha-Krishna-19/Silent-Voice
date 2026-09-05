/**
 * Compile the app once and report errors, without minifying.
 *
 *   node scripts/compile-check.js
 *
 * `npm run build` is the real check, but Terser on a bundle containing three.js
 * takes minutes. This runs the same webpack config in development mode, which
 * resolves every import and compiles every file — catching missing exports, bad
 * paths and syntax errors — in a fraction of the time. It emits an unminified
 * bundle to build/, which scripts/routecheck.mjs can then run in jsdom.
 *
 * Use it while iterating; use `npm run build` before shipping.
 */
process.env.NODE_ENV = "development";
process.env.BABEL_ENV = "development";
process.env.PUBLIC_URL = "";

const path = require("path");
const root = path.resolve(__dirname, "..");
process.chdir(root);

const { createWebpackDevConfig } = require(path.join(root, "node_modules/@craco/craco"));
const webpack = require(path.join(root, "node_modules/webpack"));
const cracoConfig = require(path.join(root, "craco.config.js"));

const cfg = createWebpackDevConfig(cracoConfig);
cfg.devtool = false;                       // source maps double the time
cfg.cache = { type: "filesystem", cacheDirectory: path.join(root, "node_modules/.cache/compile-check") };

const started = Date.now();

webpack(cfg, (err, stats) => {
  if (err) {
    console.error("FATAL", err);
    process.exit(2);
  }
  const info = stats.toJson({ errors: true, warnings: true });
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n  ${info.errors.length} errors, ${info.warnings.length} warnings  (${secs}s)`);

  info.errors.slice(0, 25).forEach((e) => {
    console.log("\n--- ERROR ---");
    console.log(`${e.moduleName || ""} ${e.loc || ""}`);
    console.log((e.message || String(e)).split("\n").slice(0, 12).join("\n"));
  });
  info.warnings.slice(0, 15).forEach((w) => {
    console.log(`\n--- WARN --- ${w.moduleName || ""}`);
    console.log((w.message || String(w)).split("\n").slice(0, 6).join("\n"));
  });

  process.exit(info.errors.length ? 1 : 0);
});
