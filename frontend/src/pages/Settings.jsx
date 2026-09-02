import { useState } from "react";
import Nav from "../components/Nav";
import { DOMAIN_PACKS } from "../lib/mockData";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";

const Row = ({ label, description, children, testId }) => (
  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 py-6 border-b border-cream/10" data-testid={testId}>
    <div className="md:col-span-5">
      <div className="font-medium text-cream">{label}</div>
      {description && <div className="text-xs text-cream/50 mt-1 max-w-md leading-relaxed">{description}</div>}
    </div>
    <div className="md:col-span-7 flex items-center">{children}</div>
  </div>
);

export default function Settings() {
  const [pack, setPack] = useState("everyday");
  const [voice, setVoice] = useState("en-IN-female");
  const [rate, setRate] = useState([1.0]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [saveTranscripts, setSaveTranscripts] = useState(true);
  const [landmarksOnly, setLandmarksOnly] = useState(true);

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="settings-page">
      <Nav />
      <main className="pt-28 pb-16 px-6 md:px-12 lg:px-24 max-w-[1100px] mx-auto">
        <div className="mb-6 rounded-sm border border-cream/15 px-4 py-3 text-xs text-cream/55">
          Preferences are held in memory for this session only and are <span className="text-cream/80">not persisted</span> — there is no user account system yet.
        </div>

        <div className="mb-10">
          <div className="micro-caps mb-2">Preferences</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">Settings</h1>
        </div>

        <section className="mb-10">
          <div className="micro-caps mb-4">Vocabulary</div>
          <Row label="Default domain pack" description="Which vocabulary loads first when you open live translation." testId="setting-domain">
            <Select value={pack} onValueChange={setPack}>
              <SelectTrigger data-testid="domain-select" className="w-full md:w-72 bg-transparent border-cream/15 rounded-sm text-cream focus-ring">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-ink border-cream/15 text-cream">
                {DOMAIN_PACKS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="focus:bg-cream/10 focus:text-cream">
                    {p.name} · {p.count} signs
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </section>

        <section className="mb-10">
          <div className="micro-caps mb-4">Voice output</div>
          <Row label="TTS voice" description="Browser Web Speech voice used to read captions aloud." testId="setting-voice">
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger data-testid="voice-select" className="w-full md:w-72 bg-transparent border-cream/15 rounded-sm text-cream focus-ring">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-ink border-cream/15 text-cream">
                <SelectItem value="en-IN-female" className="focus:bg-cream/10 focus:text-cream">English (India) — Warm F</SelectItem>
                <SelectItem value="en-IN-male" className="focus:bg-cream/10 focus:text-cream">English (India) — Neutral M</SelectItem>
                <SelectItem value="en-US-female" className="focus:bg-cream/10 focus:text-cream">English (US) — F</SelectItem>
                <SelectItem value="en-GB-male" className="focus:bg-cream/10 focus:text-cream">English (GB) — M</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Speech rate" description="Adjust playback speed of the spoken captions." testId="setting-rate">
            <div className="w-full max-w-sm flex items-center gap-4">
              <Slider
                data-testid="rate-slider"
                value={rate}
                onValueChange={setRate}
                min={0.6} max={1.6} step={0.05}
                className="flex-1"
              />
              <span className="text-cream/70 tabular-nums font-mono text-sm w-14 text-right">{rate[0].toFixed(2)}x</span>
            </div>
          </Row>
        </section>

        <section className="mb-10">
          <div className="micro-caps mb-4">Motion & accessibility</div>
          <Row label="Reduced motion" description="Disables character-assemble captions, landmark pulses, and staggered reveals in favor of plain fades." testId="setting-motion">
            <Switch data-testid="motion-toggle" checked={reducedMotion} onCheckedChange={setReducedMotion} className="data-[state=checked]:bg-copper" />
          </Row>
        </section>

        <section>
          <div className="micro-caps mb-4">Privacy</div>
          <Row label="Landmarks only" description="Never transmit raw video. Only skeleton keypoints are sent to the model. Recommended." testId="setting-landmarks">
            <Switch data-testid="landmarks-toggle" checked={landmarksOnly} onCheckedChange={setLandmarksOnly} className="data-[state=checked]:bg-copper" />
          </Row>
          <Row label="Save transcripts to my account" description="Store session transcripts so you can revisit and export them later. Off by default for anonymous users." testId="setting-save">
            <Switch data-testid="save-toggle" checked={saveTranscripts} onCheckedChange={setSaveTranscripts} className="data-[state=checked]:bg-copper" />
          </Row>
        </section>
      </main>
    </div>
  );
}
