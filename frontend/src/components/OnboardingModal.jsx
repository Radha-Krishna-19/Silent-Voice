import { useEffect, useState } from "react";
import { Camera, ShieldCheck, LayoutGrid, X } from "lucide-react";
import { DOMAIN_PACKS } from "../lib/mockData";

export const OnboardingModal = ({ open, onClose }) => {
  const [step, setStep] = useState(0);
  const [pack, setPack] = useState("everyday");

  // Escape closes it, so it can never trap the page.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const steps = [
    {
      icon: Camera,
      kicker: "Step 01",
      title: "Allow camera",
      body: "Silent Voice reads your hands and upper body from the webcam. Camera frames are sent to the Silent Voice server running on your own computer, turned into landmark points, and discarded. Live translation never saves them.",
      cta: "Allow camera",
    },
    {
      icon: ShieldCheck,
      kicker: "Step 02",
      title: "How this stays private",
      body: "The server runs locally; nothing is sent to the internet. Only on the Contribute page, and only when you press record or upload, is a video saved to that computer so it can be added to the training data. You can stop the camera at any time and delete saved transcripts.",
      cta: "Continue",
    },
    {
      icon: LayoutGrid,
      kicker: "Step 03",
      title: "Pick a domain pack",
      body: "Choose the vocabulary that matches your situation. You can switch at any time.",
      cta: "Enter Silent Voice",
    },
  ];

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      data-testid="onboarding-modal"
    >
      <div className="absolute inset-0 bg-ink/90" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col glass-panel rounded-sm p-6 sm:p-8">
        <button
          data-testid="onboarding-close"
          onClick={onClose}
          className="focus-ring absolute top-4 right-4 p-1.5 rounded-sm text-cream/60 hover:text-cream"
          aria-label="Close onboarding"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <div className="w-11 h-11 rounded-sm bg-copper/10 border border-copper/30 flex items-center justify-center">
            <Icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
          </div>
          <div>
            <div className="micro-caps">{current.kicker}</div>
            <div className="font-display text-2xl mt-1">{current.title}</div>
          </div>
        </div>

        <p className="text-cream/70 leading-relaxed mb-5 shrink-0">{current.body}</p>

        {isLast && (
          <div className="grid grid-cols-1 gap-2 mb-5 flex-1 min-h-0 overflow-y-auto pr-1" data-testid="onboarding-pack-grid">
            {DOMAIN_PACKS.map((p) => (
              <button
                key={p.id}
                data-testid={`onboarding-pack-${p.id}`}
                onClick={() => setPack(p.id)}
                className={`focus-ring text-left px-4 py-2.5 rounded-sm border transition-colors ${
                  pack === p.id
                    ? "border-copper bg-copper/5"
                    : "border-cream/10 hover:border-cream/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-cream/50">{p.count} signs</span>
                </div>
                <div className="text-xs text-cream/50 mt-1">{p.description}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between shrink-0 pt-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-[3px] rounded-sm transition-all ${
                  i === step ? "w-8 bg-copper" : "w-4 bg-cream/20"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                data-testid="onboarding-back"
                onClick={() => setStep(step - 1)}
                className="focus-ring text-sm px-3 py-2 text-cream/60 hover:text-cream rounded-sm"
              >
                Back
              </button>
            )}
            <button
              data-testid="onboarding-next"
              onClick={() => (isLast ? onClose() : setStep(step + 1))}
              className="btn-copper text-sm focus-ring"
            >
              {current.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
