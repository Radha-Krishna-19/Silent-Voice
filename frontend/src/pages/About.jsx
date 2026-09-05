import { Lock, EyeOff, ShieldCheck, Cpu } from "lucide-react";
import Nav from "../components/Nav";
import { Reveal, Stagger, StaggerItem, PageTransition, Tilt } from "../components/motion";
import { Scramble, Parallax, ScrollSkew, Spotlight } from "../components/motion/advanced";
import { VOCAB_SIZE } from "../lib/vocabulary";

export default function About() {
  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="about-page">
      <Nav />
      <PageTransition>
      <main className="pt-28 pb-16 px-6 md:px-12 lg:px-24 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
          <Reveal className="lg:col-span-5">
            <div className="micro-caps mb-3"><Scramble text="About Silent Voice" /></div>
            <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-[1.05]">
              Accessibility is <span className="italic text-copper">the product</span>, not a feature.
            </h1>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-7 text-cream/70 leading-relaxed space-y-5 text-lg">
            <p>
              Deaf and hard-of-hearing signers face translation friction in almost every unstructured setting — clinics, classrooms, government counters, family calls. Silent Voice removes that friction with a browser tab.
            </p>
            <p>
              This is built specifically for <span className="text-cream">Indian Sign Language</span> — a distinct language with its own grammar and a <span className="text-cream">two-handed manual alphabet</span>, not a variant of ASL. Vocabulary is exactly the {VOCAB_SIZE} INCLUDE classes that survived filtering — nothing was recorded in-house, and nothing is fingerspelled.
            </p>
            <p>
              We built this as an accessibility-first web app: minimum viable vocabulary, maximum viable trust. The model is small enough to run in real time, the pipeline is small enough to audit, and the data footprint is small enough to be nearly nothing.
            </p>
          </Reveal>
        </div>

        <div className="hair-divider mb-12" />

        {/* HOW IT WORKS */}
        <section className="mb-20">
          <Reveal>
            <div className="micro-caps mb-6"><Scramble text="How it works" /></div>
          </Reveal>
          <Stagger className="grid grid-cols-1 md:grid-cols-4 gap-4" gap={0.08}>
            {[
              ["01", "Webcam frame", "Captured in-browser, encoded as JPEG, sent to a local server."],
              ["02", "MediaPipe landmarks", "21+21 hand and 33 pose keypoints, extracted server-side."],
              ["03", "Model inference", `BiLSTM or 1D CNN classifies one of ${VOCAB_SIZE} isolated signs.`],
              ["04", "Speech", "Web Speech reads the predicted word aloud in the browser."],
            ].map(([n, t, b]) => (
              <StaggerItem key={n}>
                <Tilt max={6} className="h-full">
                  <Spotlight className="glass-card rounded-sm p-6 h-full">
                    <div className="font-display text-4xl text-copper mb-3">{n}</div>
                    <div className="font-medium mb-2">{t}</div>
                    <div className="text-sm text-cream/55 leading-relaxed">{b}</div>
                  </Spotlight>
                </Tilt>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* THREAT MODEL */}
        <ScrollSkew intensity={0.5}>
          <section>
            <Reveal>
              <div className="micro-caps mb-6"><Scramble text="Threat model & security" /></div>
            </Reveal>
            <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4" gap={0.09}>
              {[
                [EyeOff, "Webcam frames are never written to disk",
                  "Frames ARE sent to the local server — MediaPipe runs there. They are processed in memory and discarded; only landmark coordinates are used, and no image is ever saved."],
                [Lock, "Local-only, over plain HTTP",
                  "The server listens on localhost without TLS. Passwords are scrypt-hashed before storage, but they cross the wire in the clear, so do not expose this to a network or reuse a password you care about."],
                [ShieldCheck, "Accounts persist, guests do not",
                  "Signing in writes transcripts and practice scores to a SQLite file at backend/data/silentvoice.db, owned by your user id. As a guest nothing is written at all — not to the server, not to this browser."],
                [Cpu, "Auditable and reproducible",
                  "Both models train from one shared loop on an identical seed-42 split. Metrics come from ml/logs/comparison.json; the UI shows blanks when no run exists. Architecture switches per request."],
              ].map(([Icon, t, b]) => (
                <StaggerItem key={t}>
                  <Spotlight className="glass-card rounded-sm p-8 h-full" color="rgba(110,231,242,0.10)">
                    <div className="w-10 h-10 rounded-sm bg-cyan/10 border border-cyan/30 flex items-center justify-center mb-6">
                      <Icon className="w-4 h-4 text-cyan" strokeWidth={1.5} />
                    </div>
                    <div className="font-display text-2xl mb-3 leading-tight">{t}</div>
                    <div className="text-sm text-cream/60 leading-relaxed">{b}</div>
                  </Spotlight>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </ScrollSkew>

        <Parallax distance={20}>
          <p className="mt-16 text-xs text-cream/30 leading-relaxed max-w-2xl">
            Every claim on this page is checked against the code rather than
            written from intention. When a limitation is real it is stated as a
            limitation.
          </p>
        </Parallax>
      </main>
      </PageTransition>
    </div>
  );
}
