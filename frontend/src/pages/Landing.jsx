/**
 * Home.
 *
 * The hero used to be a decorative SVG hand that jittered on a sine wave. It
 * now shows the 3-D rig performing REAL signs, replayed from the landmark
 * tensors the recogniser was trained on, captioned with the word. Hovering any
 * word in the vocabulary ribbon makes the hand perform that word.
 *
 * The distinction matters: the old hero was an illustration of the idea, this
 * one is the product doing its job before you have clicked anything.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight, Radio, MessageSquare, Sparkles, ShieldCheck, Loader2,
} from "lucide-react";
import Nav from "../components/Nav";
import HandRig from "../components/HandRig";
import {
  Reveal, Stagger, StaggerItem, SplitText, Magnetic, Tilt, CountUp,
  PageTransition, EASE,
} from "../components/motion";
import {
  Marquee, Parallax, ScrollScene, Scramble, Spotlight, ScrollSkew,
} from "../components/motion/advanced";
import { useReducedMotionPref } from "../components/motion/preference";
import PrivacyBadge from "../components/PrivacyBadge";
import OnboardingModal from "../components/OnboardingModal";
import { FEATURE_CARDS } from "../lib/mockData";
import { ALL_WORDS, VOCAB_SIZE, pretty } from "../lib/vocabulary";
import { fetchComparison } from "../lib/api";
import { useSignLoop, resolveSign, SAMPLE_WORDS } from "../lib/signs";
import { useAuth } from "../lib/auth";

const iconMap = { Radio, MessageSquare, Sparkles };

// The hero rotates through the words bundled with the app, so the hand is
// performing real recordings the instant the page paints — no request, and
// nothing to break when the backend is off. Hovering the vocabulary ribbon
// reaches the full 261 through the API.
const HERO_WORDS = SAMPLE_WORDS;

export default function Landing() {
  const [onboardOpen, setOnboardOpen] = useState(false);
  const reduced = useReducedMotionPref();
  const handRef = useRef(null);
  const [stats, setStats] = useState(null);
  const { guest } = useAuth();

  /* ---- real measured numbers for the strip ---------------------- */
  useEffect(() => {
    let alive = true;
    fetchComparison()
      .then((d) => {
        if (!alive || !d?.available) return;
        const best = (d.models || []).reduce(
          (a, b) => ((b.test_acc ?? 0) > (a?.test_acc ?? 0) ? b : a),
          null
        );
        setStats({
          classes: d.n_classes,
          test: d.n_test,
          acc: best?.test_acc != null ? best.test_acc * 100 : null,
          latency: best?.latency_ms_mean ?? null,
          name: best?.name ?? best?.arch ?? null,
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const { word, source, play, pause, resume } = useSignLoop(handRef, HERO_WORDS, {
    intervalMs: 4400,
  });

  /* ---- the hand tracks the cursor when not replaying ------------ */
  useEffect(() => {
    const move = (e) => {
      handRef.current?.setPointer(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1
      );
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, []);

  const hoverWord = async (w) => {
    pause();
    const ok = await resolveSign(w);
    if (ok) play(w, true);
  };

  const leaveWord = () => { handRef.current?.stopSign(); resume(); };

  return (
    <PageTransition className="min-h-screen bg-ink text-cream overflow-x-hidden" data-testid="landing-page">
      <Nav transparent />

      {/* ============================================ HERO */}
      <section className="relative min-h-[100vh] w-full flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 76% 42%, rgba(201,123,74,0.13), transparent 56%)," +
                "radial-gradient(ellipse at 26% 82%, rgba(110,231,242,0.07), transparent 62%), #0B0B0D",
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: "repeating-linear-gradient(0deg,#F2ECE0 0px,#F2ECE0 1px,transparent 1px,transparent 3px)" }}
          />
        </div>

        {/* The hand — real signs, not decoration */}
        <div className="absolute right-0 lg:right-[3%] top-1/2 -translate-y-1/2 w-full lg:w-[46%] h-[58vh] lg:h-[76vh] opacity-90 lg:opacity-100 pointer-events-none">
          <HandRig ref={handRef} className="absolute inset-0" showCaption={false} />
        </div>

        <div className="relative max-w-[1440px] w-full mx-auto px-6 md:px-12 lg:px-24 pt-40 pb-28 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-7">
            <motion.div
              initial={reduced ? {} : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-8 h-px bg-copper" />
                <span className="micro-caps text-copper">
                  <Scramble text="Indian Sign Language ↔ English" speed={22} />
                </span>
              </div>

              <h1 className="font-display text-[3.5rem] md:text-[5.5rem] lg:text-[7rem] leading-[0.92] tracking-[-0.02em] text-cream mb-8">
                <SplitText text="Every gesture," stagger={0.028} />
                <br />
                <span className="italic text-copper copper-glow">
                  <SplitText text="heard." delay={0.42} stagger={0.05} />
                </span>
              </h1>

              <p className="text-lg md:text-xl text-cream/70 max-w-xl leading-relaxed mb-8">
                A real-time <span className="text-cream">Indian Sign Language</span>{" "}
                translator over a <span className="text-cream">{VOCAB_SIZE}-word</span>{" "}
                vocabulary. Signers get captions and a voice. Non-signers type
                English and watch it signed back — replayed from real recordings,
                not an avatar.
              </p>

              {/* what the hand is doing right now */}
              <div className="h-12 mb-8">
                <AnimatePresence mode="wait">
                  {word ? (
                    <motion.div
                      key={word}
                      initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="flex items-baseline gap-3 flex-wrap"
                    >
                      <span className="micro-caps text-copper">now signing</span>
                      <span className="font-display text-3xl tracking-tight">{pretty(word)}</span>
                      <span className="text-[11px] text-cream/30">
                        real recording · {source === "bundled" ? "bundled with the app" : "from the server"}
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-xs text-cream/30"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                      Loading a sign…
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Magnetic strength={0.32}>
                  <motion.button
                    data-testid="landing-cta-start"
                    onClick={() => setOnboardOpen(true)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                    className="btn-copper focus-ring"
                  >
                    Start translating
                    <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
                  </motion.button>
                </Magnetic>
                <Link to="/reverse" data-testid="landing-cta-reverse" className="btn-ghost-cream focus-ring">
                  Try reverse mode
                </Link>
                <PrivacyBadge className="ml-2" />
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-5 relative hidden lg:block" aria-hidden="true" />
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-cream/40 text-[10px] uppercase tracking-[0.3em]">
          <span>Scroll</span>
          <motion.div
            className="w-px h-8 bg-cream/20 origin-top"
            animate={reduced ? {} : { scaleY: [0.3, 1, 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </section>

      {/* ============================================ VOCABULARY RIBBON */}
      <section className="relative py-10 border-y border-cream/[0.08] overflow-hidden">
        <div className="px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto mb-6 flex items-baseline justify-between gap-4">
          <span className="micro-caps text-cream/40">
            The whole vocabulary — {VOCAB_SIZE} signs
          </span>
          <span className="hidden sm:block text-[11px] text-cream/25">
            hover a word to see it signed
          </span>
        </div>

        <Marquee speed={90}>
          {ALL_WORDS.slice(0, 90).map((w) => (
            <button
              key={w}
              onMouseEnter={() => hoverWord(w)}
              onMouseLeave={leaveWord}
              className="focus-ring text-cream/35 hover:text-copper transition-colors text-sm uppercase tracking-widest shrink-0"
            >
              {pretty(w)}
            </button>
          ))}
        </Marquee>
        <div className="h-3" />
        <Marquee speed={110} reverse>
          {ALL_WORDS.slice(90, 180).map((w) => (
            <button
              key={w}
              onMouseEnter={() => hoverWord(w)}
              onMouseLeave={leaveWord}
              className="focus-ring text-cream/25 hover:text-cyan transition-colors text-sm uppercase tracking-widest shrink-0"
            >
              {pretty(w)}
            </button>
          ))}
        </Marquee>
      </section>

      {/* ============================================ MEASURED */}
      <section className="relative py-24 px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto">
        <Reveal>
          <div className="micro-caps text-cream/40 mb-8">Measured, not claimed</div>
        </Reveal>
        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4" gap={0.07}>
          {[
            { v: stats?.acc, suffix: "%", d: 1, label: "Test accuracy", sub: stats?.name ? `${stats.name}, held-out split` : "best model" },
            { v: stats?.latency, suffix: " ms", d: 2, label: "Inference latency", sub: "mean, one forward pass" },
            { v: stats?.classes, suffix: "", d: 0, label: "Sign classes", sub: "after filtering rare words" },
            { v: stats?.test, suffix: "", d: 0, label: "Test clips", sub: "never seen in training" },
          ].map((s) => (
            <StaggerItem key={s.label}>
              <Tilt max={5}>
                <Spotlight className="border border-cream/10 rounded-sm p-6 h-full">
                  <div className="font-display text-3xl md:text-4xl tracking-tight text-cream mb-2">
                    {s.v == null ? (
                      <span className="text-cream/25 text-2xl">—</span>
                    ) : (
                      <CountUp value={s.v} decimals={s.d} suffix={s.suffix} />
                    )}
                  </div>
                  <div className="text-sm text-cream/70">{s.label}</div>
                  <div className="text-[11px] text-cream/30 mt-1">{s.sub}</div>
                </Spotlight>
              </Tilt>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal delay={0.1}>
          <p className="text-xs text-cream/30 mt-6 leading-relaxed max-w-2xl">
            These come from <code className="font-mono">GET /api/comparison</code>, which
            reads the training log off disk. If the backend is not running they
            show as dashes rather than as invented numbers.
          </p>
        </Reveal>
      </section>

      {/* ============================================ FEATURES */}
      <section className="relative py-24 px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto">
        <ScrollSkew intensity={0.6}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
            <div className="lg:col-span-4">
              <span className="micro-caps">What it does</span>
            </div>
            <div className="lg:col-span-8">
              <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight">
                Three loops, one goal —{" "}
                <span className="italic text-copper">be understood without translation friction.</span>
              </h2>
            </div>
          </div>

          <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-6" gap={0.1}>
            {FEATURE_CARDS.map((card, i) => {
              const Icon = iconMap[card.icon];
              return (
                <StaggerItem key={card.kicker}>
                  <Tilt className="h-full" max={6}>
                    <Spotlight className="glass-card rounded-sm p-8 group h-full" data-testid={`feature-card-${i}`}>
                      <motion.div
                        className="w-10 h-10 rounded-sm bg-copper/10 border border-copper/30 flex items-center justify-center mb-8"
                        whileHover={{ rotate: 8, scale: 1.1, backgroundColor: "rgba(201,123,74,0.22)" }}
                        transition={{ type: "spring", stiffness: 320, damping: 18 }}
                      >
                        <Icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
                      </motion.div>
                      <div className="micro-caps mb-3">{card.kicker}</div>
                      <h3 className="font-display text-2xl leading-snug mb-4">{card.title}</h3>
                      <p className="text-cream/60 text-sm leading-relaxed">{card.body}</p>
                    </Spotlight>
                  </Tilt>
                </StaggerItem>
              );
            })}
          </Stagger>
        </ScrollSkew>
      </section>

      {/* ============================================ PIPELINE, scroll-driven */}
      <ScrollScene height="260vh">
        {(p) => (
          <div className="w-full px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-5">
                <span className="micro-caps">The pipeline</span>
                <h3 className="font-display text-3xl md:text-4xl leading-tight mt-4 mb-6">
                  Frames in. Landmarks out.{" "}
                  <span className="italic text-copper">Nothing written to disk.</span>
                </h3>
                <p className="text-cream/60 leading-relaxed text-sm">
                  The browser sends JPEG frames to a local FastAPI server at 12 fps.
                  MediaPipe extracts 21+21 hand and 33 pose landmarks there — the
                  same code path used to build the training data, so there is no
                  train/serve skew. Frames are processed in memory and discarded;
                  only coordinates are used.
                </p>
                <div className="mt-8 h-px bg-cream/10 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-copper"
                    style={{ width: `${p * 100}%` }}
                  />
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ["01", "Capture", "Webcam frame → JPEG, throttled to 12 fps."],
                  ["02", "Landmarks", "MediaPipe Holistic, server-side in Python."],
                  ["03", "Model", `BiLSTM or 1D CNN → one of ${VOCAB_SIZE} signs.`],
                  ["04", "Voice", "Web Speech reads the label aloud."],
                ].map(([n, t, b], i) => {
                  // Each card lights as the scroll passes its quarter.
                  const lit = p > i / 4.4;
                  return (
                    <motion.div
                      key={n}
                      animate={{
                        opacity: lit ? 1 : 0.28,
                        y: lit ? 0 : 14,
                        borderColor: lit ? "rgba(201,123,74,0.45)" : "rgba(242,236,224,0.10)",
                      }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="glass-card rounded-sm p-6 border"
                    >
                      <div className="flex items-baseline justify-between mb-3">
                        <span className="font-display text-3xl text-copper">{n}</span>
                        <ShieldCheck className="w-4 h-4 text-cream/30" strokeWidth={1.5} />
                      </div>
                      <div className="font-medium mb-1">{t}</div>
                      <div className="text-xs text-cream/50">{b}</div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </ScrollScene>

      {/* ============================================ GUEST NUDGE */}
      {guest && (
        <section className="relative px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto pb-8">
          <Reveal>
            <Parallax distance={24}>
              <div className="border border-copper/25 rounded-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                <div>
                  <div className="text-sm text-cream/90 mb-1">You are using Silent Voice as a guest.</div>
                  <div className="text-xs text-cream/45 leading-relaxed max-w-xl">
                    Everything works, but transcripts and practice scores are
                    discarded when you close the tab. An account stores them in a
                    database on this machine.
                  </div>
                </div>
                <Magnetic strength={0.16}>
                  <Link to="/" className="btn-copper focus-ring shrink-0">
                    Create an account
                    <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
                  </Link>
                </Magnetic>
              </div>
            </Parallax>
          </Reveal>
        </section>
      )}

      {/* ============================================ FOOTER */}
      <footer className="relative border-t border-cream/10 py-12 px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-display text-2xl mb-1">Silent Voice</div>
            <div className="text-xs text-cream/40">
              Built accessibility-first. Trained on the INCLUDE dataset —{" "}
              {VOCAB_SIZE} word-level signs.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-cream/60">
            <Link to="/about" className="hover:text-cream focus-ring rounded-sm">About</Link>
            <Link to="/research" className="hover:text-cream focus-ring rounded-sm">Research</Link>
            <Link to="/rubric" className="hover:text-cream focus-ring rounded-sm">Rubric</Link>
            <Link to="/settings" className="hover:text-cream focus-ring rounded-sm">Settings</Link>
          </div>
        </div>
      </footer>

      <OnboardingModal open={onboardOpen} onClose={() => setOnboardOpen(false)} />
    </PageTransition>
  );
}
