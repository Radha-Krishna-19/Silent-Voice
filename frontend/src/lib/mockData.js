/**
 * Demo content for surfaces that are not yet wired to real data.
 *
 * RULE: every sign shown here must exist in the trained vocabulary.
 *
 * The previous version of this file advertised capabilities the system does not
 * have — PAIN, HELP, AMBULANCE, WATER, and sentences like "I need water,
 * please" / "My name is Aarav". None of those words are classes in the dataset;
 * 17 of the 26 words the Practice page displayed had never been seen by the
 * model. Showing them implied a working sentence-level translator over a
 * medical vocabulary, when what exists is a 261-class isolated-word classifier.
 *
 * Everything below is drawn from lib/vocabulary.js, which is generated from
 * backend/models/label_map.json by ml/scripts/export_ui_vocab.py.
 */
import { DOMAIN_PACKS as PACKS, pretty } from "./vocabulary";

export const DOMAIN_PACKS = PACKS;

/**
 * Illustrative live output. Single words, because the model classifies one
 * isolated sign per 60-frame window — it does not produce sentences.
 */
export const LIVE_CAPTION_QUEUE = ["HELLO", "TEACHER", "BOOK", "THANK YOU"];

export const RECENT_TRANSCRIPT = [
  { id: "t1", ts: "00:04", text: "HELLO", confidence: 0.96 },
  { id: "t2", ts: "00:09", text: "TEACHER", confidence: 0.91 },
  { id: "t3", ts: "00:15", text: "BOOK", confidence: 0.74, corrections: ["PAPER", "PAGE"] },
  { id: "t4", ts: "00:22", text: "THANK YOU", confidence: 0.98 },
];

/**
 * Practice lessons, built from real topic packs. Words are guaranteed to exist
 * in the vocabulary because the packs are generated from the label map.
 */
export const PRACTICE_LESSONS = PACKS.slice(0, 3).map((p) => ({
  id: p.id,
  name: p.name,
  words: p.words.slice(0, 6).map(pretty),
  total: p.count,
}));

/** Sessions shown on /transcripts. Labelled as demo data in the UI. */
export const SESSIONS = [
  {
    id: "demo-1",
    title: "Vocabulary check — greetings",
    domain: "Greetings & social",
    date: "demo",
    duration: "1m 12s",
    signs: 4,
    avgConfidence: 0.9,
    entries: [
      { ts: "00:04", text: "HELLO", conf: 0.96 },
      { ts: "00:19", text: "GOOD MORNING", conf: 0.88 },
      { ts: "00:41", text: "THANK YOU", conf: 0.98 },
      { ts: "01:02", text: "GOOD", conf: 0.79 },
    ],
  },
  {
    id: "demo-2",
    title: "Vocabulary check — people",
    domain: "People & family",
    date: "demo",
    duration: "0m 48s",
    signs: 3,
    avgConfidence: 0.86,
    entries: [
      { ts: "00:03", text: "MOTHER", conf: 0.92 },
      { ts: "00:21", text: "FRIEND", conf: 0.84 },
      { ts: "00:39", text: "TEACHER", conf: 0.82 },
    ],
  },
];

/**
 * Landing-page feature cards. Copy corrected to describe what the system
 * actually does: it classifies isolated words, it does not assemble sentences
 * character-by-character, and it cannot fingerspell (ISL uses a two-handed
 * manual alphabet and the dataset contains no alphabet recordings).
 */
export const FEATURE_CARDS = [
  {
    kicker: "Live translation",
    title: "See signs become words.",
    body: "Webcam frames go to a local server, MediaPipe extracts the skeleton, and a BiLSTM or 1D CNN names the sign — one of 261 — in under a millisecond.",
    icon: "Radio",
  },
  {
    kicker: "Reply in sign",
    title: "Type or speak. It signs back.",
    body: "English is re-ordered into ISL gloss, then replayed from the same recordings the model was trained on. Words outside the vocabulary are reported, never guessed.",
    icon: "MessageSquare",
  },
  {
    kicker: "Two models, measured",
    title: "The smaller one won.",
    body: "BiLSTM and 1D CNN trained on identical splits. The CNN reached 94.55% against 91.74% — with 3.6x fewer parameters and 5.6x lower latency.",
    icon: "Sparkles",
  },
];

/**
 * Practice-mode feedback. DEMO ONLY — landmark trajectory scoring is not
 * implemented, so these scores are illustrative and the page says so.
 * Words are drawn from the real vocabulary.
 */
export const PRACTICE_FEEDBACK = [
  {
    word: "HELLO",
    score: 0.92,
    notes: ["Scoring is not implemented — this is placeholder feedback.",
            "Real scoring would compare your landmark trajectory against the reference."],
  },
  {
    word: "THANK YOU",
    score: 0.71,
    notes: ["Scoring is not implemented — this is placeholder feedback.",
            "The reference clip shown is a real recording from the dataset."],
  },
];
