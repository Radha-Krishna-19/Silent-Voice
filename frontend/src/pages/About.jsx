import { Lock, EyeOff, ShieldCheck, Cpu } from "lucide-react";
import Nav from "../components/Nav";

export default function About() {
  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="about-page">
      <Nav />
      <main className="pt-28 pb-16 px-6 md:px-12 lg:px-24 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
          <div className="lg:col-span-5">
            <div className="micro-caps mb-3">About Silent Voice</div>
            <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-[1.05]">
              Accessibility is <span className="italic text-copper">the product</span>, not a feature.
            </h1>
          </div>
          <div className="lg:col-span-7 text-cream/70 leading-relaxed space-y-5 text-lg">
            <p>
              Deaf and hard-of-hearing signers face translation friction in almost every unstructured setting — clinics, classrooms, government counters, family calls. Silent Voice removes that friction with a browser tab.
            </p>
            <p>
              This is built specifically for <span className="text-cream">Indian Sign Language</span> — a distinct language with its own grammar and a <span className="text-cream">two-handed manual alphabet</span>, not a variant of ASL. Vocabulary is drawn from the INCLUDE dataset with additional phrase clips recorded in-house.
            </p>
            <p>
              We built this as an accessibility-first web app: minimum viable vocabulary, maximum viable trust. The model is small enough to run in real time, the pipeline is small enough to audit, and the data footprint is small enough to be nearly nothing.
            </p>
          </div>
        </div>

        <div className="hair-divider mb-12" />

        {/* HOW IT WORKS */}
        <section className="mb-20">
          <div className="micro-caps mb-6">How it works</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              ["01", "Webcam frame", "Captured in-browser, encoded as JPEG, sent to a local server."],
              ["02", "MediaPipe landmarks", "21+21 hand and 33 pose keypoints, extracted server-side."],
              ["03", "Model inference", "BiLSTM or 1D CNN classifies one of 261 isolated signs."],
              ["04", "Speech", "Web Speech reads the predicted word aloud in the browser."],
            ].map(([n, t, b]) => (
              <div key={n} className="glass-card rounded-sm p-6">
                <div className="font-display text-4xl text-copper mb-3">{n}</div>
                <div className="font-medium mb-2">{t}</div>
                <div className="text-sm text-cream/55 leading-relaxed">{b}</div>
              </div>
            ))}
          </div>
        </section>

        {/* THREAT MODEL */}
        <section>
          <div className="micro-caps mb-6">Threat model & security</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              [EyeOff, "Frames are never stored", "Frames ARE sent to the local server — MediaPipe runs there. They are processed in memory and discarded; nothing is written to disk, and only landmark coordinates are used."],
              [Lock, "Local-only, for now", "The app runs on localhost over plain HTTP. There is no TLS, no authentication and no remote deployment — so nothing crosses a network, but it is also not yet hardened for one."],
              [ShieldCheck, "No persistence at all", "Sessions are ephemeral. There is no database and no account system, so transcripts vanish when the tab closes. The Transcripts page is a UI shell."],
              [Cpu, "Auditable and reproducible", "Both models train from one shared loop on an identical seed-42 split. Metrics come from ml/logs/comparison.json; the UI shows blanks when no run exists. Architecture switches per request."],
            ].map(([Icon, t, b]) => (
              <div key={t} className="glass-card rounded-sm p-8">
                <div className="w-10 h-10 rounded-sm bg-cyan/10 border border-cyan/30 flex items-center justify-center mb-6">
                  <Icon className="w-4 h-4 text-cyan" strokeWidth={1.5} />
                </div>
                <div className="font-display text-2xl mb-3 leading-tight">{t}</div>
                <div className="text-sm text-cream/60 leading-relaxed">{b}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
