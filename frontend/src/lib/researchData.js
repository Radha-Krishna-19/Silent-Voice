/**
 * The two architectures under comparison.
 *
 * IMPORTANT: `valAcc`, `latencyMs` and `params` are deliberately null.
 * They are populated at runtime from GET /api/comparison, which reads
 * ml/logs/comparison.json off disk after a real training run. Until that
 * file exists the UI renders an explicit "not yet trained" state rather
 * than inventing numbers. Do not hardcode results here.
 */
export const MODEL_COMPARISON = [
  {
    id: "bilstm",
    name: "BiLSTM",
    kicker: "Model A · Recurrent",
    tagline: "Reads the gesture as a sequence in time.",
    architecture: [
      "2× Bidirectional LSTM (hidden 256)",
      "Dropout 0.3 between layers",
      "Mean-pool over T → Dense 128 → softmax",
    ],
    params: null,
    valAcc: null,
    latencyMs: null,
    hypothesis:
      "Recurrence should suit signs whose meaning depends on the order of movement — where the hand travels, not just where it ends up.",
    strengths: [
      "Models long-range temporal dependencies directly",
      "Both directions seen, so sign onset and offset both inform the label",
      "Handles variable signer speed without explicit alignment",
    ],
    weaknesses: [
      "Sequential compute — cannot parallelise across the time axis",
      "More sensitive to initialisation; higher run-to-run variance",
      "Slower per-step inference than a convolution",
    ],
  },
  {
    id: "cnn",
    name: "1D Temporal CNN",
    kicker: "Model B · Convolutional",
    tagline: "Reads the gesture as a stack of local motion patterns.",
    architecture: [
      "3× Conv1d blocks (k=5) over the time axis",
      "BatchNorm + ReLU + MaxPool between blocks",
      "Global average pool → Dense → softmax",
    ],
    params: null,
    valAcc: null,
    latencyMs: null,
    hypothesis:
      "Many isolated signs are separable from a handful of short motion primitives. If so, a convolution over T should match recurrence at a fraction of the cost.",
    strengths: [
      "Fully parallel over the time axis — markedly faster to train",
      "Fewer parameters for the same receptive field",
      "Very stable convergence; low variance across seeds",
    ],
    weaknesses: [
      "Fixed receptive field — long dependencies need more depth",
      "Weaker on signs distinguished only by ordering of sub-movements",
      "Pooling can discard precise timing information",
    ],
  },
];

/** Which architecture keys the backend may report in comparison.json. */
export const ARCH_IDS = ["bilstm", "cnn"];

export const PIPELINE_STEPS = [
  { n: "01", t: "Frame capture", b: "Webcam frame stays in the browser. Nothing leaves." },
  { n: "02", t: "MediaPipe Holistic", b: "21 hand + 33 pose landmarks extracted client-side at ~30fps." },
  { n: "03", t: "Preprocess", b: "Wrist-origin normalize · z-score · pad/truncate to T=60 frames." },
  { n: "04", t: "Model inference", b: "BiLSTM or 1D CNN (A/B via the model field on /api/frame) → gloss logits." },
  { n: "05", t: "Gloss → English", b: "Gemini 3 Flash shapes the gloss sequence into natural English." },
  { n: "06", t: "TTS", b: "Web Speech reads the caption aloud in the user's chosen voice." },
];

export const NLP_STEPS = [
  {
    stage: "Forward · gloss → English",
    kicker: "Gemini 3 Flash",
    where: "After the model emits a gloss sequence (e.g. `[TODAY, YOU, HOW]`).",
    what: "Small LLM rewrites the ISL gloss into a natural English sentence with punctuation.",
    prompt: "System: Rewrite ISL gloss into natural conversational English. Preserve meaning. No additions.\nInput: TODAY YOU HOW\nOutput: How are you today?",
    fallback: "Rule-based template map (memoized common phrases + article-insertion heuristics) when Gemini is unreachable or rate-limited.",
  },
  {
    stage: "Reverse · English → gloss",
    kicker: "Rule engine + LLM fallback",
    where: "When a non-signer types or dictates English in reverse mode.",
    what: "Tokenize → drop articles/copulas → reorder to ISL order (SOV, topic-first) → mark OOV words for fingerspelling.",
    prompt: "System: Convert English to ISL gloss. Drop A/AN/THE/IS/AM/ARE. Use SOV order. Uppercase.\nInput: How are you today\nOutput: TODAY YOU HOW",
    fallback: "Deterministic rule pass handles ~80% of the locked vocabulary. Gemini only invoked for sentences with unknown structure.",
  },
  {
    stage: "Correction chips",
    kicker: "Top-k logit expansion",
    where: "When model confidence drops below 70% on the live caption.",
    what: "Take top-3 gloss candidates from softmax → run each through the forward NLP step → surface as clickable correction chips.",
    prompt: "(no LLM — pure math on model output)",
    fallback: "N/A — this is the safety net itself.",
  },
];

export const DATA_WORKFLOW = [
  {
    n: "01",
    t: "You download INCLUDE",
    b: "Public dataset from Zenodo. No auth, no API key. Plan for 30+ GB extracted footprint.",
    link: "https://zenodo.org/record/4010759",
    who: "You / ML teammate",
  },
  {
    n: "02",
    t: "You record 18 phrase clips",
    b: "Multi-sign phrases missing from INCLUDE (hello, I love you, my name is…). 720p, front-lit, plain backdrop.",
    link: null,
    who: "You + one other signer",
  },
  {
    n: "03",
    t: "We preprocess to landmarks",
    b: "Script provided: MediaPipe Holistic → wrist-origin normalize → pad/truncate to T=60 → save as .npy tensors keyed by label.",
    link: null,
    who: "Provided script",
  },
  {
    n: "04",
    t: "Train BiLSTM + CNN",
    b: "PyTorch training scripts (both models, shared data loader and identical splits). ml/run_pipeline.py drives preprocess → train → evaluate in one command.",
    link: null,
    who: "Provided scripts",
  },
  {
    n: "05",
    t: "You upload .pt + video clips",
    b: "Drop .pt weights into backend/models/ and MP4/WebM clips into object storage. Update Mongo sign_clips.videoUrl.",
    link: null,
    who: "You (one-time)",
  },
  {
    n: "06",
    t: "Web app serves both",
    b: "FastAPI loads .pt on boot, A/B via X-Model header. Reverse-mode player picks up videoUrl automatically.",
    link: null,
    who: "Automatic",
  },
];

export const DATASET_BREAKDOWN = {
  base: {
    name: "INCLUDE",
    kicker: "IIT Bombay · 2020",
    videos: 4287,
    labels: 263,
    signers: 7,
    note: "Word-level isolated ISL vocabulary. Multi-signer for signer-invariance.",
  },
  gap: {
    name: "Custom phrase pack",
    kicker: "Self-recorded · in-house",
    videos: 18,
    labels: 8,
    signers: 2,
    note: "Multi-sign phrase clips absent from INCLUDE (hello, I love you, my name is…).",
  },
  split: [
    { name: "Train", pct: 0.70 },
    { name: "Validation", pct: 0.15 },
    { name: "Test", pct: 0.15 },
  ],
};
