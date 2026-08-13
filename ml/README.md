# Silent Voice — ML workspace (forward translation: ISL sign → English)

Everything here trains and evaluates the sign-recognition models. It is **decoupled
from the web app** — the FastAPI backend only reads `backend/models/*.pt` at boot,
so nothing in this folder needs to run inside the app pod.

**Division of work:** BiLSTM + 1D-CNN baseline are mine. The Transformer is my
teammate's. All three run through the *same* `_train.run()` function with the same
seed, split, normalisation and augmentation — so the comparison is apples to apples.

```
ml/
├── run_pipeline.py           ← one command: videos → landmarks → models → report
├── data/
│   ├── include/              ← INCLUDE dataset (or point --videos at "archive (3)")
│   ├── custom/               ← your own recorded clips, one folder per label
│   └── processed/            ← .npy landmark tensors (generated)
├── models/                   ← trained .pt + label_map.json + preproc_stats.json
├── scripts/
│   ├── preprocess.py         # MediaPipe Holistic → (60, 225) .npy tensors
│   ├── dataset.py            # PyTorch Dataset + augmentation + normalisation stats
│   ├── models.py             # BiLSTM · CNN1D · Transformer
│   ├── _train.py             # the single shared training loop
│   ├── train_bilstm.py       # → models/bilstm.pt        (mine)
│   ├── train_cnn.py          # → models/cnn.pt           (baseline / control)
│   ├── train_transformer.py  # → models/transformer.pt   (teammate)
│   ├── evaluate.py           # three-way comparison + confusion matrices
│   ├── predict.py            # run one video end-to-end (smoke test)
│   ├── classes_isl20.txt     # 20 classes: app vocab ∩ what's actually on disk
│   └── classes_locked.txt    # the wider ~76-word app vocabulary
└── logs/                     ← comparison.md, comparison.json, confusion_*.png
```

---

## Quick start

```bash
cd ml
pip install -r requirements-training.txt

# ~200 clips, 20 classes. About 45-70 min on a 2-core laptop, ~8 min on Colab.
python run_pipeline.py --videos "../archive (3)"
```

Then read `logs/comparison.md`.

> **mediapipe must be < 1.0.** Version 1.0.0 deleted `mediapipe.solutions`
> (including Holistic). The requirements file pins `0.10.14` for this reason.
> If you see `AttributeError: module 'mediapipe' has no attribute 'solutions'`,
> that's the pin being ignored.

### Scaling up once it works

```bash
# all 262 classes in the archive, 12 takes each
python run_pipeline.py --videos "../archive (3)" \
    --classes scripts/classes_locked.txt --max-per-class 12 --epochs 80

# no whitelist at all — the full 4,284 clips
python scripts/preprocess.py --videos "../archive (3)" \
    --out data/processed/include --sample-frames 40 --workers 4
```

---

## The data

The archive on disk is **INCLUDE (IIT Bombay / Zenodo 4010759)**: 4,284 `.MOV`
clips, 262 word classes, 15 semantic categories, ~16-24 takes per word from
multiple signers. Layout:

```
archive (3)/Adjectives_1of8/Adjectives/1. loud/MVI_5177.MOV
                            └── category ──┘  └ class ┘  └ take ┘
```

`preprocess.py` takes the **immediate parent folder** as the label and strips the
`"1. "` prefix, so `1. loud` → `loud`. The `_1of8` split folders are irrelevant —
`rglob` walks straight through them.

## Skeleton extraction — what actually happens

Per frame, MediaPipe Holistic returns 21 left-hand + 21 right-hand + 33 pose
landmarks. Keeping `(x, y, z)` for each gives **225 features per frame**:

| slice | content | normalisation |
|---|---|---|
| `[0:63]` | left hand, 21 pts | re-origined on the wrist, ÷ shoulder width |
| `[63:126]` | right hand, 21 pts | re-origined on the wrist, ÷ shoulder width |
| `[126:225]` | pose, 33 pts | left in image space — torso position is meaningful |

Every clip is resampled to a fixed **T = 60** frame window (uniform subsample if
longer, loop-pad if shorter). Final tensor: `(60, 225)` float32, ~54 KB.

**Why landmarks and not pixels.** Three reasons, and the third is the one that
matters for a report:

1. **Size** — 54 KB vs ~12 MB per clip. The whole 262-class dataset becomes ~230 MB
   of tensors, so training fits in RAM and epochs take seconds.
2. **Speed** — a 60×225 sequence model trains on CPU. A video CNN needs a GPU.
3. **Invariance** — background, lighting, skin tone, clothing and camera distance
   all disappear. INCLUDE was shot in a handful of rooms; a pixel model would
   happily learn "beige wall ⇒ Greetings" and score well on a random split while
   being useless on a webcam. Landmarks make that shortcut impossible.

Cost of the choice: MediaPipe becomes a hard dependency, and anything it can't see
(fine finger occlusion, facial grammar such as eyebrow raise for questions) is lost.
Facial landmarks are deliberately off — 468 more points for marginal isolated-sign
gain — but they are the first thing to add when moving to sentence-level ISL.

### Speed knobs

| flag | effect |
|---|---|
| `--sample-frames 40` | only push ~40 frames per clip through MediaPipe instead of all 60-240. 2-6× faster, no measurable accuracy cost. |
| `--model-complexity 0` | lighter Holistic graph, ~2× faster, slightly noisier landmarks |
| `--max-per-class 10` | fewer takes per word — also balances the classes |
| `--workers 4` | one MediaPipe graph per process; scales near-linearly with cores |
| `--delete-after` | delete each source video once its tensor is safely on disk |
| `--resume` (default on) | re-running skips clips already extracted |

Frames are also downscaled to 640 px wide before inference — INCLUDE ships 1080p
and MediaPipe downsamples internally anyway.

---

## The three models

All consume `(B, 60, 225)` and emit class logits.

### BiLSTM — *mine*
2-layer bidirectional LSTM (hidden 256) → mean-pool over time → 128 → classes.
Bidirectional because an isolated sign is a *complete, already-recorded* gesture:
when classifying frame 30 the model is allowed to know what happens at frame 55.
The handshape at the end of "thank you" disambiguates its beginning. Mean-pooling
over all timesteps rather than taking the last hidden state keeps the middle of
the sign — where the movement actually is — from being squeezed through one vector.

### 1D-CNN — *the control*
Three Conv1D blocks (kernel 5, BatchNorm, GELU, 2 max-pools) → concat of
avg-pool and max-pool → classes. Deliberately has **no recurrent state**: its
receptive field is ~29 of the 60 frames, so it sees local motion primitives but
cannot relate the start of a sign to its end.

That is the whole point of including it. The comparison isn't "which model wins",
it's **"how much does long-range temporal modelling actually buy us on isolated
ISL signs?"** Expected shape of the answer:

- CNN gets surprisingly close on short, single-motion signs (`book`, `hello`)
- BiLSTM pulls ahead on signs distinguished by *order* — pairs like
  `today` / `tomorrow` / `yesterday` share a handshape and differ mainly in the
  direction and sequencing of movement
- CNN is 3-5× faster per clip and has far fewer parameters, which is a real
  argument if this ever ships to a phone

`evaluate.py` reports params, latency, macro-F1 and the worst-10 classes per model,
so you can make exactly that argument with numbers.

### Transformer — *teammate's*
Learned CLS token + learned positional embeddings + 4 pre-norm encoder layers.
Self-attention relates any two frames directly (unlike the LSTM's step-by-step
state, or the CNN's fixed window), but it has no built-in notion of sequence order
beyond the positional embedding, and it is the most data-hungry of the three —
worth watching on a 20-class / 200-clip run.

---

## Honest-comparison rules this code enforces

Any one of these broken makes the comparison worthless, so they live in
`_train.py` rather than in each training script:

- **One split, seed 42**, stratified 70/15/15. `make_splits()` is imported by
  `evaluate.py` too, so all models are scored on the identical test clips.
- **Normalisation stats from the training split only.** `compute_stats()` never
  sees val or test.
- **Augmentation on train only** — jitter, 10% frame drop, ±4-frame temporal
  shift, and horizontal mirror (left- vs right-handed signers).
- **Same optimiser** (AdamW, cosine schedule, label smoothing 0.05, grad clip 1.0)
  and same epoch budget for every architecture.
- **Best-val checkpointing** with early stopping — no model gets to report its
  luckiest epoch on the test set.

The mirror augmentation is subtler than it looks: hands are wrist-centred so
mirroring is a sign flip on `x`, but pose is in `[0, 1]` image space so it must
mirror about `0.5` **and** swap its 16 left/right joint index pairs. Negating pose
`x` (the obvious implementation) pushes it out of range and quietly poisons
training. See `_mirror()` in `dataset.py`.

---

## Outputs

| file | what it's for |
|---|---|
| `models/bilstm.pt`, `cnn.pt`, `transformer.pt` | weights + labels + val_acc + param count |
| `models/label_map.json` | class index → word (backend needs this) |
| `models/preproc_stats.json` | per-feature mean/std (backend needs this too) |
| `logs/comparison.md` | the table for the report |
| `logs/comparison.json` | same, plus per-class F1 |
| `logs/confusion_<arch>.png` | row-normalised confusion matrix |
| `logs/<arch>_history.json` | per-epoch loss/acc curves |

### Going live

```bash
cp models/bilstm.pt models/cnn.pt models/label_map.json models/preproc_stats.json \
   ../backend/models/
sudo supervisorctl restart backend
```

`backend/inference.py` loads whichever checkpoints exist, applies
`preproc_stats.json`, and falls back to the mock predictor if anything is missing —
the UI never breaks. Default serving model is `bilstm`.

Single-clip smoke test before you deploy:

```bash
python scripts/predict.py --video "../archive (3)/People_1of5/People/3. Teacher/MVI_xxxx.MOV"
```

---

## Why not ISL-CSLTR?

ISL-CSLTR is *continuous* sign language — full sentences, ~700 samples, built for
seq2seq with CTC loss. Our classifiers do *isolated* signs. Different problem
shape, far worse per-class sample count. It becomes relevant at the sentence-level
stage (see `ROADMAP.md`), not now.
