/**
 * Ctrl+K / Cmd+K palette.
 *
 * Two things live here: navigation, and a search over the 261 signs the model
 * was actually trained on. Selecting a sign takes you to /reverse with that
 * word queued, so the search result is a real action rather than a lookup.
 *
 * The sign list comes from lib/vocabulary.js, which is generated from
 * label_map.json — searching can therefore never surface a word the system
 * cannot produce.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Video, Hand, Dumbbell, FileText, SlidersHorizontal,
  Info, BarChart3, ClipboardList, LogOut, CornerDownLeft,
} from "lucide-react";
import { ALL_WORDS, DOMAIN_PACKS, pretty } from "../lib/vocabulary";
import { signOut } from "../lib/auth";
import { useReducedMotionPref } from "./motion/preference";

const PAGES = [
  { label: "Live translate", hint: "Webcam to English", to: "/live", icon: Video },
  { label: "Reverse translate", hint: "English to signs", to: "/reverse", icon: Hand },
  { label: "Practice", hint: "Record and get scored", to: "/practice", icon: Dumbbell },
  { label: "Transcripts", hint: "Saved sessions", to: "/transcripts", icon: FileText },
  { label: "Research", hint: "BiLSTM vs 1D CNN", to: "/research", icon: BarChart3 },
  { label: "Review 2 rubric", hint: "12 slides, 50 marks", to: "/rubric", icon: ClipboardList },
  { label: "Settings", hint: "Model, voice, motion", to: "/settings", icon: SlidersHorizontal },
  { label: "About", hint: "How it works", to: "/about", icon: Info },
];

// Which pack a word belongs to, so results can say where it came from.
const PACK_OF = {};
DOMAIN_PACKS.forEach((p) => (p.words || []).forEach((w) => { PACK_OF[w] = p.name; }));

export default function CommandPalette() {
  const nav = useNavigate();
  const reduced = useReducedMotionPref();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setSel(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = PAGES.filter(
      (p) => !term || p.label.toLowerCase().includes(term) || p.hint.toLowerCase().includes(term)
    ).map((p) => ({ kind: "page", ...p }));

    const signs = !term
      ? []
      : ALL_WORDS
          .filter((w) => w.includes(term))
          .sort((a, b) => a.indexOf(term) - b.indexOf(term) || a.length - b.length)
          .slice(0, 8)
          .map((w) => ({
            kind: "sign",
            label: pretty(w),
            word: w,
            hint: PACK_OF[w] ? `in ${PACK_OF[w]}` : "trained sign",
            icon: Hand,
          }));

    const actions = [{ kind: "action", label: "Sign out", hint: "Return to the gate", icon: LogOut }];

    return [...pages, ...signs, ...(term && "sign out".includes(term) ? actions : term ? [] : actions)];
  }, [q]);

  useEffect(() => { setSel(0); }, [q]);

  const run = (item) => {
    setOpen(false);
    if (item.kind === "page") nav(item.to);
    else if (item.kind === "sign") nav(`/reverse?q=${encodeURIComponent(item.word)}`);
    else if (item.kind === "action") { signOut(); nav("/"); }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && results[sel]) { e.preventDefault(); run(results[sel]); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[14vh] px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          data-testid="command-palette"
        >
          <div
            className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="relative w-full max-w-xl bg-ink border border-cream/15 rounded-sm overflow-hidden shadow-2xl"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex items-center gap-3 px-4 border-b border-cream/10">
              <Search className="w-4 h-4 text-cream/40 shrink-0" strokeWidth={1.5} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search pages, or any of the 261 trained signs…"
                data-testid="palette-input"
                className="flex-1 bg-transparent outline-none py-4 text-sm text-cream placeholder:text-cream/25"
              />
              <kbd className="text-[10px] text-cream/30 border border-cream/15 rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-2">
              {results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-cream/35">
                  Nothing matches “{q}”.
                  <div className="text-xs text-cream/25 mt-2">
                    The vocabulary is fixed at the 261 words the model was trained on.
                  </div>
                </div>
              )}
              {results.map((item, i) => {
                const Icon = item.icon;
                const active = i === sel;
                return (
                  <button
                    key={`${item.kind}-${item.label}`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => run(item)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      active ? "bg-cream/[0.07]" : ""
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${active ? "text-copper" : "text-cream/40"}`}
                      strokeWidth={1.5}
                    />
                    <span className={`text-sm flex-1 ${active ? "text-cream" : "text-cream/75"}`}>
                      {item.label}
                    </span>
                    <span className="text-[11px] text-cream/30">{item.hint}</span>
                    {active && <CornerDownLeft className="w-3 h-3 text-cream/30" strokeWidth={1.5} />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
