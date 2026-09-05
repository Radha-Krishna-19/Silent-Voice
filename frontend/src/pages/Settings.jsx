import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, RotateCcw, HardDrive } from "lucide-react";
import Nav from "../components/Nav";
import { Reveal, Stagger, StaggerItem, PageTransition, Magnetic, EASE } from "../components/motion";
import { loadSettings, saveSettings, resetSettings, storageAvailable } from "../lib/storage";
import { getMotionMode, setMotionMode, useOsReducedMotion } from "../components/motion/preference";
import { VOCAB_SIZE } from "../lib/vocabulary";

export default function Settings() {
  const [s, setS] = useState(loadSettings);
  const [voices, setVoices] = useState([]);
  const [saved, setSaved] = useState(false);
  const canStore = storageAvailable();
  const osReduced = useOsReducedMotion();
  const [motionMode, setMotionModeState] = useState(getMotionMode);

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices?.() ?? []);
    load();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load;
    return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const update = (patch) => {
    setS(saveSettings(patch));
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="settings-page">
      <Nav />
      <PageTransition>
        <main className="pt-28 pb-20 px-6 md:px-12 lg:px-24 max-w-[900px] mx-auto">
          <Reveal>
            <div className="flex items-start justify-between mb-10">
              <div>
                <div className="micro-caps mb-3">Preferences</div>
                <h1 className="font-display text-4xl md:text-6xl tracking-tight">Settings</h1>
              </div>
              <AnimatePresence>
                {saved && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.94 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    className="flex items-center gap-2 text-xs text-cyan border border-cyan/30 rounded-sm px-3 py-1.5"
                  >
                    <Check className="w-3 h-3" strokeWidth={2} /> Saved
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="flex items-center gap-3 mb-10 text-xs text-cream/45 border border-cream/10 rounded-sm px-4 py-3">
              <HardDrive className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
              {canStore ? (
                <span>
                  Preferences are saved in this browser and apply whether or not you
                  are signed in. Transcripts are separate — signed in they go to the
                  server, as a guest they are not saved at all.
                </span>
              ) : (
                <span className="text-copper">Local storage unavailable — changes will not persist.</span>
              )}
            </div>
          </Reveal>

          <Stagger className="space-y-10" gap={0.07}>
            <Section title="Recognition">
              <Choice
                label="Model"
                hint="Both are trained on the identical split. The CNN measured higher on every metric."
                value={s.model}
                onChange={(v) => update({ model: v })}
                options={[
                  { value: "cnn", label: "1D CNN", meta: "94.55% · 0.74 ms" },
                  { value: "bilstm", label: "BiLSTM", meta: "91.74% · 4.12 ms" },
                ]}
              />
              <Slider
                label="Capture rate"
                hint="Frames sent per second. Lower reduces CPU load; higher reacts faster."
                value={s.captureFps} min={6} max={20} step={2} unit=" fps"
                onChange={(v) => update({ captureFps: v })}
              />
            </Section>

            <Section title="Voice">
              <Toggle
                label="Speak captions aloud"
                hint="Uses the browser's Web Speech synthesis."
                value={s.speakCaptions}
                onChange={(v) => update({ speakCaptions: v })}
              />
              <Slider
                label="Speech rate" value={s.speechRate}
                min={0.6} max={1.6} step={0.1} unit="×"
                onChange={(v) => update({ speechRate: v })}
              />
              {voices.length > 0 && (
                <Row label="Voice" hint={`${voices.length} available in this browser`}>
                  <select
                    value={s.voiceURI ?? ""}
                    onChange={(e) => update({ voiceURI: e.target.value || null })}
                    className="focus-ring bg-ink border border-cream/15 rounded-sm px-3 py-2 text-sm text-cream/85 min-w-[220px]"
                  >
                    <option value="">System default</option>
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                    ))}
                  </select>
                </Row>
              )}
            </Section>

            <Section title="Practice">
              <Toggle
                label="Mirror my attempt"
                hint="Compensates when you sign left-handed against a right-handed reference."
                value={s.mirrorPractice}
                onChange={(v) => update({ mirrorPractice: v })}
              />
            </Section>

            <Section title="Motion">
              <Choice
                label="Animations"
                hint={osReduced
                  ? "Your system asks for reduced motion, so Auto keeps things still. Choose On to override it."
                  : "Auto follows your operating system's reduced-motion setting."}
                value={motionMode}
                onChange={(v) => { setMotionMode(v); setMotionModeState(v); }}
                options={[
                  { value: "auto", label: "Auto", meta: osReduced ? "system: reduced" : "system: full" },
                  { value: "on", label: "On", meta: "always animate" },
                  { value: "off", label: "Off", meta: "never animate" },
                ]}
              />
            </Section>

            <Section title="Data">
              <Toggle
                label="Save sessions"
                hint="Store Live transcripts in this browser so they appear under Transcripts."
                value={s.saveSessions}
                onChange={(v) => update({ saveSessions: v })}
              />
            </Section>

            <StaggerItem>
              <div className="pt-6 border-t border-cream/10 flex items-center justify-between">
                <div className="text-xs text-cream/40">
                  Vocabulary: {VOCAB_SIZE} signs, from the trained label map.
                </div>
                <Magnetic strength={0.18}>
                  <button
                    onClick={() => { setS(resetSettings()); setSaved(true); setTimeout(() => setSaved(false), 1600); }}
                    className="focus-ring flex items-center gap-2 text-xs uppercase tracking-widest text-cream/45 hover:text-copper transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} /> Reset to defaults
                  </button>
                </Magnetic>
              </div>
            </StaggerItem>
          </Stagger>
        </main>
      </PageTransition>
    </div>
  );
}

/* ----------------------------- controls ----------------------------- */

function Section({ title, children }) {
  return (
    <StaggerItem>
      <div className="micro-caps mb-5">{title}</div>
      <div className="space-y-5">{children}</div>
    </StaggerItem>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-8 py-3 border-b border-cream/[0.06]">
      <div className="min-w-0">
        <div className="text-sm text-cream/90">{label}</div>
        {hint && <div className="text-xs text-cream/40 mt-1 leading-relaxed max-w-md">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <Row label={label} hint={hint}>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`focus-ring relative w-12 h-6 rounded-full transition-colors ${value ? "bg-copper" : "bg-cream/12"}`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={`absolute top-1 w-4 h-4 rounded-full ${value ? "bg-ink right-1" : "bg-cream/70 left-1"}`}
        />
      </button>
    </Row>
  );
}

function Slider({ label, hint, value, min, max, step, unit = "", onChange }) {
  return (
    <Row label={label} hint={hint}>
      <div className="flex items-center gap-3 min-w-[220px]">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="focus-ring flex-1 accent-copper"
        />
        <span className="font-mono text-xs text-cyan w-14 text-right">
          {Number(value).toFixed(step < 1 ? 1 : 0)}{unit}
        </span>
      </div>
    </Row>
  );
}

function Choice({ label, hint, value, onChange, options }) {
  return (
    <Row label={label} hint={hint}>
      <div className="flex gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`focus-ring relative px-4 py-2 rounded-sm text-xs transition-colors ${
                active ? "text-ink" : "text-cream/55 hover:text-cream border border-cream/15"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="choice-pill"
                  className="absolute inset-0 bg-copper rounded-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10 block uppercase tracking-widest font-medium">{o.label}</span>
              <span className={`relative z-10 block text-[9px] mt-0.5 ${active ? "text-ink/70" : "text-cream/35"}`}>
                {o.meta}
              </span>
            </button>
          );
        })}
      </div>
    </Row>
  );
}
