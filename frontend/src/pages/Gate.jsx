/**
 * The entry page. Sign in, create an account, or continue as a guest.
 *
 * The 3-D hand on the left is not decoration bolted on afterwards — it is
 * wired to the form. It types along with you (correct finger per key), sweeps
 * when you delete, looks away while you enter a password, points at the field
 * you focus, shakes when the server rejects you, and waves you in when it
 * accepts. When you are idle it performs real signs from the trained
 * vocabulary, captioned with the word, so the first thing you see the product
 * do is the thing the product is for.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck, User, KeyRound, AlertCircle } from "lucide-react";
import HandRig from "../components/HandRig";
import { Reveal, Stagger, StaggerItem, Magnetic, useRipple, EASE } from "../components/motion";
import { FallingInput, Scramble, Typewriter } from "../components/motion/advanced";
import { login, register, continueAsGuest, getToken } from "../lib/auth";
import { textToSign } from "../lib/api";
import { ALL_WORDS } from "../lib/vocabulary";

// Words the idle hand cycles through. Every one of these was checked against
// the generated vocabulary, and the list is filtered again at runtime, so it
// can never promise a sign the model was not trained on. ("thanks", "please",
// "sorry", "yes" and "no" are NOT in INCLUDE — an obvious-looking greeting set
// would have been half fiction.)
const IDLE_WORDS = [
  "hello", "good", "friend", "you", "doctor", "happy", "teacher", "student",
  "beautiful", "family", "morning", "book", "school", "mother", "today",
];

export default function Gate() {
  const nav = useNavigate();
  const handRef = useRef(null);
  const [mode, setMode] = useState("signin");           // signin | signup
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [signedWord, setSignedWord] = useState(null);
  const idleTimer = useRef(null);
  const ripple = useRipple();

  const isSignup = mode === "signup";

  /* ---- already signed in? skip the gate ------------------------- */
  useEffect(() => {
    if (getToken()) nav("/home", { replace: true });
  }, [nav]);

  /* ---- the hand tracks the cursor ------------------------------- */
  useEffect(() => {
    const move = (e) => {
      handRef.current?.setPointer(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1
      );
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, []);

  /* ---- idle: perform a real sign -------------------------------- */
  const playIdleSign = useCallback(async () => {
    const h = handRef.current;
    if (!h || h.isReplaying() || busy) return;
    const available = IDLE_WORDS.filter((w) => ALL_WORDS.includes(w));
    const pool = available.length ? available : ALL_WORDS.slice(0, 12);
    const word = pool[Math.floor(Math.random() * pool.length)];
    try {
      const data = await textToSign(word);
      const item = data?.items?.find((it) => it.available && it.frames?.length);
      if (!item) return;
      h.playSign(item.frames, { fps: data.fps, quant: data.quant, label: item.label, loop: false });
      setSignedWord(item.label);
      setTimeout(() => setSignedWord(null), (item.frames.length / (data.fps || 12)) * 1000 + 400);
    } catch {
      /* backend down — the hand just keeps idling, no error shown for this */
    }
  }, [busy]);

  useEffect(() => {
    const schedule = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        playIdleSign();
        schedule();
      }, 6500);
    };
    schedule();
    return () => clearTimeout(idleTimer.current);
  }, [playIdleSign]);

  /* ---- keystrokes drive the fingers ----------------------------- */
  const onKeyDown = (e) => {
    const h = handRef.current;
    if (!h) return;
    h.stopSign();
    if (e.key === "Backspace" || e.key === "Delete") h.sweep();
    else if (e.key.length === 1) h.press(e.key);
  };

  const focusField = (which) => () => {
    const h = handRef.current;
    if (!h) return;
    h.stopSign();
    if (which === "password") h.shy();
    else { h.release(); h.point(0.2, which === "username" ? -0.2 : 0.1); }
  };

  const blurField = () => handRef.current?.release();

  /* ---- submit ---------------------------------------------------- */
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    handRef.current?.release();
    try {
      if (isSignup) await register(username.trim(), password, displayName.trim() || username.trim());
      else await login(username.trim(), password);
      handRef.current?.wave();
      setTimeout(() => nav("/home"), 620);
    } catch (err) {
      setError(err.message);
      handRef.current?.shake();
      setBusy(false);
    }
  };

  const asGuest = () => {
    continueAsGuest();
    handRef.current?.thumbsUp();
    setTimeout(() => nav("/home"), 380);
  };

  return (
    <div className="min-h-screen bg-ink text-cream lg:flex" data-testid="gate-page">
      {/* ------------------------------------------------ left: the hand */}
      <div className="relative lg:w-[52%] h-[46vh] lg:h-screen overflow-hidden shrink-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 38%, rgba(201,123,74,0.16), transparent 58%)," +
              "radial-gradient(ellipse at 22% 84%, rgba(110,231,242,0.09), transparent 62%), #0B0B0D",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.045] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#F2ECE0 0px,#F2ECE0 1px,transparent 1px,transparent 3px)" }}
        />

        <HandRig ref={handRef} className="absolute inset-0" showCaption={false} />

        {/* Caption: which real sign is being performed */}
        <div className="absolute top-8 left-8 right-8 flex items-start justify-between gap-4">
          <div>
            <div className="micro-caps text-cream/50 mb-2">Silent Voice</div>
            <div className="font-display text-2xl lg:text-3xl leading-tight">
              Indian Sign Language,<br />
              <span className="italic text-copper">both directions.</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-8 right-8">
          <AnimatePresence mode="wait">
            {signedWord ? (
              <motion.div
                key={signedWord}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: EASE }}
                className="flex items-baseline gap-3"
              >
                <span className="micro-caps text-copper">now signing</span>
                <span className="font-display text-3xl tracking-tight">{signedWord}</span>
              </motion.div>
            ) : (
              <motion.div
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-cream/35 leading-relaxed max-w-sm"
              >
                21 landmarks, the same topology the recogniser reads. Type and it
                types with you; wait and it performs a sign from the trained set.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ----------------------------------------------- right: the form */}
      <div className="flex-1 flex items-center justify-center px-6 md:px-14 py-14 lg:py-0">
        <div className="w-full max-w-md">
          <Reveal>
            <div className="micro-caps text-cream/40 mb-3">
              <Scramble text="Welcome" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-[1.05] mb-4">
              {isSignup ? (
                <>Make it <span className="italic text-copper">yours.</span></>
              ) : (
                <>Sign in, or <span className="italic text-copper">don't.</span></>
              )}
            </h1>
            <p className="text-cream/45 text-sm leading-relaxed mb-8 min-h-[3rem]">
              Translate{" "}
              <Typewriter
                words={["a sign into English.", "English into a sign.", "and practise until it sticks."]}
                className="text-cream/80"
              />
            </p>
          </Reveal>

          {/* mode switch */}
          <Reveal delay={0.05}>
            <div className="flex items-center gap-1 p-1 border border-cream/10 rounded-sm w-fit mb-8">
              {[["signin", "Sign in"], ["signup", "Create account"]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => { setMode(v); setError(null); }}
                  data-testid={`gate-tab-${v}`}
                  className={`focus-ring relative px-4 py-1.5 text-xs uppercase tracking-widest rounded-sm transition-colors ${
                    mode === v ? "text-ink" : "text-cream/55 hover:text-cream"
                  }`}
                >
                  {mode === v && (
                    <motion.span
                      layoutId="gate-pill"
                      className="absolute inset-0 bg-copper rounded-sm"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
          </Reveal>

          <form onSubmit={submit} data-testid="gate-form">
            <Stagger className="space-y-6" gap={0.05}>
              {isSignup && (
                <StaggerItem>
                  <Field label="Display name" icon={User}>
                    <FallingInput
                      value={displayName}
                      onChange={setDisplayName}
                      onKeyDown={onKeyDown}
                      onFocus={focusField("display")}
                      onBlur={blurField}
                      placeholder="Radha Krishna"
                      inputClassName="py-3 text-cream text-[15px]"
                      charClassName="text-[15px]"
                      data-testid="gate-display-input"
                      name="displayName"
                      maxLength={64}
                    />
                  </Field>
                </StaggerItem>
              )}

              <StaggerItem>
                <Field label="Username" icon={User}>
                  <FallingInput
                    value={username}
                    onChange={(v) => setUsername(v.replace(/\s/g, ""))}
                    onKeyDown={onKeyDown}
                    onFocus={focusField("username")}
                    onBlur={blurField}
                    placeholder="radha"
                    inputClassName="py-3 text-cream text-[15px]"
                    charClassName="text-[15px]"
                    data-testid="gate-username-input"
                    name="username"
                    autoComplete="username"
                    maxLength={32}
                  />
                </Field>
              </StaggerItem>

              <StaggerItem>
                <Field
                  label="Password"
                  icon={KeyRound}
                  hint={isSignup ? "At least 8 characters." : null}
                >
                  <FallingInput
                    type="password"
                    value={password}
                    onChange={setPassword}
                    onKeyDown={onKeyDown}
                    onFocus={focusField("password")}
                    onBlur={blurField}
                    placeholder="••••••••"
                    inputClassName="py-3 text-cream text-[15px]"
                    charClassName="text-[15px]"
                    data-testid="gate-password-input"
                    name="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                  />
                </Field>
              </StaggerItem>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    data-testid="gate-error"
                    className="flex items-start gap-2 text-xs text-copper border border-copper/25 rounded-sm px-3 py-2.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />
                    <span className="leading-relaxed">{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <StaggerItem>
                <Magnetic strength={0.14}>
                  <button
                    type="submit"
                    disabled={busy || !username || !password}
                    onClick={ripple.fire}
                    data-testid="gate-submit"
                    className="focus-ring relative overflow-hidden w-full bg-copper text-ink py-3.5 rounded-sm text-xs uppercase tracking-[0.2em] font-medium flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
                  >
                    {busy
                      ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                      : <>{isSignup ? "Create account" : "Sign in"}<ArrowRight className="w-3.5 h-3.5" strokeWidth={2} /></>}
                    {ripple.layer}
                  </button>
                </Magnetic>
              </StaggerItem>
            </Stagger>
          </form>

          {/* ---------------------------------------------- guest */}
          <Reveal delay={0.12}>
            <div className="mt-8 pt-8 border-t border-cream/10">
              <button
                onClick={asGuest}
                data-testid="gate-guest"
                onMouseEnter={() => handRef.current?.point(-0.3, 0.4)}
                className="focus-ring group w-full text-left border border-cream/12 hover:border-cream/30 rounded-sm px-4 py-3.5 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-cream/90 group-hover:text-cream transition-colors">
                      Continue as guest
                    </div>
                    <div className="text-xs text-cream/40 mt-1 leading-relaxed">
                      Everything works. Nothing is saved — not on the server, not
                      in this browser.
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-cream/30 group-hover:text-copper group-hover:translate-x-1 transition-all shrink-0" strokeWidth={1.5} />
                </div>
              </button>

              <div className="flex items-start gap-2 mt-5 text-[11px] text-cream/30 leading-relaxed">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />
                <span>
                  Passwords are stored as scrypt hashes in a SQLite file on your
                  own machine. This server speaks plain HTTP on localhost, so do
                  not expose it to the internet or reuse a password you care about.
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Field({ label, icon: Icon, hint, children }) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <label className="flex items-center gap-2 micro-caps text-cream/45 mb-2">
        <Icon className="w-3 h-3" strokeWidth={1.5} />
        {label}
      </label>
      <div className="relative">
        {children}
        <div className="relative h-px bg-cream/15 overflow-hidden">
          <motion.div
            className="absolute inset-0 bg-copper origin-left"
            initial={false}
            animate={{ scaleX: focused ? 1 : 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          />
        </div>
      </div>
      {hint && <div className="text-[11px] text-cream/30 mt-2">{hint}</div>}
    </div>
  );
}
