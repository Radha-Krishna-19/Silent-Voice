/**
 * Review 2 rubric tracker.
 *
 * This page is deliberately not a checklist of green ticks. Each row states
 * what the rubric asks for, what the project can actually evidence today, and
 * what is still missing — with the missing items written out so they can be
 * worked through rather than discovered the night before.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowUpRight, Check, Minus, Circle } from "lucide-react";
import Nav from "../components/Nav";
import {
  Reveal, Stagger, StaggerItem, PageTransition, CountUp, AnimatedRing, Tilt, EASE,
} from "../components/motion";
import { Scramble, RowReveal, Spotlight, ScrollSkew } from "../components/motion/advanced";
import { RUBRIC, TOTAL_MARKS, marksBy, STATUS_META } from "../lib/rubric";

const ICON = { have: Check, partial: Minus, todo: Circle };

export default function Rubric() {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);

  const secured = marksBy("have");
  const partial = marksBy("partial");
  const todo = marksBy("todo");

  const rows = useMemo(
    () => (filter === "all" ? RUBRIC : RUBRIC.filter((r) => r.status === filter)),
    [filter]
  );

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="rubric-page">
      <Nav />
      <PageTransition>
        <main className="pt-28 pb-24 px-6 md:px-12 lg:px-24 max-w-[1100px] mx-auto">
          <Reveal>
            <div className="micro-caps text-cream/40 mb-3">
              <Scramble text="Assessment" />
            </div>
            <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-[1.02] mb-4">
              Review 2 rubric
            </h1>
            <p className="text-cream/45 text-sm max-w-2xl leading-relaxed">
              Twelve slides, fifty marks. Every row below is scored against what
              this project can point at right now — a specific deck slide, a page
              in this app, or a file in the repo. Rows with nothing behind them
              are marked as such.
            </p>
          </Reveal>

          {/* ------------------------------------------------ summary */}
          <Reveal delay={0.08}>
            <div className="mt-12 grid md:grid-cols-[auto_1fr] gap-10 items-center border border-cream/10 rounded-sm p-8">
              <div className="flex justify-center">
                <AnimatedRing value={secured / TOTAL_MARKS} size={160} stroke={8}>
                  <div className="font-display text-4xl tracking-tight">
                    <CountUp value={secured} />
                  </div>
                  <div className="micro-caps text-cream/40 mt-1">of {TOTAL_MARKS}</div>
                </AnimatedRing>
              </div>

              <div className="space-y-4">
                <Bar label="Evidenced" value={secured} total={TOTAL_MARKS} color="#6EE7F2" delay={0.1} />
                <Bar label="Partial" value={partial} total={TOTAL_MARKS} color="#C97B4A" delay={0.2} />
                <Bar label="Not started" value={todo} total={TOTAL_MARKS} color="#8A8A93" delay={0.3} />
                <p className="text-xs text-cream/35 leading-relaxed pt-2">
                  “Evidenced” means the artefact exists today. It is not a
                  prediction of the mark — a slide that exists can still be
                  presented badly.
                </p>
              </div>
            </div>
          </Reveal>

          {/* ------------------------------------------------ filters */}
          <Reveal delay={0.12}>
            <div className="flex flex-wrap items-center gap-2 mt-12 mb-6">
              {[
                ["all", `All ${RUBRIC.length}`],
                ["have", `Evidenced ${RUBRIC.filter((r) => r.status === "have").length}`],
                ["partial", `Partial ${RUBRIC.filter((r) => r.status === "partial").length}`],
                ["todo", `Not started ${RUBRIC.filter((r) => r.status === "todo").length}`],
              ].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setFilter(v)}
                  data-testid={`rubric-filter-${v}`}
                  className={`focus-ring relative px-4 py-2 rounded-sm text-[11px] uppercase tracking-widest transition-colors ${
                    filter === v ? "text-ink" : "text-cream/50 hover:text-cream border border-cream/12"
                  }`}
                >
                  {filter === v && (
                    <motion.span
                      layoutId="rubric-filter-pill"
                      className="absolute inset-0 bg-copper rounded-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
          </Reveal>

          {/* ------------------------------------------------ rows */}
          <ScrollSkew intensity={0.5}>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {rows.map((r, i) => (
                  <motion.div
                    key={r.n}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.28, delay: Math.min(i * 0.03, 0.3), ease: EASE }}
                  >
                    <Row row={r} open={open === r.n} onToggle={() => setOpen(open === r.n ? null : r.n)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollSkew>

          {/* ------------------------------------------------ next */}
          <Reveal>
            <div className="mt-16 border-t border-cream/10 pt-10">
              <div className="micro-caps text-cream/40 mb-5">What to do next</div>
              <Stagger className="grid md:grid-cols-3 gap-4" gap={0.08}>
                {[
                  {
                    k: "01",
                    t: "The literature survey",
                    d: "Five papers from SCImago-listed journals, 2025 or 2026. It is worth 5 marks on its own and unblocks rows 5 and 12 — 10 more.",
                  },
                  {
                    k: "02",
                    t: "Algorithm procedure",
                    d: "Five marks of transcription, not research. Every equation is already implemented in preprocess.py and models.py.",
                  },
                  {
                    k: "03",
                    t: "Complexity and novelty",
                    d: "Add big-O time and space per model, and state the novelty as the controlled comparison rather than a new layer.",
                  },
                ].map((c) => (
                  <StaggerItem key={c.k}>
                    <Tilt max={5}>
                      <Spotlight className="h-full border border-cream/10 rounded-sm p-6">
                        <div className="font-mono text-[10px] text-copper mb-3">{c.k}</div>
                        <div className="text-sm text-cream/90 mb-2">{c.t}</div>
                        <div className="text-xs text-cream/40 leading-relaxed">{c.d}</div>
                      </Spotlight>
                    </Tilt>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </Reveal>
        </main>
      </PageTransition>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Row({ row, open, onToggle }) {
  const meta = STATUS_META[row.status];
  const Icon = ICON[row.status];

  return (
    <Spotlight
      className={`border rounded-sm transition-colors ${
        open ? "border-cream/25" : "border-cream/10 hover:border-cream/20"
      }`}
      color="rgba(201,123,74,0.10)"
    >
      <button
        onClick={onToggle}
        data-testid={`rubric-row-${row.n}`}
        className="focus-ring w-full flex items-start gap-4 md:gap-6 px-5 py-4 text-left"
      >
        <span className="font-mono text-[11px] text-cream/30 pt-1 w-6 shrink-0">
          {String(row.n).padStart(2, "0")}
        </span>

        <span
          className="mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${meta.color}22`, border: `1px solid ${meta.color}55` }}
          title={meta.label}
        >
          <Icon className="w-3 h-3" style={{ color: meta.color }} strokeWidth={2.5} />
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-sm text-cream/90">{row.title}</span>
          {row.detail && (
            <span className="block text-xs text-cream/35 mt-1 leading-relaxed">{row.detail}</span>
          )}
        </span>

        <span className="flex items-center gap-4 shrink-0">
          <span
            className="hidden sm:block text-[10px] uppercase tracking-widest"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="font-display text-xl tabular-nums text-cream/70 w-6 text-right">
            {row.marks}
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }}>
            <ChevronDown className="w-4 h-4 text-cream/30" strokeWidth={1.5} />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pl-[4.2rem] space-y-5">
              {row.evidence.length > 0 && (
                <div>
                  <div className="micro-caps text-cyan/70 mb-2">What exists</div>
                  <ul className="space-y-1.5">
                    {row.evidence.map((e, i) => (
                      <RowReveal key={i} index={i}>
                        <li className="text-xs text-cream/55 leading-relaxed flex gap-2">
                          <span className="text-cyan/50 shrink-0">—</span>
                          <span>{e}</span>
                        </li>
                      </RowReveal>
                    ))}
                  </ul>
                </div>
              )}

              {row.missing.length > 0 && (
                <div>
                  <div className="micro-caps text-copper/80 mb-2">Still missing</div>
                  <ul className="space-y-1.5">
                    {row.missing.map((m, i) => (
                      <RowReveal key={i} index={i}>
                        <li className="text-xs text-cream/55 leading-relaxed flex gap-2">
                          <span className="text-copper/60 shrink-0">—</span>
                          <span>{m}</span>
                        </li>
                      </RowReveal>
                    ))}
                  </ul>
                </div>
              )}

              {row.note && (
                <div className="text-xs text-cream/40 leading-relaxed border-l border-cream/15 pl-4 italic">
                  {row.note}
                </div>
              )}

              {row.link && (
                <Link
                  to={row.link}
                  className="focus-ring inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-copper hover:text-cream transition-colors"
                >
                  See it in the app
                  <ArrowUpRight className="w-3 h-3" strokeWidth={2} />
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Spotlight>
  );
}

function Bar({ label, value, total, color, delay }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-cream/60">{label}</span>
        <span className="font-mono text-xs" style={{ color }}>
          <CountUp value={value} /> / {total}
        </span>
      </div>
      <div className="h-1 bg-cream/[0.07] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          whileInView={{ width: `${(value / total) * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay, ease: EASE }}
        />
      </div>
    </div>
  );
}
