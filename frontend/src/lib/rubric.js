/**
 * The Review 2 rubric, and an honest audit of what the project can currently
 * evidence against it.
 *
 * Rules used when assigning a status, so this page stays useful rather than
 * flattering:
 *
 *   have    — the artefact exists NOW and can be pointed at: a specific deck
 *             slide, a page in this app, or a file in the repo.
 *   partial — some of the required parts exist; the missing parts are listed
 *             explicitly in `missing`.
 *   todo    — nothing exists yet.
 *
 * Slide references were read out of CB.SC.U4CSE23134.pptx with python-pptx,
 * not guessed.
 */

export const RUBRIC = [
  {
    n: 1,
    title: "Problem statement, introduction, motivation",
    marks: 4,
    status: "have",
    evidence: [
      "Deck slides 3–7 (sections 01–04): the 63-million figure, the interpreter shortage, and the objective.",
      "Review template slide 2 carries the problem statement and objective in the faculty format.",
    ],
    missing: [],
  },
  {
    n: 2,
    title: "Literature survey",
    detail:
      "Five papers per student, related to your deep learning architecture, from a journal listed on scimagojr.com in 2025 or 2026.",
    marks: 5,
    status: "todo",
    evidence: [],
    missing: [
      "Five papers, each verified as present in the SCImago 2025/2026 listing.",
      "For each: citation, the architecture it uses, its reported metric values, and how it relates to the BiLSTM-vs-CNN comparison.",
      "A survey slide in the deck.",
    ],
    note:
      "This is the single largest gap. It also blocks two other rows: the metrics table needs 'best values discussed in the papers', and row 12 needs a chosen standard paper.",
  },
  {
    n: 3,
    title: "Architecture diagram for the overall application",
    marks: 5,
    status: "have",
    evidence: [
      "Deck slide 16 (09 — SYSTEM ARCHITECTURE).",
      "The diagram matches the shipped code path: browser capture → POST /api/frame → MediaPipe Holistic → normalise → model → gloss.",
    ],
    missing: [],
  },
  {
    n: 4,
    title: "Module details",
    marks: 5,
    status: "have",
    evidence: [
      "Deck slide 17 (10 — MODULES).",
      "Every module named there exists as a file: preprocess.py, models.py, inference.py, gloss.py, practice.py.",
    ],
    missing: [],
  },
  {
    n: 5,
    title: "Formula of performance metrics",
    detail:
      "A table with the metric name, its purpose, why it suits this application, and the best values discussed for that metric in the papers.",
    marks: 3,
    status: "partial",
    evidence: [
      "Deck slide 26 already has metric · formula · what it captures, for nine metrics.",
      "Notation is defined (N = 261 classes, n = 642 test clips).",
      "All formulas are the ones evaluate.py actually computes via sklearn.",
    ],
    missing: [
      "A fourth column: best values reported for each metric in the surveyed papers — which needs row 2 done first.",
    ],
  },
  {
    n: 6,
    title: "Deep learning architecture",
    detail: "a. Diagram   b. Explanation   c. Novelty proposed   d. Time and space complexity",
    marks: 5,
    status: "partial",
    evidence: [
      "Deck slides 22–23: layer-by-layer diagrams and design rationale for both BiLSTM and 1D CNN.",
      "Parameter counts are measured, not asserted: 2,665,477 vs 736,773.",
    ],
    missing: [
      "An explicit novelty statement (c).",
      "Time and space complexity in big-O, per model (d).",
    ],
    note:
      "The honest novelty here is the controlled comparison itself plus the shared landmark front-end, not a new layer type. Claiming a novel architecture would not survive a question.",
  },
  {
    n: 7,
    title: "Algorithm procedure, step by step, mathematically",
    marks: 5,
    status: "todo",
    evidence: [],
    missing: [
      "A numbered procedure from raw frame to predicted label with the actual equations: landmark extraction, wrist-origin translation, shoulder-width scaling, z-score with train-split statistics, the recurrence and convolution equations, mean-pooling, softmax, argmax.",
    ],
    note:
      "Every one of these steps is already implemented and can be transcribed straight out of preprocess.py and models.py, so this is writing rather than research.",
  },
  {
    n: 8,
    title: "Hyperparameter details table with justification",
    marks: 5,
    status: "have",
    evidence: [
      "Deck slides 24–25: the table and the tuning discussion.",
      "Values are the ones actually used: AdamW, cosine annealing, label smoothing 0.05, early stopping patience 20, lr 3e-3, batch 32, 60 epochs.",
      "Best epochs are recorded: 41/60 for BiLSTM, 45/60 for CNN.",
    ],
    missing: [],
  },
  {
    n: 9,
    title: "Results and discussion",
    detail: "Tables, graphs, inference achieved from the architecture.",
    marks: 3,
    status: "have",
    evidence: [
      "Deck slide 27: nine metrics, both models, with a stated winner and observation per row.",
      "Numbers are measured on a 642-clip held-out test split, not estimated.",
      "The Research page in this app reads the same comparison.json off disk, so it cannot drift from the deck.",
    ],
    missing: [],
    link: "/research",
  },
  {
    n: 10,
    title: "Dataset chosen, and the novelty in the dataset",
    detail: "IEEE Dataport URL required.",
    marks: 3,
    status: "partial",
    evidence: [
      "Deck slides 13, 18–21: INCLUDE described, plus extraction results.",
      "Real counts: 261 classes, 4,276 usable clips after filtering classes with fewer than 5 recordings.",
    ],
    missing: [
      "The IEEE Dataport URL the rubric explicitly asks for.",
      "A stated novelty for the dataset choice.",
    ],
    note:
      "Worth checking carefully: INCLUDE is distributed via Zenodo. If it is not on IEEE Dataport, ask whether the Zenodo DOI is acceptable rather than citing a URL that does not resolve.",
  },
  {
    n: 11,
    title: "UI screens planned for the application",
    marks: 5,
    status: "have",
    evidence: [
      "Nine screens exist and run: gate, home, live, reverse, practice, transcripts, research, rubric, settings.",
      "These are the working application, not mockups — the same build the demo runs on.",
    ],
    missing: [],
    link: "/home",
  },
  {
    n: 12,
    title: "Standard paper chosen for the application",
    detail: "Title and justification, from a journal.",
    marks: 2,
    status: "todo",
    evidence: [],
    missing: [
      "One paper nominated as the reference standard, with a justification tying it to this system.",
    ],
    note: "Falls out of row 2 once the survey is done — pick the closest of the five.",
  },
];

export const TOTAL_MARKS = RUBRIC.reduce((s, r) => s + r.marks, 0);

export const marksBy = (status) =>
  RUBRIC.filter((r) => r.status === status).reduce((s, r) => s + r.marks, 0);

export const STATUS_META = {
  have: { label: "Evidenced", color: "#6EE7F2", desc: "The artefact exists and can be pointed at." },
  partial: { label: "Partial", color: "#C97B4A", desc: "Some required parts are missing." },
  todo: { label: "Not started", color: "#8A8A93", desc: "Nothing exists for this row yet." },
};
