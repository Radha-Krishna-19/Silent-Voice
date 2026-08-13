# Silent Voice

**Real-time Indian Sign Language ↔ English translator.** A signer stands in front
of any laptop webcam; the browser turns their signing into captions and speech.

This README assumes you have never seen this project before. Read it top to
bottom and you will have the app running in about 15 minutes.

---

## 1. What this project actually is

Two things live in this repository:

1. **A web application** — React frontend + FastAPI backend. It captures webcam
   frames, extracts hand/body skeleton coordinates, classifies them into sign
   labels, and shows the result as a caption.
2. **A deep-learning case study** — training two different neural network
   architectures (**BiLSTM** and **1D CNN**) on the same data and comparing them
   fairly. This is the academic deliverable.

### The core idea: landmarks, not pixels

The model never sees video. Every clip is converted into a small array of
**skeleton coordinates**:

```
one video clip  →  a (60, 225) array of numbers
                    │    └── 225 features per frame
                    │        21 left-hand points  × (x,y,z) = 63
                    │        21 right-hand points × (x,y,z) = 63
                    │        33 body pose points  × (x,y,z) = 99
                    └── 60 time steps (every clip resampled to exactly 60 frames)
```

That is ~54 KB per clip instead of ~12 MB of video. Skin tone, clothing,
lighting and background all disappear, so the model cannot cheat by memorising
backgrounds — it has to learn the actual gesture.

### Repository layout

```
silent_voice/
├── frontend/          React web app (the product UI)      ← what users see
│   ├── src/pages/     9 screens: Live, Reverse, Practice, Research, …
│   └── src/hooks/     useLiveCapture (webcam), useComparison (metrics)
├── backend/           FastAPI server
│   ├── server.py      API + runs MediaPipe + serves predictions
│   ├── inference.py   loads the trained .pt checkpoints
│   └── static/        a simple fallback UI (no build step needed)
├── ml/                the deep-learning case study         ← the DL deliverable
│   ├── scripts/       preprocess, dataset, models, training, evaluation
│   ├── data/          landmark tensors land here
│   └── logs/          results land here
├── archive (3)/       the INCLUDE dataset (54 GB, gitignored)
└── memory/            PRD and project notes
```

---

## 2. Prerequisites

| Need | Version | Check with |
|---|---|---|
| Python | 3.10 or 3.11 | `python --version` |
| Node.js | 18+ | `node --version` |
| Yarn or npm | any | `yarn --version` |
| Webcam | any | for the Live page |

> **Python 3.12+ will not work** — `mediapipe` 0.10.x has no wheel for it.

---

## 3. Install (one time, ~10 minutes)

Open a terminal in the project folder.

```bash
# --- frontend ---
cd frontend
yarn install                    # or: npm install --legacy-peer-deps
cd ..

# --- backend ---
cd backend
pip install -r requirements.txt
cd ..

# --- training ---
cd ml
pip install -r requirements-training.txt
cd ..
```

**If `torch` fails or is very slow**, install it separately (CPU build, ~200 MB):

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

**Sanity check** — this verifies every dependency, all three model
architectures, and one real MediaPipe extraction. Takes ~30 seconds:

```bash
cd ml
python scripts/verify_setup.py --videos "../archive (3)"
```

---

## 4. Open the product website

You need **two terminals running at the same time**. Leave both open.

### Terminal 1 — the backend

```bash
cd backend
python server.py
```

You should see:

```
============================================================
  Silent Voice
  models loaded : []            <- empty until you train
  classes       : 0
  !! MOCK MODE — no checkpoints in backend/models/.
  ->  http://localhost:8000
============================================================
```

`MOCK MODE` is **normal and expected** before training. The server still runs and
the whole site still works — predictions are just placeholders until step 5.

Confirm it's alive: open <http://localhost:8000/api/status> — you should get JSON.

### Terminal 2 — the frontend

```bash
cd frontend
yarn start
```

A browser opens at **<http://localhost:3000>**. That is the product website.

> If it doesn't open automatically, go to <http://localhost:3000> yourself.
> The frontend already knows to talk to port 8000 — that's set in `frontend/.env`.

### What to click

| Page | URL | What it does |
|---|---|---|
| **Home** | `/` | Landing page |
| **Live** | `/live` | **The main feature.** Click the camera icon, allow webcam access. The cyan skeleton overlay is *real* MediaPipe output tracking your hands. Toggle BiLSTM / CNN to switch model. |
| **Research** | `/research` | BiLSTM vs CNN comparison. Shows `NOT TRAINED` with em-dashes until step 5, then real numbers. |
| Reverse | `/reverse` | English → sign playback. **Design preview only** — uses placeholder data. |
| Practice | `/practice` | Learner coaching mode. **Design preview only.** |
| Transcripts | `/transcripts` | Session history. **Design preview only.** |
| Settings / About | `/settings`, `/about` | Static pages |

**There is a second, simpler UI** at <http://localhost:8000> — plain HTML/JS
served directly by FastAPI, no build step. Useful if Node isn't available or the
React dev server misbehaves. Same backend, fewer features.

---

## 5. Train the models (the DL deliverable)

### The data is already preprocessed

`ml/data/processed/include/` already contains **160 landmark tensors** —
20 sign classes × 8 clips each, extracted and verified. So you can go straight
to training:

```bash
cd ml
python run_pipeline.py --skip-preprocess --epochs 60 --batch 16
```

This runs, in order:

1. `train_bilstm.py` → `ml/models/bilstm.pt`
2. `train_cnn.py` → `ml/models/cnn.pt`
3. `evaluate.py` → test metrics for both, on the held-out split
4. `make_report.py` → an HTML report

**Expect 10–30 minutes per model** on a laptop CPU for 20 classes. You'll see
per-epoch output like `epoch 007  loss 1.8423  val_acc 0.6250  (9.4s)`.

### Training on more of the dataset

The 160 tensors are only **3.7%** of what's available — the full archive has
**4,284 videos across 262 sign classes**. To use more, re-run extraction:

```bash
cd ml
python scripts/preprocess.py \
    --videos "../archive (3)" \
    --out data/processed/include \
    --max-per-class 8 \
    --sample-frames 32 \
    --workers 4
```

Dropping `--classes` uses all 262 classes (~2,100 clips at 8 each, roughly
30–60 min with 4 workers). Then run the training command above again.

> **Recommendation:** train on the existing 20 classes first to confirm the whole
> pipeline works, *then* scale up. Debugging a 4-hour run is painful; debugging a
> 15-minute one isn't.

> **Disk space:** add `--delete-after` and each source video is deleted the moment
> its tensor is written, taking the project from 54 GB to a few hundred MB.
> **This is irreversible** — only use it on classes you're certain about.

---

## 6. See the results

Training writes everything into `ml/logs/`:

| File | What it is |
|---|---|
| `comparison.json` | the metrics — **this is the file the website reads** |
| `comparison.md` | a table you can paste into a report |
| `bilstm_history.json`, `cnn_history.json` | per-epoch training curves |
| `confusion_bilstm.png`, `confusion_cnn.png` | confusion matrices |

Now **reload <http://localhost:3000/research>**. The em-dashes become real
numbers automatically — no rebuild, no redeploy, no editing. The backend reads
`comparison.json` off disk on every request.

The checkpoints are also copied into `backend/models/`, so restart the backend
(`Ctrl+C`, then `python server.py` again) and the Live page will make **real
predictions** instead of mock ones.

### What the metrics mean

| Metric | Meaning |
|---|---|
| **Test accuracy** | % correct on data the model never saw during training |
| **Macro F1** | average per-class F1 — treats a rare sign as importantly as a common one |
| **Top-3 accuracy** | % where the correct answer was in the model's top 3 guesses |
| **Latency** | milliseconds for one prediction — decides if it's usable in real time |
| **Parameters** | model size; accuracy *per parameter* is the fair comparison |

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'mediapipe'` | `pip install -r ml/requirements-training.txt`. Requires Python ≤ 3.11. |
| `Couldn't build proto file into descriptor pool` | Corrupted mediapipe install. `pip install --force-reinstall --no-deps mediapipe==0.10.14` |
| Frontend: `Unknown keyword formatMinimum` or `ajv` errors | Known CRA 5 issue. `rm -rf frontend/node_modules && cd frontend && yarn install` |
| `/research` says "Backend unreachable" | Terminal 1 isn't running. Start `python server.py`. |
| Live page shows no skeleton | Check the browser allowed camera access, and that Terminal 1 is running. |
| Backend says `MOCK MODE` | Normal before training. Do step 5. |
| Port already in use | Backend: edit the port in `server.py`. Frontend: `set PORT=3001 && yarn start` |

---

## 8. Documentation

| File | Read it for |
|---|---|
| `RUN.md` | condensed command reference |
| `DEMO.md` | presentation runbook — run order, rehearsal, likely questions |
| `ml/README.md` | how the pipeline works, model design, comparison methodology |
| `ml/ROADMAP.md` | target vocabulary, path to continuous ISL, English→ISL design |
| `memory/PRD.md` | original product requirements |
| `Silent_Voice_Case_Study_v3_Review2.pptx` | the case study presentation |

---

## 9. Honest status

**Working and real:**

- Frontend builds clean and runs (9 pages)
- Backend serves live MediaPipe landmark extraction and inference
- Live page does genuine webcam → skeleton → prediction
- Research page reads real metrics, and shows nothing when there are none
- Full ML pipeline: preprocess → train → evaluate → report
- 160 landmark tensors extracted and verified

**Not done yet:**

- No trained checkpoints committed — you run training (step 5)
- Reverse, Practice and Transcripts pages use placeholder data
- Only 20 of 262 available sign classes have been preprocessed

**A principle worth keeping:** no accuracy figure appears anywhere in this
project — website or slide deck — unless it came from a real evaluation run.
Where numbers don't exist yet, the UI shows em-dashes and says so.
