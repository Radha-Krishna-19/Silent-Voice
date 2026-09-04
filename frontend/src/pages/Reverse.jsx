import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Pause, Play, AlertTriangle, Loader2 } from "lucide-react";
import Nav from "../components/Nav";
import SignPlayer from "../components/SignPlayer";
import { textToSign, fetchVocabulary } from "../lib/api";
import { Reveal, Stagger, StaggerItem, FallingText, Magnetic, PageTransition, useRipple, EASE } from "../components/motion";

const EXAMPLES = [
  "Hello, how are you today?",
  "I am going to the hospital tomorrow",
  "My mother is a teacher",
  "Where is the doctor?",
];

export default function Reverse() {
  const [text, setText] = useState("Hello, how are you today?");
  const [seq, setSeq] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [current, setCurrent] = useState(0);
  const [vocab, setVocab] = useState(null);
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);

  useEffect(() => {
    fetchVocabulary().then((v) => setVocab(v.count)).catch(() => setVocab(null));
  }, []);

  const translate = async (value) => {
    const t = (value ?? text).trim();
    if (!t) return;
    setStatus("loading");
    setError(null);
    try {
      const data = await textToSign(t);
      setSeq(data);
      setCurrent(0);
      setPlaying(true);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err?.message ?? "backend unreachable");
    }
  };

  useEffect(() => {
    translate("Hello, how are you today?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- speech input (Web Speech API, Chrome/Edge only) --------------------
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech input needs Chrome or Edge — type instead.");
      return;
    }
    const r = new SR();
    r.lang = "en-IN";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const said = e.results[0][0].transcript;
      setText(said);
      translate(said);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    r.start();
  };

  const playable = seq?.items?.filter((i) => i.available) ?? [];
  const missing = seq?.items?.filter((i) => !i.available) ?? [];

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="reverse-page">
      <Nav />
      <PageTransition>
      <main className="pt-24 pb-12 px-6 md:px-12 lg:px-20 max-w-[1500px] mx-auto">
        <div className="micro-caps mb-2">Reverse mode</div>
        <h1 className="font-display text-3xl md:text-5xl tracking-tight leading-[1.08] mb-2">
          Type or speak. <span className="italic text-copper">Watch it signed back.</span>
        </h1>
        <p className="text-cream/60 max-w-3xl mb-8 leading-relaxed">
          English is re-ordered into ISL gloss, then each sign is replayed from the{" "}
          <span className="text-cream">same landmark recordings the model was trained on</span> —
          a real signer's hands, not an animated avatar.
          {vocab !== null && <> Vocabulary: <span className="text-cyan">{vocab} signs</span>.</>}
        </p>

        {/* INPUT */}
        <div className="glass-card rounded-sm p-2 flex items-center gap-2 mb-3">
          <button
            onClick={startListening}
            data-testid="reverse-mic-btn"
            className={`focus-ring w-11 h-11 flex items-center justify-center rounded-sm transition-colors ${
              listening ? "bg-copper text-ink" : "hover:bg-cream/10 text-cream/70"
            }`}
            aria-label="Speak"
            title="Speak (Chrome/Edge)"
          >
            <Mic className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && translate()}
            data-testid="reverse-input"
            placeholder="Type an English sentence…"
            className="flex-1 bg-transparent outline-none text-lg font-display px-2 placeholder:text-cream/25"
          />
          <button
            onClick={() => translate()}
            data-testid="reverse-submit"
            className="btn-copper focus-ring !py-2.5 !px-5 text-sm"
          >
            {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign it <Send className="w-3.5 h-3.5" strokeWidth={2} /></>}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setText(ex); translate(ex); }}
              className="focus-ring text-[11px] px-3 py-1.5 border border-cream/15 rounded-sm text-cream/50 hover:text-cream hover:border-cream/35 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>

        {status === "error" && (
          <div className="mb-6 rounded-sm border border-copper/40 bg-copper/[0.06] p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-copper mt-0.5 flex-shrink-0" strokeWidth={1.5} />
            <div>
              <div className="text-sm text-cream/90">Backend unreachable — cannot translate.</div>
              <div className="text-xs text-cream/50 mt-1">
                {error} · start it with <code className="font-mono">cd backend &amp;&amp; python server.py</code>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* PLAYER */}
          <div className="lg:col-span-8">
            <div className="relative rounded-sm overflow-hidden bg-black aspect-[4/3] border border-cream/10">
              <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(110,231,242,0.06), transparent 60%), #050506" }} />
              {playable.length > 0 ? (
                <SignPlayer
                  items={seq.items}
                  fps={seq.fps}
                  quant={seq.quant}
                  playing={playing}
                  onWordChange={(_, idx) => setCurrent(idx)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-cream/30 text-sm">
                  {status === "loading" ? "Translating…" : "Nothing signable yet."}
                </div>
              )}

              {playable[current] && (
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-ink to-transparent">
                  <div className="micro-caps mb-1">Now signing</div>
                  <div className="font-display text-3xl">
                    <AnimatePresence mode="popLayout">
                      <FallingText key={playable[current].gloss} text={playable[current].gloss} />
                    </AnimatePresence>
                  </div>
                  <div className="text-[10px] text-cream/40 mt-1 uppercase tracking-widest">
                    real recording · {playable[current].takes} takes available · {playable[current].hands} hands
                  </div>
                </div>
              )}

              <button
                onClick={() => setPlaying((p) => !p)}
                className="absolute top-4 right-4 focus-ring w-10 h-10 flex items-center justify-center rounded-full glass-panel"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="w-4 h-4" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
              </button>
            </div>

            {/* GLOSS STRIP */}
            {seq?.gloss?.length > 0 && (
              <div className="mt-4">
                <div className="micro-caps mb-2">ISL gloss · re-ordered</div>
                <div className="flex flex-wrap gap-2" data-testid="gloss-strip">
                  <AnimatePresence mode="popLayout">
                    {seq.items.map((it, i) => (
                      <motion.span
                        key={`${it.label}-${i}`}
                        layout
                        initial={{ opacity: 0, y: -18, scale: 0.85, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                        exit={{
                          opacity: 0, y: 34, scale: 0.8,
                          rotate: (i % 2 ? 1 : -1) * (8 + i * 2),
                          filter: "blur(3px)",
                        }}
                        transition={{ duration: 0.34, ease: EASE, delay: i * 0.035 }}
                        whileHover={{ y: -3, scale: 1.05 }}
                        className={`px-3 py-1.5 text-xs uppercase tracking-widest rounded-sm border cursor-default ${
                          !it.available
                            ? "border-copper/40 text-copper/70 line-through"
                            : playable[current]?.label === it.label
                              ? "border-copper bg-copper text-ink"
                              : "border-cream/15 text-cream/60"
                        }`}
                      >
                        {it.gloss}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="glass-panel rounded-sm p-5">
              <div className="micro-caps mb-3">What happened to your sentence</div>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-cream/50">Signs played</dt>
                  <dd className="text-cyan">{playable.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-cream/50">Not in vocabulary</dt>
                  <dd className={missing.length || seq?.unmapped?.length ? "text-copper" : "text-cream/70"}>
                    {missing.length + (seq?.unmapped?.length ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-cream/50">Dropped (no ISL equivalent)</dt>
                  <dd className="text-cream/70">{seq?.dropped?.length ?? 0}</dd>
                </div>
              </dl>

              {seq?.dropped?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-cream/10">
                  <div className="text-[10px] uppercase tracking-widest text-cream/40 mb-1.5">Dropped words</div>
                  <div className="text-xs text-cream/50 leading-relaxed">
                    {seq.dropped.join(", ")} — ISL has no articles or copula, so these carry no sign.
                  </div>
                </div>
              )}

              {seq?.unmapped?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-cream/10">
                  <div className="text-[10px] uppercase tracking-widest text-copper mb-1.5">Outside the vocabulary</div>
                  <div className="text-xs text-cream/60 leading-relaxed">
                    {seq.unmapped.join(", ")}
                  </div>
                  <div className="text-[11px] text-cream/40 mt-2 leading-relaxed">
                    These are reported rather than guessed. Fingerspelling would need ISL
                    manual-alphabet recordings, which this dataset does not contain.
                  </div>
                </div>
              )}
            </div>

            <div className="glass-card rounded-sm p-5">
              <div className="micro-caps mb-2">How this works</div>
              <p className="text-xs text-cream/55 leading-relaxed">
                Each sign is the <span className="text-cream/80">medoid take</span> for that word —
                the recording closest to the class average, chosen from every take in the dataset.
                It is replayed from the identical tensors used to train the recogniser, so forward
                and reverse translation share one source of truth.
              </p>
            </div>
          </aside>
        </div>
      </main>
      </PageTransition>
    </div>
  );
}
