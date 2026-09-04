import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Radio, MessageSquare, Sparkles, ShieldCheck } from "lucide-react";
import Nav from "../components/Nav";
import { Reveal, Stagger, StaggerItem, SplitText, Magnetic, Tilt, CountUp, PageTransition, useRipple, EASE } from "../components/motion";
import LandmarkOverlay from "../components/LandmarkOverlay";
import PrivacyBadge from "../components/PrivacyBadge";
import OnboardingModal from "../components/OnboardingModal";
import { FEATURE_CARDS } from "../lib/mockData";

const iconMap = { Radio, MessageSquare, Sparkles };

export default function Landing() {
  const [onboardOpen, setOnboardOpen] = useState(false);
  const reduced = useReducedMotion();

  return (
    <div className="min-h-screen bg-ink text-cream overflow-x-hidden" data-testid="landing-page">
      <Nav transparent />

      {/* HERO */}
      <section className="relative min-h-[100vh] w-full flex items-center overflow-hidden">
        <div className="absolute inset-0">
          {/* Radial vignette wash instead of stock photo — landmark skeleton IS the hero visual */}
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 75% 40%, rgba(201,123,74,0.10), transparent 55%), radial-gradient(ellipse at 30% 80%, rgba(110,231,242,0.06), transparent 60%), #0B0B0D" }} />
          <div className="absolute right-[2%] top-[4%] w-[54%] aspect-square opacity-95">
            <LandmarkOverlay />
          </div>
          {/* Subtle horizontal scanlines add cinematic texture without an ambiguous photo */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, #F2ECE0 0px, #F2ECE0 1px, transparent 1px, transparent 3px)" }} />
        </div>

        <div className="relative max-w-[1440px] w-full mx-auto px-6 md:px-12 lg:px-24 pt-40 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-7">
            <motion.div
              initial={reduced ? {} : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-8 h-px bg-copper" />
                <span className="micro-caps text-copper">Indian Sign Language ↔ English</span>
              </div>
              <h1 className="font-display text-[3.5rem] md:text-[5.5rem] lg:text-[7rem] leading-[0.92] tracking-[-0.02em] text-cream mb-8">
                <SplitText text="Every gesture," stagger={0.028} />
                <br />
                <span className="italic text-copper copper-glow">
                  <SplitText text="heard." delay={0.42} stagger={0.05} />
                </span>
              </h1>
              <p className="text-lg md:text-xl text-cream/70 max-w-xl leading-relaxed mb-12">
                A real-time <span className="text-cream">Indian Sign Language</span> translator over a <span className="text-cream">261-word</span> vocabulary. Signers get captions and a voice. Non-signers type English and watch it signed back — replayed from real recordings, not an avatar.
              </p>
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
                <Link
                  to="/reverse"
                  data-testid="landing-cta-reverse"
                  className="btn-ghost-cream focus-ring"
                >
                  Try reverse mode
                </Link>
                <PrivacyBadge className="ml-2" />
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-5 relative hidden lg:block" aria-hidden="true" />
        </div>

        {/* scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-cream/40 text-[10px] uppercase tracking-[0.3em]">
          <span>Scroll</span>
          <div className="w-px h-8 bg-cream/20" />
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative py-32 px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          <div className="lg:col-span-4">
            <span className="micro-caps">What it does</span>
          </div>
          <div className="lg:col-span-8">
            <h2 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight">
              Three loops, one goal — <span className="italic text-copper">be understood without translation friction.</span>
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURE_CARDS.map((card, i) => {
            const Icon = iconMap[card.icon];
            return (
              <motion.div
                key={card.kicker}
                initial={reduced ? {} : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: i * 0.1, ease: EASE }}
                data-testid={`feature-card-${i}`}
              >
                <Tilt className="glass-card rounded-sm p-8 group h-full" max={5}>
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
                </Tilt>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS strip */}
      <section className="relative py-32 px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto">
        <div className="hair-divider mb-16" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <span className="micro-caps">The pipeline</span>
            <h3 className="font-display text-3xl md:text-4xl leading-tight mt-4 mb-6">
              Frames in. Landmarks out. <span className="italic text-copper">Nothing written to disk.</span>
            </h3>
            <p className="text-cream/60 leading-relaxed">
              The browser sends JPEG frames to a local FastAPI server at 12 fps. MediaPipe extracts 21+21 hand and 33 pose landmarks there — the same code path used to build the training data, so there is no train/serve skew. Frames are processed in memory and discarded; only coordinates are used.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ["01", "Capture", "Webcam frame → JPEG, throttled to 12 fps."],
              ["02", "Landmarks", "MediaPipe Holistic, server-side in Python."],
              ["03", "Model", "BiLSTM or 1D CNN → one of 261 signs."],
              ["04", "Voice", "Web Speech reads the label aloud."],
            ].map(([n, t, b]) => (
              <div key={n} className="glass-card rounded-sm p-6">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-display text-3xl text-copper">{n}</span>
                  <ShieldCheck className="w-4 h-4 text-cream/30" strokeWidth={1.5} />
                </div>
                <div className="font-medium mb-1">{t}</div>
                <div className="text-xs text-cream/50">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative border-t border-cream/10 py-12 px-6 md:px-12 lg:px-24 max-w-[1440px] mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-display text-2xl mb-1">Silent Voice</div>
            <div className="text-xs text-cream/40">Built accessibility-first. INCLUDE dataset + custom phrase pack.</div>
          </div>
          <div className="flex items-center gap-6 text-sm text-cream/60">
            <Link to="/about" className="hover:text-cream focus-ring rounded-sm">About</Link>
            <Link to="/settings" className="hover:text-cream focus-ring rounded-sm">Settings</Link>
            <Link to="/auth" className="hover:text-cream focus-ring rounded-sm">Sign in</Link>
          </div>
        </div>
      </footer>

      <OnboardingModal open={onboardOpen} onClose={() => setOnboardOpen(false)} />
    </div>
  );
}
