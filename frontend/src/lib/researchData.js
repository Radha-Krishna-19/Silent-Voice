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
  { n: "01", t: "Frame capture", b: "Webcam → canvas → JPEG, throttled to 12 fps, POSTed to the local server." },
  { n: "02", t: "MediaPipe Holistic", b: "21+21 hand and 33 pose landmarks, extracted SERVER-side in Python — the same code that built the training data." },
  { n: "03", t: "Preprocess", b: "Wrist-origin normalise · shoulder-scale · resample to T=60 · z-score with train-split stats." },
  { n: "04", t: "Model inference", b: "BiLSTM or 1D CNN (chosen by the model field on /api/frame) → softmax over 261 classes." },
  { n: "05", t: "Label → caption", b: "The predicted class name is shown directly. No LLM: the model outputs one word, not a sentence." },
  { n: "06", t: "TTS", b: "Web Speech reads the predicted word aloud in the browser." },
];

export const NLP_STEPS = [
  {
    stage: "Forward · sign → word",
    kicker: "Direct classification",
    where: "After the model scores a 60-frame landmark window.",
    what: "The arg-max class name IS the output. There is no language model and no sentence "
      + "assembly — the system recognises one isolated sign at a time.",
    prompt: "(no LLM — softmax over 261 classes)",
    fallback: "Top-k alternatives are surfaced as correction chips when confidence is low.",
  },
  {
    stage: "Reverse · English → gloss",
    kicker: "Deterministic rule engine",
    where: "backend/gloss.py, when a non-signer types or speaks English.",
    what: "Tokenise → drop articles and copula (ISL marks neither) → move time words to the "
      + "front and question words to the end (ISL is SOV / topic-comment) → map synonyms and "
      + "simple morphology onto the 261-word vocabulary.",
    prompt: "\"Where is the doctor?\"  →  DOCTOR WHERE",
    fallback: "Words outside the vocabulary are reported explicitly. Fingerspelling is NOT "
      + "attempted: ISL uses a two-handed manual alphabet and the dataset contains no alphabet recordings.",
  },
  {
    stage: "Reverse · gloss → motion",
    kicker: "Recorded skeleton playback",
    where: "backend/models/sign_bank.json, built from the training tensors themselves.",
    what: "Each word maps to the medoid take for that class, trimmed to the frames where the "
      + "sign is actually performed, replayed at 12 fps. Forward and reverse therefore share "
      + "one source of truth.",
    prompt: "(no avatar, no motion capture, no video files)",
    fallback: "Words with no usable recording are marked unavailable rather than substituted.",
  },
];

export const DATA_WORKFLOW = [
  {
    n: "01",
    t: "Download INCLUDE",
    b: "Public dataset from Zenodo — no auth, no API key. 4,284 clips across 263 word classes, ~54 GB extracted.",
    link: "https://zenodo.org/record/4010759",
    who: "One-time",
  },
  {
    n: "02",
    t: "Extract landmarks",
    b: "scripts/preprocess.py → MediaPipe Holistic → wrist-origin normalise → resample to T=60 → (60, 225) .npy per clip. ~90 min on 4 CPU workers.",
    link: null,
    who: "Provided script",
  },
  {
    n: "03",
    t: "Filter unusable classes",
    b: "--min-per-class 6 drops classes with too few clips for a stratified 70/15/15 split. Two classes removed, leaving 261 / 4,276.",
    link: null,
    who: "Automatic",
  },
  {
    n: "04",
    t: "Train BiLSTM + CNN",
    b: "One shared loop, identical split at seed 42, identical schedule. Only the architecture differs. ~33 min and ~5 min on CPU.",
    link: null,
    who: "Provided scripts",
  },
  {
    n: "05",
    t: "Evaluate once",
    b: "scripts/evaluate.py touches the held-out test split a single time and writes logs/comparison.json plus confusion matrices.",
    link: null,
    who: "Provided script",
  },
  {
    n: "06",
    t: "Serve both directions",
    b: "run_pipeline.py stages checkpoints into backend/models/. build_sign_bank.py turns the same tensors into the reverse-translation animation bank.",
    link: null,
    who: "Automatic",
  },
];

export const DATASET_BREAKDOWN = {
  base: {
    name: "INCLUDE",
    kicker: "IIT Bombay · ACM MM 2020",
    videos: 4284,
    labels: 263,
    signers: 7,
    note: "The FULL corpus, not the 50-class subset commonly redistributed on Kaggle. Word-level isolated signs; no sentences.",
  },
  gap: {
    name: "Actually used",
    kicker: "After filtering",
    videos: 4276,
    labels: 261,
    signers: 7,
    note: "Two classes (nice, thin) hold only 4 clips each — too few for a stratified split — and were dropped before training.",
  },
  split: [
    { name: "Train", pct: 0.70 },
    { name: "Validation", pct: 0.15 },
    { name: "Test", pct: 0.15 },
  ],
};
