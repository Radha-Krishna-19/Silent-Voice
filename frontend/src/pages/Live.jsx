import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, VolumeX, Volume2, Trash2, Circle, Video, VideoOff, AlertTriangle } from "lucide-react";
import Nav from "../components/Nav";
import LandmarkOverlay from "../components/LandmarkOverlay";
import AssemblingCaption from "../components/AssemblingCaption";
import ConfidenceChip from "../components/ConfidenceChip";
import PrivacyBadge from "../components/PrivacyBadge";
import Waveform from "../components/Waveform";
import useLiveCapture from "../hooks/useLiveCapture";
import { DOMAIN_PACKS, LIVE_CAPTION_QUEUE, RECENT_TRANSCRIPT } from "../lib/mockData";
import { loadSettings } from "../lib/storage";
import { saveSession } from "../lib/sessions";
import { CountUp, Magnetic, useRipple, PageTransition } from "../components/motion";

const mmss = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function Live() {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [domain, setDomain] = useState("everyday");
  const [model, setModel] = useState("bilstm");
  const [transcript, setTranscript] = useState([]);
  const [demoIdx, setDemoIdx] = useState(0);
  const scrollRef = useRef(null);
  const lastGloss = useRef(null);
  const startedAt = useRef(null);
  const settings = useRef(loadSettings());

  const cap = useLiveCapture({ model, mode: "continuous" });
  const live = cap.isLive;

  // Persist the session when the camera stops. Real entries only — an empty
  // session is not written, so Transcripts never fills with noise.
  const stopAndSave = () => {
    if (transcript.length && settings.current.saveSessions) {
      saveSession({
        entries: transcript,
        durationSec: cap.elapsed,
        model,
        startedAt: startedAt.current ?? new Date().toISOString(),
      });
    }
    cap.stop();
  };

  useEffect(() => {
    if (live && !startedAt.current) startedAt.current = new Date().toISOString();
    if (!live) startedAt.current = null;
  }, [live]);

  // Demo mode is ONLY used before the camera is started. It is always labelled.
  const demo = cap.status === "idle" || cap.status === "requesting";

  // ---- append real predictions to the transcript, de-duplicated -----------
  useEffect(() => {
    const p = cap.prediction;
    if (!p || paused) return;
    const gloss = p.gloss ?? p.label ?? null;
    if (!gloss || gloss === lastGloss.current) return;
    lastGloss.current = gloss;
    setTranscript((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        ts: mmss(cap.elapsed),
        text: gloss,
        confidence: p.confidence ?? 0,
        corrections: (p.topk ?? []).slice(1, 4).map((c) => c.label ?? c[0]).filter(Boolean),
      },
    ]);
  }, [cap.prediction, cap.elapsed, paused]);

  // Demo caption rotation, only while idle.
  useEffect(() => {
    if (!demo || paused) return undefined;
    const t = setTimeout(() => setDemoIdx((i) => (i + 1) % LIVE_CAPTION_QUEUE.length), 4200);
    return () => clearTimeout(t);
  }, [demoIdx, demo, paused]);

  useEffect(() => {
    // Element.scrollTo is missing in some environments (jsdom, older WebViews);
    // fall back to assigning scrollTop so the panel still follows new entries.
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript.length]);

  const rows = demo ? RECENT_TRANSCRIPT : transcript;
  const currentEntry = rows[rows.length - 1];
  const caption = live
    ? (cap.prediction?.gloss ?? cap.prediction?.label ?? (cap.handsVisible ? "…" : "Show your hands to the camera"))
    : LIVE_CAPTION_QUEUE[demoIdx];

  const avgConf = rows.length
    ? Math.round((rows.reduce((s, e) => s + (e.confidence ?? 0), 0) / rows.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="live-page">
      <Nav />
      <main className="pt-24 pb-8 px-6 md:px-8 lg:px-12 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="micro-caps mb-1">Live translation</div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">ISL → English</h1>
          </div>
          <div className="flex items-center gap-3">
            {live && (
              <div className="flex items-center gap-2 text-xs text-cream/60">
                <Circle className="w-2 h-2 fill-red-400 text-red-400 animate-landmark-pulse" strokeWidth={0} />
                Recording
              </div>
            )}
            {demo && (
              <span
                data-testid="demo-badge"
                className="text-[10px] uppercase tracking-widest text-copper border border-copper/40 px-2 py-0.5 rounded-sm"
              >
                Demo data
              </span>
            )}
            <PrivacyBadge />
          </div>
        </div>

        {(cap.status === "offline" || cap.status === "denied" || cap.status === "error") && (
          <div className="mb-4 rounded-sm border border-copper/40 bg-copper/[0.06] p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-copper mt-0.5 flex-shrink-0" strokeWidth={1.5} />
            <div>
              <div className="text-sm text-cream/90">
                {cap.status === "denied"
                  ? "Camera permission denied."
                  : cap.status === "offline"
                    ? "Backend unreachable — no predictions can be produced."
                    : "Could not start the camera."}
              </div>
              <div className="text-xs text-cream/50 mt-1">{cap.error}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* WEBCAM */}
          <div className="lg:col-span-8">
            <div className="relative rounded-sm overflow-hidden bg-black aspect-video border border-cream/10">
              <video
                ref={cap.videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${live ? "opacity-100" : "opacity-0"}`}
              />
              <canvas ref={cap.canvasRef} className="hidden" />

              {!live && (
                <>
                  <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(201,123,74,0.09), transparent 55%), radial-gradient(ellipse at 50% 90%, rgba(110,231,242,0.05), transparent 60%), #050506" }} />
                  <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, #F2ECE0 0px, #F2ECE0 1px, transparent 1px, transparent 3px)" }} />
                </>
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/90" />
              <LandmarkOverlay className="opacity-95" live={live ? cap.landmarks : null} />

              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="micro-caps text-cyan">
                  {live ? `Live · ${cap.serverMs ?? "–"} ms` : "Cam 01 · preview"}
                </span>
              </div>
              <div className="absolute top-4 right-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-cream/50">
                <span>21 hand · 33 pose keypoints</span>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-8">
                <div className="flex items-center gap-3 mb-4">
                  <ConfidenceChip confidence={live ? (cap.prediction?.confidence ?? 0) : (currentEntry?.confidence ?? 0.7)} />
                  {!muted && <Waveform active={!paused} />}
                </div>
                <AssemblingCaption key={caption} text={caption} />
                {(currentEntry?.confidence ?? 1) < 0.7 && currentEntry?.corrections?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5" data-testid="correction-chips">
                    <span className="micro-caps text-cream/50 mr-1 self-center">Meant?</span>
                    {currentEntry.corrections.map((c) => (
                      <button
                        key={c}
                        className="focus-ring px-2.5 py-1 text-[11px] uppercase tracking-widest border border-cream/20 rounded-sm text-cream/70 hover:border-cyan hover:text-cyan transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 p-1.5 glass-panel rounded-full">
                <button
                  data-testid="live-camera-btn"
                  onClick={() => (live ? stopAndSave() : cap.start())}
                  className="focus-ring w-10 h-10 flex items-center justify-center rounded-full hover:bg-cream/10 transition-colors"
                  aria-label={live ? "Stop camera" : "Start camera"}
                  title={live ? "Stop camera" : "Start camera"}
                >
                  {live ? <VideoOff className="w-4 h-4" strokeWidth={1.5} /> : <Video className="w-4 h-4" strokeWidth={1.5} />}
                </button>
                <button
                  data-testid="live-pause-btn"
                  onClick={() => setPaused((p) => !p)}
                  className="focus-ring w-10 h-10 flex items-center justify-center rounded-full hover:bg-cream/10 transition-colors"
                  aria-label={paused ? "Resume" : "Pause"}
                >
                  {paused ? <Play className="w-4 h-4" strokeWidth={1.5} /> : <Pause className="w-4 h-4" strokeWidth={1.5} />}
                </button>
                <button
                  data-testid="live-mute-btn"
                  onClick={() => setMuted((m) => !m)}
                  className="focus-ring w-10 h-10 flex items-center justify-center rounded-full hover:bg-cream/10 transition-colors"
                  aria-label={muted ? "Unmute TTS" : "Mute TTS"}
                >
                  {muted ? <VolumeX className="w-4 h-4" strokeWidth={1.5} /> : <Volume2 className="w-4 h-4" strokeWidth={1.5} />}
                </button>
                <div className="w-px h-6 bg-cream/15 mx-1" />
                <button
                  data-testid="live-clear-btn"
                  onClick={() => setTranscript([])}
                  className="focus-ring w-10 h-10 flex items-center justify-center rounded-full hover:bg-cream/10 transition-colors"
                  aria-label="Clear transcript"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1 p-1 glass-card rounded-sm" data-testid="domain-switcher">
                {DOMAIN_PACKS.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`domain-pill-${p.id}`}
                    onClick={() => setDomain(p.id)}
                    className={`focus-ring px-4 py-1.5 text-xs uppercase tracking-widest rounded-sm transition-colors ${
                      domain === p.id ? "bg-copper text-ink" : "text-cream/60 hover:text-cream"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 p-1 glass-card rounded-sm" data-testid="model-switcher">
                  {["bilstm", "cnn"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setModel(m)}
                      className={`focus-ring px-3 py-1.5 text-xs uppercase tracking-widest rounded-sm transition-colors ${
                        model === m ? "bg-cyan/20 text-cyan" : "text-cream/50 hover:text-cream"
                      }`}
                    >
                      {m === "bilstm" ? "BiLSTM" : "CNN"}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-cream/40">Session · {mmss(live ? cap.elapsed : 0)}</div>
              </div>
            </div>
          </div>

          {/* SIDEBAR */}
          <aside className="lg:col-span-4 glass-panel rounded-sm p-6 flex flex-col max-h-[calc(100vh-140px)]">
            <div className="flex items-center justify-between mb-4">
              <span className="micro-caps">Session transcript</span>
              <span className="text-[10px] text-cream/40">{rows.length} entries</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-1" data-testid="transcript-list">
              {rows.map((e) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="border-l-2 border-copper/60 pl-3 py-1"
                >
                  <div className="text-[10px] text-cream/40 uppercase tracking-widest mb-0.5">
                    {e.ts} · {Math.round((e.confidence ?? 0) * 100)}%
                  </div>
                  <div className="text-sm text-cream/90 leading-snug">{e.text}</div>
                </motion.div>
              ))}
              {rows.length === 0 && (
                <div className="text-sm text-cream/40 italic">
                  {live ? "Listening — sign something." : "Start the camera to begin a session."}
                </div>
              )}
            </div>
            <div className="hair-divider my-4" />
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="font-display text-2xl text-copper">{rows.length}</div>
                <div className="text-[10px] uppercase tracking-widest text-cream/40 mt-1">Signs</div>
              </div>
              <div>
                <div className="font-display text-2xl text-cyan">{avgConf}%</div>
                <div className="text-[10px] uppercase tracking-widest text-cream/40 mt-1">Avg conf.</div>
              </div>
              <div>
                <div className="font-display text-2xl text-cream">{mmss(live ? cap.elapsed : 0)}</div>
                <div className="text-[10px] uppercase tracking-widest text-cream/40 mt-1">Elapsed</div>
              </div>
            </div>
            {cap.backend && (
              <div className="mt-3 text-[10px] text-cream/35 leading-relaxed">
                {cap.backend.num_labels > 0
                  ? `${cap.backend.num_labels} classes loaded · model: ${model}`
                  : "Backend in mock mode — no checkpoints in backend/models/."}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
