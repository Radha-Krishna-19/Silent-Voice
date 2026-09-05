import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown, FileText, FileCode2, Trash2, Inbox, Database, CloudOff, HardDrive,
} from "lucide-react";
import Nav from "../components/Nav";
import { Reveal, Stagger, StaggerItem, CountUp, Magnetic, useRipple, PageTransition, EASE } from "../components/motion";
import { Scramble } from "../components/motion/advanced";
import { sessionToTxt, sessionToSrt, download, fmtDuration } from "../lib/storage";
import { listSessions, removeSession, clearAllSessions, subscribe } from "../lib/sessions";
import { useAuth } from "../lib/auth";

export default function Transcripts() {
  const [sessions, setSessions] = useState([]);
  const [open, setOpen] = useState(null);
  const [state, setState] = useState({ persistent: false, offline: false, loaded: false });
  const { user } = useAuth();

  const refresh = useCallback(async () => {
    const r = await listSessions();
    setSessions(r.sessions);
    setState({ persistent: r.persistent, offline: !!r.offline, loaded: true });
  }, []);

  useEffect(() => { refresh(); return subscribe(refresh); }, [refresh, user]);

  const totals = useMemo(() => {
    const signs = sessions.reduce((s, x) => s + x.signs, 0);
    const secs = sessions.reduce((s, x) => s + x.durationSec, 0);
    const conf = sessions.length
      ? sessions.reduce((s, x) => s + x.avgConfidence, 0) / sessions.length
      : 0;
    return { signs, secs, conf };
  }, [sessions]);

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="transcripts-page">
      <Nav />
      <PageTransition>
        <main className="pt-28 pb-20 px-6 md:px-12 lg:px-24 max-w-[1200px] mx-auto">
          <Reveal>
            <div className="micro-caps mb-3"><Scramble text="Session history" /></div>
            <h1 className="font-display text-4xl md:text-6xl tracking-tight mb-4">Transcripts</h1>
            <p className="text-cream/60 max-w-2xl leading-relaxed mb-8">
              Every session you record on <span className="text-cream">Live</span> lands here.
              {state.persistent ? (
                <> Signed in as <span className="text-cream">{user?.displayName}</span>, so these are rows
                in a database on this machine — clearing your browser will not touch them.</>
              ) : (
                <> You are a guest, so these live in the page only and disappear when you close the tab.</>
              )}
            </p>
          </Reveal>

          <Reveal delay={0.05}>
            <div
              className={`mb-10 flex items-start gap-3 rounded-sm border px-4 py-3 text-xs leading-relaxed ${
                state.offline
                  ? "border-copper/40 bg-copper/[0.06] text-cream/75"
                  : state.persistent
                    ? "border-cyan/25 text-cream/55"
                    : "border-cream/12 text-cream/50"
              }`}
              data-testid="transcripts-storage-banner"
            >
              {state.offline ? (
                <>
                  <CloudOff className="w-4 h-4 shrink-0 mt-px text-copper" strokeWidth={1.5} />
                  <span>
                    Signed in, but the server did not answer. Your saved sessions are
                    still on disk — this list is empty because it could not be read.
                    Start the backend with <code className="font-mono">python server.py</code>.
                  </span>
                </>
              ) : state.persistent ? (
                <>
                  <Database className="w-4 h-4 shrink-0 mt-px text-cyan" strokeWidth={1.5} />
                  <span>Stored server-side in <code className="font-mono">backend/data/silentvoice.db</code>, owned by your account.</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4 shrink-0 mt-px" strokeWidth={1.5} />
                  <span>
                    Nothing is being written — not to a server, not to this browser.{" "}
                    <Link to="/" className="text-copper hover:text-cream underline underline-offset-2">
                      Create an account
                    </Link>{" "}
                    to keep sessions.
                  </span>
                </>
              )}
            </div>
          </Reveal>

          {sessions.length > 0 && (
            <Stagger className="grid grid-cols-3 gap-4 mb-10" gap={0.08}>
              {[
                { v: sessions.length, l: "Sessions", d: 0 },
                { v: totals.signs, l: "Signs captured", d: 0 },
                { v: totals.conf * 100, l: "Mean confidence", d: 1, suffix: "%" },
              ].map((s) => (
                <StaggerItem key={s.l}>
                  <div className="glass-card rounded-sm p-5">
                    <div className="font-display text-4xl text-copper">
                      <CountUp value={s.v} decimals={s.d} suffix={s.suffix ?? ""} />
                    </div>
                    <div className="micro-caps mt-2">{s.l}</div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}

          {sessions.length === 0 ? (
            <Reveal>
              <div className="glass-card rounded-sm p-14 text-center">
                <motion.div
                  animate={{ y: [0, -7, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex mb-5"
                >
                  <Inbox className="w-9 h-9 text-cream/25" strokeWidth={1.2} />
                </motion.div>
                <div className="font-display text-2xl mb-2">No sessions yet</div>
                <p className="text-sm text-cream/45 max-w-md mx-auto leading-relaxed">
                  Open <a href="#/live" className="text-cyan hover:underline">Live</a>, start the camera and
                  sign something. When you stop, the session is saved here automatically.
                </p>
              </div>
            </Reveal>
          ) : (
            <>
              <div className="space-y-3" data-testid="session-list">
                <AnimatePresence initial={false}>
                  {sessions.map((s, i) => (
                    <SessionRow
                      key={s.id}
                      s={s}
                      index={i}
                      open={open === s.id}
                      onToggle={() => setOpen(open === s.id ? null : s.id)}
                      onDelete={async () => { await removeSession(s.id); refresh(); }}
                    />
                  ))}
                </AnimatePresence>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={async () => {
                    if (window.confirm("Delete all saved sessions?")) {
                      await clearAllSessions();
                      refresh();
                    }
                  }}
                  className="focus-ring text-xs uppercase tracking-widest text-cream/40 hover:text-copper transition-colors"
                >
                  Clear all sessions
                </button>
              </div>
            </>
          )}
        </main>
      </PageTransition>
    </div>
  );
}

function SessionRow({ s, index, open, onToggle, onDelete }) {
  const { fire, layer } = useRipple();
  const date = new Date(s.startedAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.32, ease: EASE, delay: Math.min(index * 0.04, 0.2) }}
      className="glass-card rounded-sm overflow-hidden"
    >
      <motion.button
        onClick={(e) => { fire(e); onToggle(); }}
        whileHover={{ backgroundColor: "rgba(242,236,224,0.03)" }}
        className="relative w-full flex items-center gap-5 p-5 text-left focus-ring"
      >
        {layer}
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg truncate">
            {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            {" · "}
            {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-cream/35 mt-1">
            {s.model} · {s.entries.length} entries
          </div>
        </div>
        <Stat label="Duration" value={fmtDuration(s.durationSec)} />
        <Stat label="Signs" value={s.signs} />
        <Stat label="Mean conf." value={`${(s.avgConfidence * 100).toFixed(0)}%`} accent />
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }}>
          <ChevronDown className="w-4 h-4 text-cream/40" strokeWidth={1.5} />
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-1.5">
                {s.entries.map((e, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.035, duration: 0.28, ease: EASE }}
                    className="flex items-baseline gap-4 border-l-2 border-copper/40 pl-3 py-1"
                  >
                    <span className="font-mono text-[10px] text-cream/35 w-12 shrink-0">{e.ts}</span>
                    <span className="text-sm text-cream/90 flex-1">{e.text}</span>
                    <span className={`text-[10px] ${e.conf > 0.8 ? "text-cyan" : "text-copper"}`}>
                      {(e.conf * 100).toFixed(0)}%
                    </span>
                  </motion.div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="micro-caps mb-1">Export</div>
                {[
                  { icon: FileText, label: ".txt", fn: () => download(`${s.id}.txt`, sessionToTxt(s)) },
                  { icon: FileCode2, label: ".srt", fn: () => download(`${s.id}.srt`, sessionToSrt(s)) },
                ].map(({ icon: Icon, label, fn }) => (
                  <Magnetic key={label} strength={0.15}>
                    <button
                      onClick={fn}
                      className="focus-ring w-full flex items-center gap-2 px-3 py-2.5 border border-cream/15 rounded-sm text-sm text-cream/70 hover:border-cyan hover:text-cyan transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
                    </button>
                  </Magnetic>
                ))}
                <button
                  onClick={onDelete}
                  className="focus-ring w-full flex items-center gap-2 px-3 py-2.5 border border-cream/10 rounded-sm text-sm text-cream/40 hover:border-copper hover:text-copper transition-colors mt-3"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Delete session
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="hidden sm:block text-right shrink-0">
      <div className={`font-display text-lg ${accent ? "text-copper" : "text-cream/85"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-cream/30">{label}</div>
    </div>
  );
}
