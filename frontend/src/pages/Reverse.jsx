import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Mic, Play, Pause, SkipForward, Send } from "lucide-react";
import Nav from "../components/Nav";
import LandmarkOverlay from "../components/LandmarkOverlay";
import SignClipPlayer from "../components/SignClipPlayer";
import { REVERSE_EXAMPLES, SIGN_CLIPS } from "../lib/mockData";

// naive gloss reorder for demo (matches examples otherwise reverses word order)
function toGloss(text) {
  const found = REVERSE_EXAMPLES.find((e) => e.english.toLowerCase() === text.trim().toLowerCase());
  if (found) return found.gloss;
  const words = text.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  // Rough ISL heuristic: object → verb, drop articles
  const drop = new Set(["A", "AN", "THE", "IS", "AM", "ARE", "TO"]);
  return words.filter((w) => !drop.has(w)).reverse();
}

export default function Reverse() {
  const [input, setInput] = useState("How are you today");
  const [submitted, setSubmitted] = useState("How are you today");
  const [playing, setPlaying] = useState(true);
  const [clipIdx, setClipIdx] = useState(0);
  const reduced = useReducedMotion();

  const gloss = toGloss(submitted);
  const clips = gloss.map((g, i) => SIGN_CLIPS.find((c) => c.label === g) || { id: `fs-${i}`, label: g, duration: 1.4, thumb: "fs" });
  const totalDur = clips.reduce((s, c) => s + c.duration, 0) || 1;

  useEffect(() => {
    if (!playing || clips.length === 0) return;
    const t = setTimeout(() => {
      setClipIdx((i) => (i + 1) % clips.length);
    }, clips[clipIdx]?.duration * 1200 || 1200);
    return () => clearTimeout(t);
  }, [clipIdx, playing, clips]);

  const submit = (e) => {
    e?.preventDefault();
    setSubmitted(input);
    setClipIdx(0);
  };

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="reverse-page">
      <Nav />
      <main className="pt-28 pb-16 px-6 md:px-12 lg:px-24 max-w-[1400px] mx-auto">
        <div className="mb-10">
          <div className="micro-caps mb-2">Reverse mode</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight max-w-2xl leading-tight">
            Type what you want to say. Watch it become <span className="italic text-copper">sign.</span>
          </h1>
        </div>

        {/* INPUT */}
        <form onSubmit={submit} className="glass-card rounded-sm p-6 mb-8 flex items-center gap-4" data-testid="reverse-form">
          <button
            type="button"
            data-testid="reverse-mic-btn"
            className="focus-ring w-11 h-11 flex items-center justify-center rounded-sm border border-cream/15 hover:border-cyan hover:text-cyan transition-colors"
            aria-label="Voice input"
          >
            <Mic className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <input
            data-testid="reverse-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type in English…"
            className="focus-ring flex-1 bg-transparent outline-none font-display text-xl md:text-2xl text-cream placeholder:text-cream/30"
          />
          <button
            type="submit"
            data-testid="reverse-submit"
            className="btn-copper focus-ring text-sm"
          >
            Sign it
            <Send className="w-4 h-4" strokeWidth={2} />
          </button>
        </form>

        {/* GLOSS visualization */}
        <div className="mb-10">
          <div className="micro-caps mb-4">Gloss re-ordering</div>
          <div className="glass-panel rounded-sm p-6 min-h-[100px] flex items-center flex-wrap gap-3" data-testid="gloss-chips">
            <AnimatePresence mode="popLayout">
              {gloss.map((g, i) => (
                <motion.div
                  key={`${submitted}-${g}-${i}`}
                  layout={!reduced}
                  initial={reduced ? {} : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? {} : { opacity: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.06 }}
                  className={`px-4 py-2 rounded-sm border transition-colors ${
                    clipIdx === i ? "border-copper bg-copper/10 text-copper" : "border-cream/15 text-cream/80"
                  }`}
                >
                  <span className="font-display text-lg tracking-wide">{g}</span>
                  {g.includes("-") && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-cream/40">fingerspell</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* PLAYER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <div className="relative">
              <SignClipPlayer
                videoUrl={clips[clipIdx]?.videoUrl}
                posterUrl={clips[clipIdx]?.posterUrl}
                label={clips[clipIdx]?.label || "—"}
                playing={playing}
              />

              {/* segmented progress overlaid at TOP of player so it doesn't collide with the label */}
              <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
                <div className="flex gap-1">
                  {clips.map((c, i) => (
                    <div
                      key={i}
                      className={`h-[3px] flex-1 rounded-sm overflow-hidden bg-cream/15`}
                    >
                      <div
                        className={`h-full bg-copper transition-all duration-300 ${
                          i < clipIdx ? "w-full" : i === clipIdx ? "w-1/2 animate-pulse" : "w-0"
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-cream/50 uppercase tracking-widest">
                  <span>Clip {clipIdx + 1} of {clips.length}</span>
                  <span>{totalDur.toFixed(1)}s total</span>
                </div>
              </div>
            </div>

            {/* controls */}
            <div className="mt-4 flex items-center gap-2">
              <button
                data-testid="reverse-play-btn"
                onClick={() => setPlaying((p) => !p)}
                className="focus-ring btn-ghost-cream text-sm py-2"
              >
                {playing ? <Pause className="w-4 h-4" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
                {playing ? "Pause" : "Play"}
              </button>
              <button
                data-testid="reverse-skip-btn"
                onClick={() => setClipIdx((i) => (i + 1) % clips.length)}
                className="focus-ring btn-ghost-cream text-sm py-2"
              >
                <SkipForward className="w-4 h-4" strokeWidth={1.5} />
                Skip
              </button>
            </div>
          </div>

          {/* thumbnail queue */}
          <aside className="lg:col-span-4 glass-panel rounded-sm p-6">
            <div className="micro-caps mb-4">Upcoming signs</div>
            <div className="space-y-2" data-testid="clip-queue">
              {clips.map((c, i) => (
                <div
                  key={`q-${i}`}
                  className={`flex items-center gap-3 p-2 rounded-sm border transition-colors ${
                    i === clipIdx ? "border-copper bg-copper/5" : "border-cream/10"
                  }`}
                >
                  <div className="w-12 h-12 rounded-sm bg-cream/5 border border-cream/10 flex items-center justify-center relative overflow-hidden">
                    <LandmarkOverlay intensity={0.4} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.label}</div>
                    <div className="text-[10px] text-cream/40 uppercase tracking-widest">{c.duration.toFixed(1)}s</div>
                  </div>
                  {i === clipIdx && <span className="text-[10px] text-copper uppercase tracking-widest">Playing</span>}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
