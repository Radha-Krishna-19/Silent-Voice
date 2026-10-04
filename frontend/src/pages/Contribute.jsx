import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, RotateCcw, CheckCircle2, AlertTriangle, Database } from "lucide-react";
import Nav from "../components/Nav";
import LandmarkOverlay from "../components/LandmarkOverlay";
import useLiveCapture from "../hooks/useLiveCapture";
import { fetchContributions, SERVER_HINT } from "../lib/api";
import { pretty } from "../lib/vocabulary";
import { Reveal, Magnetic, useRipple, PageTransition, EASE } from "../components/motion";

const READY_MS = 1500;  // time to get both hands up after the click, before capture starts
const HOLD_MS = 2600;   // matches the clip length Practice mode scores against

export default function Contribute() {
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("idle");   // idle | ready | recording | saved
  const [counts, setCounts] = useState(null);
  const timerRef = useRef(null);

  const cap = useLiveCapture({ mode: "contribute", contributeLabel: label });
  const live = cap.isLive;

  const refreshCounts = () => {
    fetchContributions().then(setCounts).catch(() => setCounts(null));
  };

  useEffect(refreshCounts, []);

  useEffect(() => {
    if (!cap.contribution) return;
    setPhase("saved");
    if (cap.contribution.saved) refreshCounts();
  }, [cap.contribution]);

  const canRecord = live && label.trim().length > 0;

  // One click starts it; you then have READY_MS with both hands free to get
  // into position before the camera actually starts capturing. Recording is
  // timed and stops itself — nothing to click again mid-sign.
  const start = () => {
    if (!live) { cap.start(); return; }
    if (!canRecord) return;
    setPhase("ready");
    timerRef.current = setTimeout(() => {
      setPhase("recording");
      cap.setRecording(true);
      timerRef.current = setTimeout(finish, HOLD_MS);
    }, READY_MS);
  };

  const finish = () => {
    clearTimeout(timerRef.current);
    cap.setRecording(false);
    // phase flips to "saved" once the server's response lands (see effect above)
  };

  const cancel = () => {
    clearTimeout(timerRef.current);
    cap.setRecording(false);
    setPhase("idle");
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="contribute-page">
      <Nav />
      <PageTransition>
        <main className="pt-24 pb-16 px-6 md:px-10 lg:px-16 max-w-[1100px] mx-auto">
          <Reveal>
            <div className="micro-caps mb-2">Contribute a sign</div>
            <h1 className="font-display text-3xl md:text-5xl tracking-tight mb-3">
              Grow the <span className="italic text-copper">dataset.</span>
            </h1>
            <p className="text-cream/55 max-w-2xl leading-relaxed mb-3">
              Record a sign and it's saved as a landmark clip under that word, alongside a short log
              entry — the same per-frame features the models already train on.
            </p>
            <p className="text-cream/35 max-w-2xl leading-relaxed text-sm mb-8 flex items-start gap-2">
              <Database className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
              Nothing retrains automatically. Contributed clips sit in a review queue — one
              unreviewed clip could skew a class — and are only folded into training in a
              deliberate, offline batch.
            </p>
          </Reveal>

          {(cap.error || cap.status === "offline") && (
            <div className="mb-6 rounded-sm border border-copper/40 bg-copper/[0.06] p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-copper mt-0.5 shrink-0" strokeWidth={1.5} />
              <div className="text-sm text-cream/80">
                {cap.error ?? `Backend unreachable — ${SERVER_HINT}`}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7">
              <div className="relative rounded-sm overflow-hidden bg-black aspect-[4/3] border border-cream/10">
                <video
                  ref={cap.videoRef}
                  playsInline muted
                  className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${live ? "opacity-100" : "opacity-0"}`}
                />
                <canvas ref={cap.canvasRef} className="hidden" />
                {live && <LandmarkOverlay live={cap.landmarks} />}

                {!live && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <Video className="w-8 h-8 text-cream/20" strokeWidth={1.2} />
                    <span className="text-sm text-cream/35">Camera off</span>
                  </div>
                )}

                <AnimatePresence>
                  {phase === "ready" && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none"
                    >
                      <span className="font-display text-3xl text-cream">Get ready…</span>
                    </motion.div>
                  )}
                  {phase === "recording" && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 border-2 border-red-500/60 rounded-sm pointer-events-none"
                    >
                      <motion.div
                        className="absolute bottom-0 left-0 h-1 bg-red-500"
                        initial={{ width: "0%" }} animate={{ width: "100%" }}
                        transition={{ duration: HOLD_MS / 1000, ease: "linear" }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={label}
                  onChange={(e) => { setLabel(e.target.value); setPhase("idle"); }}
                  placeholder="Word being signed, e.g. thank_you"
                  data-testid="contribute-label"
                  className="flex-1 bg-transparent border border-cream/15 rounded-sm px-4 py-3 text-sm placeholder:text-cream/25 focus-ring"
                />
              </div>

              <div className="mt-3">
                <Magnetic strength={0.2}>
                  <RecordButton
                    live={live}
                    phase={phase}
                    disabled={live && !canRecord}
                    onClick={phase === "ready" || phase === "recording" ? cancel : start}
                  />
                </Magnetic>
              </div>

              <AnimatePresence mode="wait">
                {phase === "saved" && cap.contribution && (
                  <motion.div
                    key={cap.contribution.file ?? cap.contribution.error}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className={`mt-4 rounded-sm border p-4 flex items-start gap-3 text-sm ${
                      cap.contribution.saved
                        ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
                        : "border-copper/40 bg-copper/[0.06] text-cream/80"
                    }`}
                  >
                    {cap.contribution.saved
                      ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
                      : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />}
                    <div>
                      {cap.contribution.saved
                        ? <>Saved {cap.contribution.frame_count} frames under “{pretty(cap.contribution.slug)}”. Queued for review.</>
                        : cap.contribution.error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-5">
              <div className="micro-caps mb-2">Review queue</div>
              <div className="glass-card rounded-sm p-5 min-h-[200px]">
                {!counts || counts.total === 0 ? (
                  <div className="text-sm text-cream/35">No contributions yet.</div>
                ) : (
                  <>
                    <div className="font-display text-3xl text-copper mb-1">{counts.total}</div>
                    <div className="text-[10px] uppercase tracking-widest text-cream/35 mb-4">
                      clip{counts.total === 1 ? "" : "s"} awaiting offline review
                    </div>
                    <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                      {Object.entries(counts.words).map(([word, n]) => (
                        <div key={word} className="flex items-center justify-between text-sm">
                          <span className="text-cream/70">{pretty(word)}</span>
                          <span className="text-cream/35">{n}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="text-[10px] text-cream/30 mt-5 leading-relaxed">
                  Click record, then get both hands up — there's a moment to get into position
                  before it starts capturing, and it stops itself. A batch of reviewed clips
                  becomes a new training run via <code>ml/scripts/preprocess.py</code> —
                  deliberately offline, not triggered from here.
                </div>
              </div>
            </div>
          </div>
        </main>
      </PageTransition>
    </div>
  );
}

function RecordButton({ live, phase, onClick, disabled }) {
  const { fire, layer } = useRipple();
  const active = phase === "ready" || phase === "recording";
  return (
    <button
      onClick={(e) => { fire(e); onClick(); }}
      disabled={disabled}
      data-testid="contribute-record"
      className={`focus-ring relative overflow-hidden w-full py-3 rounded-sm text-xs uppercase tracking-widest font-medium transition-colors disabled:opacity-40 ${
        active ? "bg-red-500 text-white" : "btn-copper justify-center"
      }`}
    >
      {layer}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {!live ? <><Video className="w-3.5 h-3.5" strokeWidth={2} /> Start camera</>
          : phase === "ready" ? "Get ready… (click to cancel)"
          : phase === "recording" ? "Recording… (click to cancel)"
          : <><RotateCcw className="w-3.5 h-3.5" strokeWidth={2} /> Record a clip</>}
      </span>
    </button>
  );
}
