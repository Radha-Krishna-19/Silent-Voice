# Silent Voice — what to run

Everything is code-complete. The only step left is training, which needs PyTorch
on your machine (my sandbox has no GPU and can't reach the PyTorch download host).

Three terminals, in this order. Steps 1 and 2 work **right now** without any
training — the backend falls back to a mock predictor so the whole app is usable.

---

## 0. One-time setup

```bash
cd C:\Users\pradh\OneDrive\Desktop\silent_voice

# frontend deps
cd frontend
yarn install                 # or: npm install --legacy-peer-deps
cd ..

# backend deps
cd backend
pip install -r requirements.txt
cd ..

# training deps
cd ml
pip install -r requirements-training.txt
cd ..
```

If `torch` is slow or fails, install it explicitly first:
`pip install torch --index-url https://download.pytorch.org/whl/cpu`

---

## 1. Backend  — terminal 1

```bash
cd backend
python server.py
```

Serves on **http://localhost:8000**. On boot it prints which checkpoints loaded.
With no checkpoints it prints `MOCK MODE` and still runs — that is expected until
step 3 finishes.

Verify: <http://localhost:8000/api/status>

## 2. Frontend — terminal 2

```bash
cd frontend
yarn start
```

Opens **http://localhost:3000**. `frontend/.env` already points at port 8000.

Try `/live` → click the camera button → allow the webcam. Frames are POSTed to
`/api/frame` at 12 fps and the cyan skeleton you see is **real MediaPipe output**,
not the decorative animation. `/research` will show `NOT TRAINED` until step 3.

## 3. Training — terminal 3

The dataset is already preprocessed. **160 tensors, 20 classes, 0 failures** are
sitting in `ml/data/processed/include/`, so skip straight to training:

```bash
cd ml
python run_pipeline.py --skip-preprocess --epochs 60 --batch 16   # 20-class quick run
```

This trains BiLSTM, then CNN, then runs `evaluate.py` and `make_report.py`.
Expect roughly 10–30 min per model on a laptop CPU for 20 classes.

### If you want more classes than ISL-20

The full archive has **262 classes / 4,284 videos**. To train on more, re-run
preprocessing with a bigger cap and no whitelist:

```bash
cd ml
python scripts/preprocess.py \
    --videos "../archive (3)" \
    --out data/processed/include \
    --max-per-class 8 \
    --sample-frames 32 \
    --workers 4
```

Add `--delete-after` to delete each source video once its tensor is written —
that is what takes the project from 54 GB down to a few hundred MB. It is
irreversible, so only use it on classes you're sure about.

Then: `python run_pipeline.py --skip-preprocess`

---

## 4. See the results

Training writes to `ml/logs/`:

| File | Consumed by |
|---|---|
| `comparison.json` | `GET /api/comparison` → the `/research` page |
| `bilstm_history.json`, `cnn_history.json` | training-curve charts |
| `confusion_bilstm.png`, `confusion_cnn.png` | confusion matrices |
| `comparison.md` | paste-ready table for the report |

Just **reload `/research`** — the em-dashes become real numbers. No rebuild, no
redeploy, nothing to edit. The backend reads the JSON off disk on every request.

Then tell me the numbers and I'll fill in slide 14.2 of the deck.

---

## What I changed this session

**Fixed a real bug in `ml/scripts/preprocess.py`.** The worker saved to
`<name>.npy.tmp` then renamed it into place, but `numpy.save()` appends `.npy`
unless the filename already ends in it — so the temp file was written as
`<name>.npy.tmp.npy` and *every* rename raised `FileNotFoundError`. The pipeline
reported success while writing zero usable tensors. Now saves through an open
file handle. All 160 tensors were produced after this fix.

**`/live` is wired to real inference.** New `useLiveCapture` hook: `getUserMedia`
→ canvas → JPEG → `POST /api/frame` at 12 fps, with in-flight frame dropping so
captions can't lag behind the signer. Real landmarks render through
`LandmarkOverlay`. There's a BiLSTM/CNN toggle that switches architecture per
request. Also fixed the two-clock bug — `Session` and `Elapsed` now derive from
one timestamp.

**`/research` reads live metrics** from `/api/comparison`, compares **BiLSTM vs
1D CNN** (was BiLSTM vs Transformer), and shows `NOT TRAINED` + em-dashes rather
than inventing numbers.

**Deck: 16 → 30 slides**, same template. Corrected five factual errors in the
Review-1 slides, including fabricated accuracy figures, `258` features (it's
`225`), and a claim that the split is by signer (it's stratified by class).

**Frontend builds clean** — verified, 200 kB gzipped.

---

## Known gaps

- `/reverse`, `/practice`, `/transcripts` still use mock data and aren't labelled
  as such. `/live` now carries a `DEMO DATA` badge before the camera starts.
- No trained checkpoints yet — that's step 3.
- `frontend/plugins/health-check/` is missing from the Emergent export, but
  `.env` has `ENABLE_HEALTH_CHECK=false` so `craco.config.js` never loads it.
