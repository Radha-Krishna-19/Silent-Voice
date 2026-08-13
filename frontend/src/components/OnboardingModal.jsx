import { useState } from "react";
import { Camera, ShieldCheck, LayoutGrid, X } from "lucide-react";
import { DOMAIN_PACKS } from "../lib/mockData";

export const OnboardingModal = ({ open, onClose }) => {
  const [step, setStep] = useState(0);
  const [pack, setPack] = useState("everyday");

  if (!open) return null;

  const steps = [
    {
      icon: Camera,
      kicker: "Step 01",
      title: "Allow camera",
      body: "Silent Voice needs your webcam only to extract landmark skeletons. The video itself is never sent to a server, never stored.",
      cta: "Allow camera",
    },
    {
      icon: ShieldCheck,
      kicker: "Step 02",
      title: "How this stays private",
      body: "Only anonymized landmark points travel to our model. You can pause capture, wipe your transcript, or work fully offline for practice.",
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
      <div className="absolute inset-0 backdrop-blur-md bg-ink/85" onClick={onClose} />
      <div className="relative w-full max-w-lg glass-panel rounded-sm p-10">
        <button
          data-testid="onboarding-close"
          onClick={onClose}
          className="focus-ring absolute top-4 right-4 p-1.5 rounded-sm text-cream/60 hover:text-cream"
          aria-label="Close onboarding"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-sm bg-copper/10 border border-copper/30 flex items-center justify-center">
            <Icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
          </div>
          <div>
            <div className="micro-caps">{current.kicker}</div>
            <div className="font-display text-2xl mt-1">{current.title}</div>
          </div>
        </div>

        <p className="text-cream/70 leading-relaxed mb-8">{current.body}</p>

        {isLast && (
          <div className="grid grid-cols-1 gap-2 mb-8" data-testid="onboarding-pack-grid">
            {DOMAIN_PACKS.map((p) => (
              <button
                key={p.id}
                data-testid={`onboarding-pack-${p.id}`}
                onClick={() => setPack(p.id)}
                className={`focus-ring text-left px-4 py-3 rounded-sm border transition-colors ${
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

        <div className="flex items-center justify-between">
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
