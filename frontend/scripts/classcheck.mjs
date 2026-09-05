/**
 * Catch CSS utility conflicts that no runtime test can see.
 *
 *   node scripts/classcheck.mjs
 *
 * jsdom performs no layout, so a container whose height has collapsed still
 * "renders" in every headless test — components mount, effects run, assertions
 * pass, and the user sees an empty rectangle. That is exactly what happened:
 * SignTrailHero composed `relative` with a caller's `absolute inset-0`, and
 * because Tailwind emits `.relative` AFTER `.absolute`, position:relative won.
 * A relatively-positioned element ignores `inset` for sizing, so the wrapper
 * had zero height and the canvas inside it was 0x0.
 *
 * This is a static check, which is the only kind that can catch it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "../src");

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.jsx?$/.test(p)) files.push(p);
  }
})(SRC);

// Utilities that fight each other when they land on the same element. The
// winner is whichever Tailwind emits last, which is not the order you wrote.
const GROUPS = [
  { name: "position", classes: ["static", "fixed", "absolute", "relative", "sticky"] },
  { name: "display", classes: ["block", "inline-block", "inline", "flex", "inline-flex", "grid", "hidden"] },
];

// Class strings are frequently composed from a prop, so also flag template
// literals that interpolate a variable next to a position utility.
const CLASS_ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;

let problems = 0;
let scanned = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  let m;
  while ((m = CLASS_ATTR.exec(src))) {
    const raw = m[1] ?? m[2] ?? "";
    scanned++;

    // Ignore responsive/state variants: `lg:absolute` does not conflict with
    // an unprefixed `relative`.
    const tokens = raw
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => !t.includes(":") && !t.includes("${"));

    for (const g of GROUPS) {
      const hits = g.classes.filter((c) => tokens.includes(c));
      if (hits.length > 1) {
        problems++;
        const line = src.slice(0, m.index).split("\n").length;
        console.log(`  CONFLICT  ${relative(SRC, file)}:${line}`);
        console.log(`            ${g.name}: ${hits.join(" + ")}  in  "${raw.trim().slice(0, 90)}"`);
      }
    }

    // The dangerous shape is narrower than "any interpolation": it is a
    // component splicing its own `className` PROP — which a caller can fill
    // with `absolute inset-0` — next to a hardcoded position utility. A
    // conditional colour string cannot cause this, so it is not flagged.
    const passesThroughProp = m[2] && /\$\{\s*(props\.)?className\s*\}/.test(m[2]);
    if (passesThroughProp) {
      const literal = m[2].replace(/\$\{[^}]*\}/g, " ");
      const pos = GROUPS[0].classes.filter((c) =>
        literal.split(/\s+/).filter(Boolean).includes(c));
      if (pos.length) {
        problems++;
        const line = src.slice(0, m.index).split("\n").length;
        console.log(`  RISK      ${relative(SRC, file)}:${line}`);
        console.log(`            hardcodes \`${pos.join(" ")}\` beside an interpolated className.`);
        console.log(`            A caller passing "absolute inset-0" would collide; guard it.`);
      }
    }
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`  ${scanned} className attributes scanned in ${files.length} files`);
console.log(`  ${problems} problem${problems === 1 ? "" : "s"}`);
console.log("=".repeat(60));
process.exit(problems ? 1 : 0);
