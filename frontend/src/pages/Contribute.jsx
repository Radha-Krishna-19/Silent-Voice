import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, RotateCcw, CheckCircle2, AlertTriangle, Database, Cpu, Loader2, Film } from "lucide-react";
import Nav from "../components/Nav";
import LandmarkOverlay from "../components/LandmarkOverlay";
import useLiveCapture from "../hooks/useLiveCapture";
import {
  fetchContributions, fetchStatus, uploadContribution, fetchRetrainStatus, startRetrain, SERVER_HINT,
} from "../lib/api";
import { pretty } from "../lib/vocabulary";
import { Reveal, Magnetic, useRipple, PageTransition, EASE } from "../components/motion";

const READY_MS = 1500;  // time to get both hands up after the click, before capture starts
const HOLD_MS = 3000;   // clip length; INCLUDE clips are ~2-4 s

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm", "video/mp4"]) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

export default function Contribute() {
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState("idle");   // idle | ready | recording | uploading | done
  const [result, setResult] = useState(null);
  const [counts, setCounts] = useState(null);
  const [vocab, setVocab] = useState([]);
  const [retrain, setRetrain] = useState(null);
  const timerRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const pollRef = useRef(null);

  // "contribute" mode on the socket = landmark preview only; the clip itself is
  // recorded locally as a real video and uploaded once it ends.
  const cap = useLiveCapture({ mode: "contribute", contributeLabel: label });
  const live = cap.isLive;

  const refreshCounts = () => fetchContributions().then(setCounts).catch(() => setCounts(null));
  const pollRetrain = () =>
    fetchRetrainStatus()
      .then((s) => {
        setRetrain(s);
        if (s.running) {
          pollRef.current = setTimeout(pollRetrain, 2000);
        } else {
          refreshCounts();
        }
      })
      .catch(() => {});

  useEffect(() => {
    refreshCounts();
    pollRetrain();
    fetchStatus().then((s) => setVocab(s.vocabulary || [])).catch(() => {});
    return () => { clearTimeout(timerRef.current); clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRecord = live && label.trim().length > 0;
  const isNewWord = label.trim() && vocab.length > 0 &&
    !vocab.includes(label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));

  const start = () => {
    if (!live) { cap.start(); return; }
    if (!canRecord) return;
    const stream = cap.streamRef.current;
    const mime = pickMime();
    if (!stream || mime === null) {
      setResult({ error: "This browser cannot record video (MediaRecorder unavailable)." });
      setPhase("done");
      return;
    }
    setResult(null);
    setPhase("ready");
    timerRef.current = setTimeout(() => {
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000 } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = upload;
      recRef.current = rec;
      rec.start(250);
      setPhase("recording");
      timerRef.current = setTimeout(() => rec.state !== "inactive" && rec.stop(), HOLD_MS);
    }, READY_MS);
  };

  const upload = async () => {
    const blob = new Blob(chunksRef.current, { type: recRef.current?.mimeType || "video/webm" });
    if (!recRef.current || recRef.current._cancelled) return;
    setPhase("uploading");
    try {
      const r = await uploadContribution(label.trim(), blob);
      setResult(r);
    } catch (e) {
      setResult({ error: `Upload failed — ${e?.message ?? "server unreachable"}. ${SERVER_HINT}` });
    }
    setPhase("done");
    refreshCounts();
  };

  const cancel = () => {
    clearTimeout(timerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current._cancelled = true;
      recRef.current.stop();
    }
    setPhase("idle");
  };

  const onRetrain = async () => {
    const r = await startRetrain({ models: ["cnn"], epochs: 40 }).catch((e) => ({ error: e?.message }));
    setRetrain(r);
    clearTimeout(pollRef.current);
    pollRef.current = setTimeout(pollRetrain, 1500);
  };

  const busy = phase === "ready" || phase === "recording";

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
              Record a sign. The video is saved, its skeleton is extracted with the same MediaPipe
              pipeline used for the INCLUDE dataset, and the clip joins the training set. Retrain from
              this page and the server switches to the new model when it finishes.
            </p>
            <p className="text-cream/35 max-w-2xl leading-relaxed text-sm mb-8 flex items-start gap-2">
              <Database className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
              Contributed clips are used for training only — the INCLUDE test set never changes, so
              accuracy stays comparable. A retrain is only deployed if test accuracy does not drop.
            </p>
          </Reveal>

          {(cap.error || cap.status === "offline") && (
            <div className="mb-6 rounded-sm border border-copper/40 bg-copper/[0.06] p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-copper mt-0.5 shrink-0" strokeWidth={1.5} />
              <div className="text-sm text-cream/80">{cap.error ?? `Backend unreachable — ${SERVER_HINT}`}</div>
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
                {live && (
                  <div className={`absolute top-3 left-3 text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm ${
                    cap.handsVisible ? "bg-emerald-500/20 text-emerald-300" : "bg-black/50 text-cream/50"}`}>
                    {cap.handsVisible ? "hands detected" : "show your hands"}
                  </div>
                )}

                <AnimatePresence>
                  {phase === "ready" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                      <span className="font-display text-3xl text-cream">Get ready…</span>
                    </motion.div>
                  )}
                  {phase === "recording" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 border-2 border-red-500/60 rounded-sm pointer-events-none">
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-red-300">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> REC
                      </div>
                      <motion.div className="absolute bottom-0 left-0 h-1 bg-red-500"
                        initial={{ width: "0%" }} animate={{ width: "100%" }}
                        transition={{ duration: HOLD_MS / 1000, ease: "linear" }} />
                    </motion.div>
                  )}
                  {phase === "uploading" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 pointer-events-none">
                      <Loader2 className="w-6 h-6 animate-spin text-copper" />
                      <span className="text-sm text-cream/80">Saving video and extracting skeleton…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4">
                <input
                  value={label}
                  list="contribute-vocab"
                  onChange={(e) => { setLabel(e.target.value); if (!busy) setPhase("idle"); }}
                  placeholder="Word being signed, e.g. thank_you"
                  data-testid="contribute-label"
                  className="w-full bg-transparent border border-cream/15 rounded-sm px-4 py-3 text-sm placeholder:text-cream/25 focus-ring"
                />
                <datalist id="contribute-vocab">
                  {vocab.map((w) => <option key={w} value={w} />)}
                </datalist>
                {isNewWord && (
                  <div className="mt-2 text-xs text-cyan-300/80">
                    New word — not in the current vocabulary. It becomes a new class after retraining.
                  </div>
                )}
              </div>

              <div className="mt-3">
                <Magnetic strength={0.2}>
                  <RecordButton
                    live={live}
                    phase={phase}
                    disabled={(live && !canRecord) || phase === "uploading"}
                    onClick={busy ? cancel : start}
                  />
                </Magnetic>
              </div>

              <AnimatePresence mode="wait">
                {phase === "done" && result && <ResultCard key={result.video_file ?? result.error} r={result} />}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-5 space-y-5">
              <div>
                <div className="micro-caps mb-2">Contributed data</div>
                <div className="glass-card rounded-sm p-5 min-h-[160px]" data-testid="contribute-queue">
                  {!counts || !counts.videos ? (
                    <div className="text-sm text-cream/35">No contributions yet.</div>
                  ) : (
                    <>
                      <div className="flex gap-6 mb-4">
                        <div>
                          <div className="font-display text-3xl text-copper">{counts.videos}</div>
                          <div className="text-[10px] uppercase tracking-widest text-cream/35">videos stored</div>
                        </div>
                        <div>
                          <div className="font-display text-3xl text-emerald-300">{counts.tensors}</div>
                          <div className="text-[10px] uppercase tracking-widest text-cream/35">in training set</div>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                        {Object.entries(counts.words).map(([word, e]) => (
                          <div key={word} className="flex items-center justify-between text-sm">
                            <span className="text-cream/70">
                              {pretty(word)}
                              {!e.in_model && <span className="ml-2 text-[9px] uppercase tracking-widest text-cyan-300/70">new</span>}
                            </span>
                            <span className="text-cream/35 tabular-nums">{e.tensors}/{e.videos}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {counts?.video_dir && (
                    <div className="text-[10px] text-cream/30 mt-4 break-all leading-relaxed">
                      <Film className="inline w-3 h-3 mr-1" />videos: {counts.video_dir}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="micro-caps mb-2">Retrain</div>
                <div className="glass-card rounded-sm p-5" data-testid="contribute-retrain">
                  <p className="text-sm text-cream/55 mb-4 leading-relaxed">
                    Trains the 1D CNN on INCLUDE plus every accepted contribution (~5 min on a laptop CPU),
                    checks it on the INCLUDE test set and hot-swaps it into the server.
                  </p>
                  <button
                    onClick={onRetrain}
                    disabled={retrain?.running || !counts?.tensors}
                    className="btn-copper w-full justify-center text-xs uppercase tracking-widest disabled:opacity-40"
                  >
                    {retrain?.running
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Training…</>
                      : <><Cpu className="w-3.5 h-3.5" /> Retrain with contributions</>}
                  </button>
                  {!counts?.tensors && (
                    <div className="text-[11px] text-cream/35 mt-2">Add at least one accepted clip first.</div>
                  )}
                  {retrain?.error && <div className="text-xs text-copper mt-3">{retrain.error}</div>}
                  {retrain?.log_tail && (retrain.running || retrain.returncode != null) && (
                    <pre className="mt-3 text-[10px] leading-relaxed text-cream/50 bg-black/40 rounded-sm p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                      {retrain.log_tail}
                    </pre>
                  )}
                  {retrain?.last_report && !retrain.running && <RetrainReport rep={retrain.last_report} />}
                </div>
              </div>
            </div>
          </div>
        </main>
      </PageTransition>
    </div>
  );
}

function ResultCard({ r }) {
  const ok = r.tensor_saved;
  const p = r.current_model_prediction;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      data-testid="contribute-result"
      className={`mt-4 rounded-sm border p-4 flex items-start gap-3 text-sm ${
        ok ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-200" : "border-copper/40 bg-copper/[0.06] text-cream/80"}`}
    >
      {ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
        : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />}
      <div className="space-y-1">
        {r.error ? <div>{r.error}</div> : (
          <>
            <div>
              {r.video_saved ? "Video saved" : "Video not saved"} · {r.frames} frames · hands in {r.hand_frames}
            </div>
            <div className={ok ? "" : "text-copper"}>
              {ok ? <>Skeleton extracted and added to training as “{pretty(r.slug)}”.</> : r.reason}
            </div>
            {p && !p.mock && (
              <div className="text-cream/50 text-xs">
                Current model reads it as <span className="text-cream/80">{pretty(p.label)}</span> ({Math.round(p.confidence * 100)}%)
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function RetrainReport({ rep }) {
  return (
    <div className="mt-3 text-xs text-cream/60 space-y-1">
      <div className="text-cream/40">Last retrain · {rep.started} · {rep.minutes} min</div>
      {Object.entries(rep.models || {}).map(([m, e]) => (
        <div key={m}>
          {m.toUpperCase()}: {(e.test_acc * 100).toFixed(2)}% on {e.test_clips} INCLUDE test clips, {e.classes} classes
          {e.previous_test_acc != null && <> (was {(e.previous_test_acc * 100).toFixed(2)}%)</>} —{" "}
          <span className={e.deployed ? "text-emerald-300" : "text-copper"}>{e.deployed ? "deployed" : "not deployed"}</span>
        </div>
      ))}
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
          : phase === "uploading" ? "Processing…"
          : <><RotateCcw className="w-3.5 h-3.5" strokeWidth={2} /> Record a clip</>}
      </span>
    </button>
  );
}
