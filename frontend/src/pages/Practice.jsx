import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Circle, RotateCcw, ChevronRight, AlertTriangle, Video } from "lucide-react";
import Nav from "../components/Nav";
import SignPlayer from "../components/SignPlayer";
import LandmarkOverlay from "../components/LandmarkOverlay";
import useLiveCapture from "../hooks/useLiveCapture";
import { textToSign, scorePractice, fetchPracticeWords } from "../lib/api";
import { loadSettings } from "../lib/storage";
import { DOMAIN_PACKS, pretty } from "../lib/vocabulary";
import {
  Reveal, Stagger, StaggerItem, CountUp, AnimatedRing, Magnetic,
  PageTransition, useRipple, EASE,
} from "../components/motion";

export default function Practice() {
  const [packId, setPackId] = useState(DOMAIN_PACKS[0]?.id ?? null);
  const [wordIdx, setWordIdx] = useState(0);
  const [reference, setReference] = useState(null);
  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState("idle");   // idle | recording | scoring | done
  const [error, setError] = useState(null);
  const [backendWords, setBackendWords] = useState(null);
  const settings = useRef(loadSettings());
  const holdTimer = useRef(null);

  const pack = DOMAIN_PACKS.find((p) => p.id === packId) ?? DOMAIN_PACKS[0];
  const word = pack?.words?.[wordIdx] ?? null;

  const cap = useLiveCapture({ mode: "capture" });
  const live = cap.isLive;

  useEffect(() => {
    fetchPracticeWords().then(setBackendWords).catch(() => setBackendWords(null));
  }, []);

  // Load the reference recording for the current word.
  useEffect(() => {
    if (!word) return;
    setResult(null);
    setPhase("idle");
    textToSign(word.replace(/_/g, " "))
      .then((d) => setReference(d))
      .catch(() => setReference(null));
  }, [word]);

  const startAttempt = () => {
    if (!live) { cap.start(); return; }
    setResult(null);
    setError(null);
    setPhase("recording");
    cap.setRecording(true);
    // A sign takes ~2s; capture a fixed window so the learner isn't fighting a button.
    holdTimer.current = setTimeout(finishAttempt, 2600);
  };

  const finishAttempt = async () => {
    clearTimeout(holdTimer.current);
    cap.setRecording(false);
    setPhase("scoring");
    // Let the final frames reach the server before asking it to score.
    await new Promise((r) => setTimeout(r, 450));
    try {
      const r = await scorePractice(word, { mirror: settings.current.mirrorPractice });
      if (r.available === false) { setError(r.error); setPhase("idle"); return; }
      setResult(r);
      setPhase("done");
    } catch (err) {
      setError(err?.message ?? "scoring failed");
      setPhase("idle");
    }
  };

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const nextWord = () => {
    setWordIdx((i) => (i + 1) % (pack?.words?.length || 1));
  };

  const scoreable = backendWords?.available !== false;

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="practice-page">
      <Nav />
      <PageTransition>
        <main className="pt-24 pb-16 px-6 md:px-10 lg:px-16 max-w-[1500px] mx-auto">
          <Reveal>
            <div className="micro-caps mb-2">Practice mode</div>
            <h1 className="font-display text-3xl md:text-5xl tracking-tight mb-3">
              Sign it. <span className="italic text-copper">Get measured.</span>
            </h1>
            <p className="text-cream/55 max-w-3xl leading-relaxed mb-8">
              Your attempt is compared against the reference recording in the same landmark space the
              recogniser uses — hand shape, placement and movement scored separately.
              {backendWords?.count ? <> {backendWords.count} words available.</> : null}
            </p>
          </Reveal>

          {/* pack selector */}
          <Reveal delay={0.04}>
            <div className="flex flex-wrap gap-2 mb-8" data-testid="pack-tabs">
              {DOMAIN_PACKS.map((p) => {
                const active = p.id === pack?.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setPackId(p.id); setWordIdx(0); }}
                    className={`focus-ring relative px-4 py-2 rounded-sm text-xs uppercase tracking-widest transition-colors ${
                      active ? "text-ink" : "text-cream/50 hover:text-cream border border-cream/12"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="pack-pill"
                        className="absolute inset-0 bg-copper rounded-sm"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative z-10">{p.name}</span>
                    <span className={`relative z-10 ml-2 ${active ? "text-ink/60" : "text-cream/30"}`}>{p.count}</span>
                  </button>
                );
              })}
            </div>
          </Reveal>

          {(error || cap.status === "offline") && (
            <div className="mb-6 rounded-sm border border-copper/40 bg-copper/[0.06] p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-copper mt-0.5 shrink-0" strokeWidth={1.5} />
              <div className="text-sm text-cream/80">
                {error ?? "Backend unreachable — start it with: cd backend && python server.py"}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* REFERENCE */}
            <div className="lg:col-span-4">
              <div className="micro-caps mb-2">Reference</div>
              <div className="relative rounded-sm overflow-hidden bg-black aspect-[3/4] border border-cream/10">
                {reference?.items?.some((i) => i.available) ? (
                  <SignPlayer items={reference.items} fps={reference.fps} quant={reference.quant} playing />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-cream/25 text-sm">
                    Loading reference…
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-ink to-transparent">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={word}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.28, ease: EASE }}
                      className="font-display text-2xl"
                    >
                      {pretty(word)}
                    </motion.div>
                  </AnimatePresence>
                  <div className="text-[10px] uppercase tracking-widest text-cream/35 mt-1">
                    word {wordIdx + 1} of {pack?.words?.length ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {/* YOUR ATTEMPT */}
            <div className="lg:col-span-5">
              <div className="flex items-center justify-between mb-2">
                <span className="micro-caps">Your attempt</span>
                {phase === "recording" && (
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-red-400">
                    <Circle className="w-2 h-2 fill-red-400" strokeWidth={0} /> recording
                  </span>
                )}
              </div>
              <div className="relative rounded-sm overflow-hidden bg-black aspect-[3/4] border border-cream/10">
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
                  {phase === "recording" && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 border-2 border-red-500/60 rounded-sm pointer-events-none"
                    >
                      <motion.div
                        className="absolute bottom-0 left-0 h-1 bg-red-500"
                        initial={{ width: "0%" }} animate={{ width: "100%" }}
                        transition={{ duration: 2.6, ease: "linear" }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4 flex gap-2">
                <Magnetic strength={0.2} className="flex-1">
                  <RecordButton
                    live={live} phase={phase}
                    onClick={phase === "recording" ? finishAttempt : startAttempt}
                    disabled={!scoreable}
                  />
                </Magnetic>
                <button
                  onClick={nextWord}
                  className="focus-ring px-4 py-3 border border-cream/15 rounded-sm text-xs uppercase tracking-widest text-cream/60 hover:text-cream hover:border-cream/35 transition-colors flex items-center gap-1.5"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* SCORE */}
            <div className="lg:col-span-3">
              <div className="micro-caps mb-2">Score</div>
              <div className="glass-card rounded-sm p-6 min-h-[300px] flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                  {phase === "scoring" ? (
                    <motion.div key="scoring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-sm text-cream/45">Comparing landmarks…</motion.div>
                  ) : result ? (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      className="w-full flex flex-col items-center"
                    >
                      <AnimatedRing value={result.score} size={124} color={ringColour(result.score)}>
                        <div className="font-display text-4xl" style={{ color: ringColour(result.score) }}>
                          <CountUp value={result.score * 100} decimals={0} />
                        </div>
                        <div className="text-[9px] uppercase tracking-widest text-cream/35 mt-0.5">match</div>
                      </AnimatedRing>

                      <Stagger className="w-full mt-6 space-y-2.5" gap={0.08}>
                        {[
                          ["Hand shape", result.handshape],
                          ["Placement", result.location],
                          ["Movement", result.movement],
                        ].map(([l, v]) => (
                          <StaggerItem key={l}>
                            <Bar label={l} value={v} />
                          </StaggerItem>
                        ))}
                      </Stagger>
                    </motion.div>
                  ) : (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="text-center text-sm text-cream/35 leading-relaxed px-2">
                      {live ? "Record an attempt to be scored." : "Start the camera, then record."}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {result?.notes?.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="micro-caps mt-5 mb-2">Feedback</div>
                    <ul className="space-y-2">
                      {result.notes.map((n, i) => (
                        <motion.li
                          key={n}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.07, duration: 0.28, ease: EASE }}
                          className="text-xs text-cream/60 leading-relaxed flex gap-2"
                        >
                          <span className="text-copper mt-0.5">·</span>{n}
                        </motion.li>
                      ))}
                    </ul>
                    <div className="text-[10px] text-cream/30 mt-4 leading-relaxed">
                      Scored against one reference take. A valid regional variant may score low, and
                      facial expression — which carries grammar in ISL — is not measured.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* word strip */}
          <Reveal delay={0.1}>
            <div className="mt-10">
              <div className="micro-caps mb-3">{pack?.name}</div>
              <div className="flex flex-wrap gap-2">
                {(pack?.words ?? []).map((w, i) => (
                  <button
                    key={w}
                    onClick={() => setWordIdx(i)}
                    className={`focus-ring px-3 py-1.5 text-[11px] uppercase tracking-widest rounded-sm border transition-all ${
                      i === wordIdx
                        ? "border-copper text-copper scale-105"
                        : "border-cream/10 text-cream/35 hover:text-cream/70 hover:border-cream/25"
                    }`}
                  >
                    {pretty(w)}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>
        </main>
      </PageTransition>
    </div>
  );
}

function RecordButton({ live, phase, onClick, disabled }) {
  const { fire, layer } = useRipple();
  const recording = phase === "recording";
  return (
    <button
      onClick={(e) => { fire(e); onClick(); }}
      disabled={disabled || phase === "scoring"}
      data-testid="practice-record"
      className={`focus-ring relative overflow-hidden w-full py-3 rounded-sm text-xs uppercase tracking-widest font-medium transition-colors disabled:opacity-40 ${
        recording ? "bg-red-500 text-white" : "btn-copper justify-center"
      }`}
    >
      {layer}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {!live ? <><Video className="w-3.5 h-3.5" strokeWidth={2} /> Start camera</>
          : recording ? "Stop"
          : phase === "scoring" ? "Scoring…"
          : <><RotateCcw className="w-3.5 h-3.5" strokeWidth={2} /> Record attempt</>}
      </span>
    </button>
  );
}

function Bar({ label, value }) {
  const pct = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest mb-1">
        <span className="text-cream/45">{label}</span>
        <span className="text-cream/70"><CountUp value={pct * 100} decimals={0} suffix="%" /></span>
      </div>
      <div className="h-1 bg-cream/8 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: ringColour(pct) }}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </div>
    </div>
  );
}

function ringColour(v) {
  if (v >= 0.7) return "#6EE7F2";
  if (v >= 0.45) return "#C97B4A";
  return "#B6114D";
}
