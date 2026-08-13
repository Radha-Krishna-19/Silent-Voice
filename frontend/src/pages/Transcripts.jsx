import { useState } from "react";
import { ChevronDown, Download, FileText, FileCode2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Nav from "../components/Nav";
import { SESSIONS } from "../lib/mockData";

export default function Transcripts() {
  const [openId, setOpenId] = useState(SESSIONS[0].id);

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="transcripts-page">
      <Nav />
      <main className="pt-28 pb-16 px-6 md:px-12 lg:px-24 max-w-[1200px] mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="micro-caps mb-2">Session history</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">Transcripts</h1>
            <p className="text-cream/60 mt-3 max-w-lg">
              Every saved session, exportable as plain text or subtitle-ready .srt. Nothing is retained without your explicit opt-in.
            </p>
          </div>
          <div className="text-sm text-cream/50">{SESSIONS.length} sessions</div>
        </div>

        <div className="space-y-3" data-testid="sessions-list">
          {SESSIONS.map((s) => {
            const open = openId === s.id;
            return (
              <div
                key={s.id}
                data-testid={`session-row-${s.id}`}
                className={`glass-card rounded-sm overflow-hidden transition-colors ${open ? "border-copper/40" : ""}`}
              >
                <button
                  onClick={() => setOpenId(open ? null : s.id)}
                  className="focus-ring w-full grid grid-cols-12 gap-4 items-center px-6 py-5 text-left hover:bg-cream/[0.02] transition-colors"
                  aria-expanded={open}
                >
                  <div className="col-span-6 md:col-span-5">
                    <div className="font-display text-xl leading-snug">{s.title}</div>
                    <div className="text-xs text-cream/40 mt-0.5">{s.date}</div>
                  </div>
                  <div className="hidden md:block col-span-2">
                    <div className="micro-caps">{s.domain}</div>
                  </div>
                  <div className="col-span-3 md:col-span-2 text-sm text-cream/60">
                    {s.duration}
                    <div className="text-[10px] text-cream/40 uppercase tracking-widest mt-0.5">Duration</div>
                  </div>
                  <div className="col-span-2 md:col-span-2 text-sm">
                    <span className="text-copper font-medium">{Math.round(s.avgConfidence * 100)}%</span>
                    <div className="text-[10px] text-cream/40 uppercase tracking-widest mt-0.5">Avg conf.</div>
                  </div>
                  <div className="col-span-1 md:col-span-1 justify-self-end">
                    <ChevronDown
                      className={`w-4 h-4 text-cream/50 transition-transform ${open ? "rotate-180" : ""}`}
                      strokeWidth={1.5}
                    />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6">
                        <div className="hair-divider mb-5" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="md:col-span-2 space-y-3">
                            {s.entries.map((e, i) => (
                              <div key={i} className="flex gap-4 items-baseline">
                                <span className="text-[11px] font-mono text-cream/40 flex-shrink-0 mt-1">{e.ts}</span>
                                <div className="flex-1">
                                  <div className="text-cream/90 leading-relaxed">{e.text}</div>
                                </div>
                                <span className="text-[10px] uppercase tracking-widest text-copper flex-shrink-0">
                                  {Math.round(e.conf * 100)}%
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="glass-panel rounded-sm p-4">
                            <div className="micro-caps mb-3">Export</div>
                            <div className="space-y-2">
                              <button data-testid={`export-txt-${s.id}`} className="focus-ring w-full flex items-center justify-between px-3 py-2 rounded-sm border border-cream/10 hover:border-copper transition-colors text-sm">
                                <span className="flex items-center gap-2"><FileText className="w-4 h-4" strokeWidth={1.5} /> .txt</span>
                                <Download className="w-3.5 h-3.5 text-cream/50" strokeWidth={1.5} />
                              </button>
                              <button data-testid={`export-srt-${s.id}`} className="focus-ring w-full flex items-center justify-between px-3 py-2 rounded-sm border border-cream/10 hover:border-copper transition-colors text-sm">
                                <span className="flex items-center gap-2"><FileCode2 className="w-4 h-4" strokeWidth={1.5} /> .srt</span>
                                <Download className="w-3.5 h-3.5 text-cream/50" strokeWidth={1.5} />
                              </button>
                            </div>
                            <div className="hair-divider my-4" />
                            <div className="text-[10px] uppercase tracking-widest text-cream/40 mb-1">Signs captured</div>
                            <div className="font-display text-3xl text-cream">{s.signs}</div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
