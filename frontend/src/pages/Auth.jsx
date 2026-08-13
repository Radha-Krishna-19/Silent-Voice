import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Mail, Lock, User } from "lucide-react";
import LandmarkOverlay from "../components/LandmarkOverlay";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen bg-ink text-cream flex" data-testid="auth-page">
      {/* Left visual */}
      <div className="hidden lg:block relative w-1/2 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(201,123,74,0.14), transparent 55%), radial-gradient(ellipse at 30% 80%, rgba(110,231,242,0.08), transparent 60%), #0B0B0D" }} />
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, #F2ECE0 0px, #F2ECE0 1px, transparent 1px, transparent 3px)" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-ink" />
        <div className="absolute inset-0"><LandmarkOverlay /></div>
        <div className="absolute bottom-16 left-16 right-16">
          <div className="micro-caps mb-4">Silent Voice</div>
          <div className="font-display text-5xl leading-tight">
            Every gesture,<br /><span className="italic text-copper">heard.</span>
          </div>
          <div className="text-cream/50 text-sm mt-6 max-w-md leading-relaxed">
            Sign in to save transcripts, track practice progress, and switch domain packs across devices.
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 md:px-16 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="focus-ring inline-flex items-center gap-2 text-sm text-cream/60 hover:text-cream mb-12 rounded-sm">
            <ArrowRight className="w-3 h-3 rotate-180" strokeWidth={1.5} />
            Back
          </Link>

          <div className="flex items-center gap-1 p-1 glass-card rounded-sm w-fit mb-10" data-testid="auth-mode-switcher">
            <button
              data-testid="auth-tab-signin"
              onClick={() => setMode("signin")}
              className={`focus-ring px-4 py-1.5 text-xs uppercase tracking-widest rounded-sm transition-colors ${
                mode === "signin" ? "bg-copper text-ink" : "text-cream/60"
              }`}
            >
              Sign in
            </button>
            <button
              data-testid="auth-tab-signup"
              onClick={() => setMode("signup")}
              className={`focus-ring px-4 py-1.5 text-xs uppercase tracking-widest rounded-sm transition-colors ${
                mode === "signup" ? "bg-copper text-ink" : "text-cream/60"
              }`}
            >
              Create account
            </button>
          </div>

          <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-tight mb-3">
            {isSignup ? <>Make it <span className="italic text-copper">yours.</span></> : <>Welcome <span className="italic text-copper">back.</span></>}
          </h1>
          <p className="text-cream/50 text-sm mb-10">
            {isSignup ? "Anonymous mode always works. Accounts add persistence." : "Signing in is optional. Everything works anonymously too."}
          </p>

          <form className="space-y-5" onSubmit={(e) => e.preventDefault()} data-testid="auth-form">
            {isSignup && (
              <div>
                <label className="block micro-caps text-cream/50 mb-2">Name</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-cream/40" strokeWidth={1.5} />
                  <input
                    data-testid="auth-name-input"
                    type="text"
                    placeholder="Radha Krishna"
                    className="focus-ring w-full pl-10 pr-4 py-3 bg-transparent border-b border-cream/15 outline-none text-cream placeholder:text-cream/25 transition-colors focus:border-copper"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block micro-caps text-cream/50 mb-2">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-cream/40" strokeWidth={1.5} />
                <input
                  data-testid="auth-email-input"
                  type="email"
                  placeholder="you@gmail.com"
                  className="focus-ring w-full pl-10 pr-4 py-3 bg-transparent border-b border-cream/15 outline-none text-cream placeholder:text-cream/25 transition-colors focus:border-copper"
                />
              </div>
            </div>
            <div>
              <label className="block micro-caps text-cream/50 mb-2">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-cream/40" strokeWidth={1.5} />
                <input
                  data-testid="auth-password-input"
                  type="password"
                  placeholder="••••••••"
                  className="focus-ring w-full pl-10 pr-4 py-3 bg-transparent border-b border-cream/15 outline-none text-cream placeholder:text-cream/25 transition-colors focus:border-copper"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="auth-submit-btn"
              className="btn-copper focus-ring w-full justify-center mt-8"
            >
              {isSignup ? "Create account" : "Sign in"}
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
          </form>

          <div className="mt-8 text-xs text-cream/40 text-center">
            By continuing you agree to landmark-only processing. No video is ever stored.
          </div>
        </div>
      </div>
    </div>
  );
}
