// Rich mock data for Silent Voice UI phase.

export const DOMAIN_PACKS = [
  { id: "everyday", name: "Everyday", count: 84, description: "Greetings, family, food, time, common phrases." },
  { id: "medical", name: "Medical", count: 41, description: "Emergency, symptoms, medicine, hospital vocabulary." },
  { id: "classroom", name: "Classroom", count: 62, description: "Lessons, subjects, teacher-student interaction." },
];

export const RECENT_TRANSCRIPT = [
  { id: "t1", ts: "00:00:04", text: "Hello.", confidence: 0.94 },
  { id: "t2", ts: "00:00:09", text: "My name is Aarav.", confidence: 0.88 },
  { id: "t3", ts: "00:00:15", text: "How are you today?", confidence: 0.76 },
  { id: "t4", ts: "00:00:22", text: "I need water, please.", confidence: 0.68, corrections: ["I need help", "I need medicine"] },
  { id: "t5", ts: "00:00:29", text: "Thank you.", confidence: 0.97 },
];

export const LIVE_CAPTION_QUEUE = [
  "Hello.",
  "My name is Aarav.",
  "How are you today?",
  "I need water, please.",
  "Thank you.",
];

export const SESSIONS = [
  {
    id: "s-2402-14",
    title: "Clinic intake with Dr. Menon",
    domain: "Medical",
    date: "Feb 14, 2026",
    duration: "6m 42s",
    signs: 38,
    avgConfidence: 0.82,
    entries: [
      { ts: "00:00:03", text: "Hello, doctor.", conf: 0.96 },
      { ts: "00:00:12", text: "I have pain in my chest.", conf: 0.79 },
      { ts: "00:00:24", text: "Since two days.", conf: 0.71 },
      { ts: "00:00:36", text: "I took the medicine yesterday.", conf: 0.85 },
      { ts: "00:00:51", text: "Thank you.", conf: 0.97 },
    ],
  },
  {
    id: "s-2402-11",
    title: "Classroom Q&A — Physics",
    domain: "Classroom",
    date: "Feb 11, 2026",
    duration: "12m 08s",
    signs: 74,
    avgConfidence: 0.88,
    entries: [
      { ts: "00:00:05", text: "Please repeat the question.", conf: 0.91 },
      { ts: "00:00:19", text: "I understand now.", conf: 0.94 },
      { ts: "00:00:31", text: "The answer is nine.", conf: 0.83 },
    ],
  },
  {
    id: "s-2402-08",
    title: "Family video call",
    domain: "Everyday",
    date: "Feb 08, 2026",
    duration: "18m 21s",
    signs: 112,
    avgConfidence: 0.91,
    entries: [
      { ts: "00:00:02", text: "Hello, mother.", conf: 0.98 },
      { ts: "00:00:15", text: "I love you.", conf: 0.99 },
      { ts: "00:00:28", text: "Please send the photos.", conf: 0.86 },
    ],
  },
  {
    id: "s-2402-03",
    title: "Practice — Alphabet drill",
    domain: "Everyday",
    date: "Feb 03, 2026",
    duration: "4m 55s",
    signs: 26,
    avgConfidence: 0.79,
    entries: [
      { ts: "00:00:01", text: "A. B. C. D.", conf: 0.82 },
      { ts: "00:00:20", text: "E. F. G. H.", conf: 0.76 },
    ],
  },
];

export const REVERSE_EXAMPLES = [
  { english: "I need help please", gloss: ["HELP", "NEED", "PLEASE"] },
  { english: "How are you today", gloss: ["TODAY", "YOU", "HOW"] },
  { english: "My name is Priya", gloss: ["MY", "NAME", "P-R-I-Y-A"] },
  { english: "Where is the hospital", gloss: ["HOSPITAL", "WHERE"] },
];

export const SIGN_CLIPS = [
  { id: "c-help", label: "HELP", duration: 1.2, videoUrl: null, posterUrl: null, source: "INCLUDE" },
  { id: "c-need", label: "NEED", duration: 1.0, videoUrl: null, posterUrl: null, source: "INCLUDE" },
  { id: "c-please", label: "PLEASE", duration: 1.4, videoUrl: null, posterUrl: null, source: "INCLUDE" },
  { id: "c-thankyou", label: "THANK YOU", duration: 1.6, videoUrl: null, posterUrl: null, source: "self-recorded" },
  { id: "c-yes", label: "YES", duration: 0.8, videoUrl: null, posterUrl: null, source: "INCLUDE" },
  { id: "c-no", label: "NO", duration: 0.8, videoUrl: null, posterUrl: null, source: "INCLUDE" },
  { id: "c-water", label: "WATER", duration: 1.1, videoUrl: null, posterUrl: null, source: "INCLUDE" },
  { id: "c-doctor", label: "DOCTOR", duration: 1.3, videoUrl: null, posterUrl: null, source: "INCLUDE" },
];

export const PRACTICE_LESSONS = [
  {
    id: "l-greet",
    title: "Greetings",
    domain: "Everyday",
    words: ["HELLO", "GOOD MORNING", "HOW ARE YOU", "THANK YOU", "GOODBYE"],
    progress: 0.6,
  },
  {
    id: "l-emerg",
    title: "Emergency essentials",
    domain: "Medical",
    words: ["HELP", "PAIN", "DOCTOR", "AMBULANCE", "HOSPITAL", "MEDICINE"],
    progress: 0.35,
  },
  {
    id: "l-class",
    title: "Classroom basics",
    domain: "Classroom",
    words: ["TEACHER", "QUESTION", "PLEASE REPEAT", "I UNDERSTAND", "HOMEWORK"],
    progress: 0.15,
  },
];

export const PRACTICE_FEEDBACK = [
  { word: "HELLO", score: 0.92, notes: ["Great hand posture.", "Slightly speed up the wave."] },
  {
    word: "THANK YOU",
    score: 0.71,
    notes: ["Palm should start closer to the chin.", "Motion arc is a touch shallow.", "Hold the ending pose for ~0.4s longer."],
  },
];

export const FEATURE_CARDS = [
  {
    kicker: "Live translation",
    title: "See signs become sentences.",
    body: "Landmarks are extracted in the browser, streamed to a compact model, and captions assemble character-by-character with confidence-gated correction chips.",
    icon: "Radio",
  },
  {
    kicker: "Reply in sign",
    title: "Type or speak. It signs back.",
    body: "Enter English, watch it re-order into ISL gloss, then play a cinematic stitched clip. Unknown words fall back to fingerspelling.",
    icon: "MessageSquare",
  },
  {
    kicker: "Practice mode",
    title: "A patient, honest coach.",
    body: "Compare your attempt with a reference, get a similarity score and precise, actionable feedback — no shame, just signal.",
    icon: "Sparkles",
  },
];
