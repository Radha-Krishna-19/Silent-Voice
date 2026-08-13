import { useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, ChevronRight } from "lucide-react";
import Nav from "../components/Nav";
import LandmarkOverlay from "../components/LandmarkOverlay";
import PrivacyBadge from "../components/PrivacyBadge";
import { PRACTICE_LESSONS, PRACTICE_FEEDBACK } from "../lib/mockData";

export default function Practice() {
  const [lessonId, setLessonId] = useState(PRACTICE_LESSONS[1].id);
  const [wordIdx, setWordIdx] = useState(1);
  const lesson = PRACTICE_LESSONS.find((l) => l.id === lessonId);
  const currentWord = lesson.words[wordIdx];
  const feedback = PRACTICE_FEEDBACK[wordIdx % PRACTICE_FEEDBACK.length];
  const score = feedback.score;
  const scorePct = Math.round(score * 100);

  return (
    <div className="min-h-screen bg-ink text-cream" data-testid="practice-page">
      <Nav />
      <main className="pt-24 pb-8 px-6 md:px-8 lg:px-12 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="micro-caps mb-1">Practice mode</div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">
              <span className="italic text-copper">{lesson.title}</span> · {lesson.domain}
            </h1>
          </div>
          <PrivacyBadge />
        </div>

        {/* Lesson selector */}
        <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar" data-testid="lesson-tabs">
          {PRACTICE_LESSONS.map((l) => (
            <button
              key={l.id}
              data-testid={`lesson-tab-${l.id}`}
              onClick={() => { setLessonId(l.id); setWordIdx(0); }}
              className={`focus-ring flex-shrink-0 px-4 py-2 rounded-sm text-sm border transition-colors ${
                lessonId === l.id ? "border-copper bg-copper/5 text-copper" : "border-cream/15 text-cream/70 hover:text-cream"
              }`}
            >
              {l.title}
              <span className="ml-2 text-[10px] text-cream/40 uppercase tracking-widest">
                {Math.round(l.progress * 100)}%
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* REFERENCE */}
          <div className="lg:col-span-6">
            <div className="micro-caps mb-2">Reference clip</div>
            <div className="relative rounded-sm overflow-hidden bg-black aspect-[4/3] border border-cream/10">
              <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(242,236,224,0.06), transparent 60%), #050506" }} />
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, #F2ECE0 0px, #F2ECE0 1px, transparent 1px, transparent 3px)" }} />
              <div className="absolute inset-0 bg-gradient-to-t from-ink to-transparent" />
              <LandmarkOverlay color="#F2ECE0" />
              <div className="absolute top-4 left-4">
                <span className="micro-caps text-cream/60">Ideal form</span>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="font-display text-4xl copper-glow">{currentWord}</div>
              </div>
            </div>
          </div>

          {/* USER */}
          <div className="lg:col-span-6">
            <div className="flex items-center justify-between mb-2">
              <div className="micro-caps">Your attempt</div>
              <button
                data-testid="practice-retry-btn"
                className="focus-ring text-xs text-cream/60 hover:text-cyan inline-flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
                Retry
              </button>
            </div>
            <div className="relative rounded-sm overflow-hidden bg-black aspect-[4/3] border border-cream/10">
              <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(201,123,74,0.10), transparent 55%), radial-gradient(ellipse at 50% 90%, rgba(110,231,242,0.05), transparent 60%), #050506" }} />
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(0deg, #F2ECE0 0px, #F2ECE0 1px, transparent 1px, transparent 3px)" }} />
              <div className="absolute inset-0 bg-gradient-to-t from-ink to-transparent" />
              <LandmarkOverlay />
              <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-cream/60">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-landmark-pulse" />
                Live
              </div>
            </div>
          </div>
        </div>

        {/* SCORE + FEEDBACK */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <motion.div
            key={wordIdx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="lg:col-span-4 glass-panel rounded-sm p-8 flex flex-col items-center text-center"
            data-testid="score-card"
          >
            <div className="micro-caps mb-4">Match score</div>
            <div className="relative w-40 h-40 mb-4">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" stroke="rgba(242,236,224,0.1)" strokeWidth="4" fill="none" />
                <circle
                  cx="50" cy="50" r="42"
                  stroke="#C97B4A" strokeWidth="4" fill="none"
                  strokeDasharray={`${score * 264} 264`}
                  strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 8px rgba(201,123,74,0.4))" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="font-display text-5xl text-copper leading-none">{scorePct}</div>
                <div className="micro-caps mt-1">match</div>
              </div>
            </div>
            <div className="text-sm text-cream/60">on <span className="text-cream font-medium">{currentWord}</span></div>
          </motion.div>

          <div className="lg:col-span-8 glass-card rounded-sm p-8">
            <div className="micro-caps mb-4">Feedback</div>
            <ul className="space-y-3" data-testid="feedback-list">
              {feedback.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan landmark-glow" />
                  <span className="text-cream/85 leading-relaxed">{note}</span>
                </li>
              ))}
            </ul>
            <div className="hair-divider my-6" />
            <div className="flex items-center justify-between">
              <div className="text-sm text-cream/60">
                Word {wordIdx + 1} of {lesson.words.length}
              </div>
              <button
                data-testid="practice-next-btn"
                onClick={() => setWordIdx((i) => (i + 1) % lesson.words.length)}
                className="btn-copper focus-ring text-sm"
              >
                Next word
                <ChevronRight className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {/* UPCOMING STRIP */}
        <div className="mt-8">
          <div className="micro-caps mb-3">Upcoming</div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" data-testid="upcoming-strip">
            {lesson.words.map((w, i) => (
              <button
                key={`${lesson.id}-${w}-${i}`}
                onClick={() => setWordIdx(i)}
                className={`focus-ring flex-shrink-0 min-w-[140px] px-4 py-3 rounded-sm border text-left transition-colors ${
                  i === wordIdx ? "border-copper bg-copper/5" : i < wordIdx ? "border-cream/10 opacity-40" : "border-cream/15 hover:border-cream/30"
                }`}
              >
                <div className="text-[10px] uppercase tracking-widest text-cream/40">Word {i + 1}</div>
                <div className="font-display text-lg mt-1">{w}</div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
