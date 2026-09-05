/**
 * The entry page. Sign in, create an account, or continue as a guest.
 *
 * The 3-D hand is wired to the form rather than decorating it: it types along
 * with you (correct finger per key), sweeps when you delete, looks away while
 * you enter a password, points at the field you focus, shakes when the server
 * rejects you, and waves you in when it accepts. Between all that it performs
 * real signs from bundled landmark recordings, so it is doing the thing the
 * product does before you have clicked anything — and it keeps doing it with
 * the backend switched off, because those recordings ship in the bundle.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Loader2, ShieldCheck, User, KeyRound, AlertCircle, Sparkles,
} from "lucide-react";
import HandRig from "../components/HandRig";
import ConstellationField from "../components/ConstellationField";
import { Reveal, Stagger, StaggerItem, Magnetic, useRipple, EASE } from "../components/motion";
import { FallingInput, Scramble, Typewriter } from "../components/motion/advanced";
import { login, register, continueAsGuest, getToken } from "../lib/auth";
import { useSignLoop, SAMPLE_WORDS } from "../lib/signs";

export default function Gate() {
  const nav = useNavigate();
  const handRef = useRef(null);
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ripple = useRipple();

  const isSignup = mode === "signup";

  // Real recordings, bundled — this cannot fail because the server is down.
  const { word, source, pause, resume } = useSignLoop(handRef, SAMPLE_WORDS, {
    intervalMs: 4600,
  });

  useEffect(() => {
    if (getToken()) nav("/home", { replace: true });
  }, [nav]);

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

  /* ---- keystrokes drive the fingers ----------------------------- */
  const onKeyDown = (e) => {
    const h = handRef.current;
    if (!h) return;
    pause();
    h.stopSign();
    if (e.key === "Backspace" || e.key === "Delete") h.sweep();
    else if (e.key.length === 1) h.press(e.key);
  };

  const focusField = (which) => () => {
    const h = handRef.current;
    if (!h) return;
    pause();
    h.stopSign();
    if (which === "password") h.shy();
    else { h.release(); h.point(0.2, which === "username" ? -0.2 : 0.1); }
  };

  const blurField = () => {
    handRef.current?.release();
    resume();
  };

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
    setTimeout(() => nav("/home"), 400);
  };

  return (
    <motion.div
      className="relative min-h-screen bg-ink text-cream overflow-hidden lg:flex"
      data-testid="gate-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* ---------------------------------------------- aurora backdrop */}
      <AuroraBackdrop />

      {/* ------------------------------------------------ left: the hand */}
      <div className="relative lg:w-[54%] h-[48vh] lg:h-screen overflow-hidden shrink-0">
        <ConstellationField className="absolute inset-0 w-full h-full" count={84} />

        {/* concentric rings, slowly counter-rotating */}
        <RingHalo />

        <HandRig ref={handRef} className="absolute inset-0" showCaption={false} />

        {/* floor glow under the hand */}
        <div
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(201,123,74,0.13), transparent)" }}
        />

        <motion.div
          className="absolute top-8 left-8 right-8"
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
        >
          <div className="micro-caps text-cream/45 mb-2">Silent Voice</div>
          <div className="font-display text-2xl lg:text-[2.1rem] leading-[1.1]">
            Indian Sign Language,<br />
            <span className="italic text-copper copper-glow">both directions.</span>
          </div>
        </motion.div>

        {/* what the hand is performing */}
        <div className="absolute bottom-8 left-8 right-8">
          <AnimatePresence mode="wait">
            {word ? (
              <motion.div
                key={word}
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
                transition={{ duration: 0.34, ease: EASE }}
              >
                <div className="flex items-baseline gap-3">
                  <span className="micro-caps text-copper">now signing</span>
                  <span className="font-display text-3xl lg:text-4xl tracking-tight">
                    {word.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-cream/30 mt-1.5">
                  real recording · {source === "bundled" ? "bundled with the app" : "from the server"}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-cream/30 leading-relaxed max-w-sm"
              >
                21 landmarks — the same topology the recogniser reads.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ----------------------------------------------- right: the form */}
      <div className="relative flex-1 flex items-center justify-center px-6 md:px-14 py-16 lg:py-0">
        <motion.div
          className="w-full max-w-md relative"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.1, ease: EASE }}
        >
          {/* animated gradient hairline around the card */}
          <GradientFrame />

          <div className="relative px-1">
            <Reveal>
              <div className="flex items-center gap-2 micro-caps text-cream/40 mb-3">
                <Sparkles className="w-3 h-3 text-copper" strokeWidth={1.5} />
                <Scramble text="Welcome" speed={26} />
              </div>
              <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-[1.04] mb-4">
                {isSignup ? (
                  <>Make it <span className="italic text-copper copper-glow">yours.</span></>
                ) : (
                  <>Sign in, or <span className="italic text-copper copper-glow">don't.</span></>
                )}
              </h1>
              <p className="text-cream/45 text-sm leading-relaxed mb-9 min-h-[2.6rem]">
                Translate{" "}
                <Typewriter
                  words={[
                    "a sign into English.",
                    "English into a sign.",
                    "and practise until it sticks.",
                  ]}
                  className="text-cream/85"
                />
              </p>
            </Reveal>

            <Reveal delay={0.05}>
              <div className="flex items-center gap-1 p-1 border border-cream/10 rounded-sm w-fit mb-8 backdrop-blur-sm">
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
              <Stagger className="space-y-6" gap={0.06}>
                <AnimatePresence mode="popLayout">
                  {isSignup && (
                    <motion.div
                      key="display"
                      initial={{ opacity: 0, height: 0, y: -10 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -10 }}
                      transition={{ duration: 0.3, ease: EASE }}
                    >
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
                    </motion.div>
                  )}
                </AnimatePresence>

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
                      className="flex items-start gap-2 text-xs text-copper border border-copper/25 rounded-sm px-3 py-2.5 bg-copper/[0.05]"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />
                      <span className="leading-relaxed">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <StaggerItem>
                  <Magnetic strength={0.16}>
                    <motion.button
                      type="submit"
                      disabled={busy || !username || !password}
                      onClick={ripple.fire}
                      data-testid="gate-submit"
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.985 }}
                      transition={{ type: "spring", stiffness: 400, damping: 24 }}
                      className="focus-ring relative overflow-hidden w-full bg-copper text-ink py-3.5 rounded-sm text-xs uppercase tracking-[0.2em] font-medium flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {/* sheen sweep */}
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-y-0 w-1/3 pointer-events-none"
                        style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)" }}
                        animate={{ x: ["-140%", "420%"] }}
                        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
                      />
                      <span className="relative z-10 flex items-center gap-2">
                        {busy
                          ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                          : <>{isSignup ? "Create account" : "Sign in"}<ArrowRight className="w-3.5 h-3.5" strokeWidth={2} /></>}
                      </span>
                      {ripple.layer}
                    </motion.button>
                  </Magnetic>
                </StaggerItem>
              </Stagger>
            </form>

            {/* ---------------------------------------------- guest */}
            <Reveal delay={0.14}>
              <div className="mt-8 pt-8 border-t border-cream/10">
                <motion.button
                  onClick={asGuest}
                  data-testid="gate-guest"
                  onMouseEnter={() => handRef.current?.point(-0.3, 0.4)}
                  whileHover={{ x: 3 }}
                  transition={{ type: "spring", stiffness: 400, damping: 26 }}
                  className="focus-ring group w-full text-left border border-cream/12 hover:border-copper/40 rounded-sm px-4 py-3.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-cream/90 group-hover:text-cream transition-colors">
                        Continue as guest
                      </div>
                      <div className="text-xs text-cream/40 mt-1 leading-relaxed">
                        Everything works. Nothing is saved — not on the server,
                        not in this browser.
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-cream/30 group-hover:text-copper transition-colors shrink-0" strokeWidth={1.5} />
                  </div>
                </motion.button>

                <div className="flex items-start gap-2 mt-5 text-[11px] text-cream/28 leading-relaxed">
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
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Backdrop: three slow blurred blobs. Cheap, and it makes the page feel
 * lit rather than painted.
 * ------------------------------------------------------------------ */
function AuroraBackdrop() {
  const blobs = [
    { c: "rgba(201,123,74,0.20)", s: 620, x: "12%", y: "18%", d: 26 },
    { c: "rgba(110,231,242,0.13)", s: 520, x: "68%", y: "62%", d: 32 },
    { c: "rgba(201,123,74,0.10)", s: 460, x: "40%", y: "88%", d: 38 },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: b.s, height: b.s, left: b.x, top: b.y,
            background: `radial-gradient(circle, ${b.c} 0%, transparent 68%)`,
            filter: "blur(38px)",
          }}
          animate={{
            x: [0, 55, -35, 0],
            y: [0, -42, 30, 0],
            scale: [1, 1.12, 0.94, 1],
          }}
          transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg,#F2ECE0 0px,#F2ECE0 1px,transparent 1px,transparent 3px)" }}
      />
    </div>
  );
}

/* Counter-rotating rings behind the hand. */
function RingHalo() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
      {[
        { s: 300, d: 44, dir: 1, o: 0.16 },
        { s: 440, d: 62, dir: -1, o: 0.10 },
        { s: 600, d: 86, dir: 1, o: 0.06 },
      ].map((r, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-cream"
          style={{ width: r.s, height: r.s, opacity: r.o, borderStyle: i === 1 ? "dashed" : "solid" }}
          animate={{ rotate: 360 * r.dir }}
          transition={{ duration: r.d, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

/* A hairline that travels around the form card. */
function GradientFrame() {
  return (
    <div className="absolute -inset-6 rounded-sm pointer-events-none overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(201,123,74,0.28) 40deg, transparent 110deg, transparent 360deg)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-px rounded-sm bg-ink" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Field({ label, icon: Icon, hint, children }) {
  const [focused, setFocused] = useState(false);
  return (
    <div onFocusCapture={() => setFocused(true)} onBlurCapture={() => setFocused(false)}>
      <label className="flex items-center gap-2 micro-caps text-cream/45 mb-2">
        <motion.span
          animate={{ color: focused ? "#C97B4A" : "rgba(242,236,224,0.45)" }}
          transition={{ duration: 0.2 }}
        >
          <Icon className="w-3 h-3" strokeWidth={1.5} />
        </motion.span>
        {label}
      </label>
      <div className="relative">
        {children}
        <div className="relative h-px bg-cream/15 overflow-hidden">
          <motion.div
            className="absolute inset-0 bg-copper origin-left"
            initial={false}
            animate={{ scaleX: focused ? 1 : 0 }}
            transition={{ duration: 0.32, ease: EASE }}
          />
        </div>
      </div>
      {hint && <div className="text-[11px] text-cream/30 mt-2">{hint}</div>}
    </div>
  );
}
