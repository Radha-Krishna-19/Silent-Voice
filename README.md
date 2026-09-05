# Silent Voice

**Bidirectional Indian Sign Language ↔ English translator that runs in a browser.**

A deaf signer signs at a webcam and gets English captions. A hearing person
types or speaks English and watches it signed back. Both directions work today;
both have real limits, and this README states them plainly.

---

## Contents

1. [What actually works](#1-what-actually-works)
2. [The core idea: landmarks, not pixels](#2-the-core-idea-landmarks-not-pixels)
3. [Results](#3-results)
4. [How reverse translation works](#4-how-reverse-translation-works)
5. [Real-world limitations](#5-real-world-limitations)
6. [Setup and running](#6-setup-and-running)
7. [Training from scratch](#7-training-from-scratch)
8. [Repository layout](#8-repository-layout)
9. [API reference](#9-api-reference)
10. [Troubleshooting](#10-troubleshooting)
11. [Bugs found and fixed](#11-bugs-found-and-fixed)
12. [Tests](#12-tests)

---

## 1. What actually works

| Page | Status | What it does |
|---|---|---|
| `/` | **Real** | Sign in, create an account, or continue as a guest. A 3-D hand types along with you and performs real signs while idle. |
| `/home` | **Real** | The hand performs signs replayed from the trained landmark data; measured metrics are pulled from the backend, not hardcoded. |
| `/live` | **Real** | Webcam → MediaPipe → BiLSTM/CNN → predicted sign. Model switchable per request. |
| `/research` | **Real** | Measured BiLSTM vs CNN comparison, read live from `ml/logs/comparison.json`. |
| `/reverse` | **Real** | English → ISL gloss → replays actual recorded signer skeletons. Switch between the 2-D signer and the 3-D hand. |
| `/practice` | **Real** | Records your attempt, scores it against the reference recording — hand shape, placement and movement measured separately. |
| `/transcripts` | **Real** | Sessions from Live. Server-side when signed in; not stored at all as a guest. |
| `/rubric` | **Real** | The Review 2 rubric, scored against evidence the project can actually point at. |
| `/settings` | **Real** | Preferences persist in this browser, signed in or not. |
| `/about` | **Real** | How it works, and an honest threat model. |

Nothing is silently fake. Every limitation is stated on the screen it affects.

**Press `Ctrl+K` anywhere** for the command palette: jump between pages, or search
all 261 trained signs and watch one play.

### Accounts vs guest — the difference is real

| | Signed in | Guest |
|---|---|---|
| Transcripts | Rows in `backend/data/silentvoice.db`, owned by your user id | Held in the page; gone when the tab closes |
| Practice history | Stored, with best-per-word | Held in the page |
| Survives clearing the browser | Yes | N/A — nothing was stored |
| Written to localStorage | Only the session token | Only the "I chose guest" flag |

Passwords are hashed with **scrypt** (n=2^14, per-user 16-byte salt) and compared
with `hmac.compare_digest`. Session tokens are 32 random bytes, stored **hashed**,
so read access to the database does not let you impersonate a live session. Failed
logins are rate limited per username, and an unknown username takes the same time
to reject as a wrong password, so the endpoint cannot be used to enumerate users.

**The honest caveat:** the server speaks plain HTTP on localhost. There is no TLS,
so the password is visible in transit on a hostile network. This is an academic
demo to run on your own machine — do not expose it to the internet as-is, and do
not reuse a password you care about.

---

## 2. The core idea: landmarks, not pixels

The models never see video. Each clip becomes a small array of skeleton
coordinates:

```
one video clip  →  a (60, 225) array
                    │    └── 225 features per frame
                    │        21 left-hand points  × (x,y,z) = 63
                    │        21 right-hand points × (x,y,z) = 63
                    │        33 body pose points  × (x,y,z) = 99
                    └── 60 time steps
```

~54 KB per clip instead of ~12 MB of video. Skin tone, clothing, lighting and
background all vanish, so the model cannot cheat on backgrounds — and the same
property makes the data privacy-preserving: **raw video is never stored or
transmitted after preprocessing.**

MediaPipe runs **server-side in Python**, not in the browser. That is deliberate:
landmark extraction then uses byte-for-byte the same code as training
(`ml/scripts/preprocess.py`), eliminating train/serve skew. A JavaScript
reimplementation would be a second thing to keep in sync and a second thing to
get subtly wrong.

---

## 3. Results

Trained on the **full INCLUDE corpus**: 261 classes, 4,276 clips, stratified
70/15/15 split at seed 42, evaluated on 642 held-out clips.

| Metric | BiLSTM | **1D CNN** |
|---|---|---|
| Test accuracy | 91.74% | **94.55%** |
| Top-5 accuracy | 97.66% | **98.44%** |
| Macro F1 | 0.9140 | **0.9433** |
| Weighted F1 | 0.9126 | **0.9422** |
| Latency (mean / p95) | 4.12 / 6.90 ms | **0.74 / 1.05 ms** |
| Parameters | 2,665,477 | **736,773** |
| Training time (CPU) | 1,953 s | **287 s** |

**The CNN wins on every axis** — more accurate *and* 3.6× smaller *and* 5.6×
faster. There is no accuracy-for-speed trade-off to argue about.

The interpretation: isolated ISL signs are separable from short local motion
primitives, so explicit long-range temporal modelling does not pay for itself
here. That may change for continuous signing, where context spans many signs.

**Baseline check.** Logistic regression on time-pooled features of the same
tensors reaches 82% across all 261 classes. Both deep models clear it
comfortably, so they are earning their complexity rather than riding separable
features.

Regenerate everything with `cd ml && python scripts/evaluate.py`.

---

## 4. How reverse translation works

English → ISL is usually the hard half, and the usual answers are expensive:
a 3D avatar needs rigging and motion capture; a video clip library needs a
studio and a signer for every word.

**This project needed neither, because the training data already contains the
answer.** Every `(60, 225)` tensor is a recording of a real person performing
one sign. Put those coordinates back into image space and you can replay them.

### Reconstructing image-space coordinates

`preprocess.py` stores hands wrist-relative and shoulder-scaled, and pose in raw
normalised image coordinates. Inverting that (MediaPipe Pose indices):

```
shoulder_width = |pose[11].xy − pose[12].xy|
left_hand_abs  = pose[15].xy + left_hand_rel.xy  × shoulder_width
right_hand_abs = pose[16].xy + right_hand_rel.xy × shoulder_width
```

### The pipeline

```
English text
   ↓  backend/gloss.py     drop articles/copula, SOV reorder, time-first,
   ↓                       question-word-last, synonym + morphology mapping
ISL gloss  [TODAY, HELLO, HOW_ARE_YOU]
   ↓  backend/models/sign_bank.json     261 words × 20 frames of real skeleton
   ↓
frontend/src/components/SignPlayer.jsx  canvas playback at 12 fps
```

Example: `"Where is the doctor?"` → `DOCTOR WHERE` — copula and article dropped,
question word moved to the end, which is correct ISL ordering.

### Choosing what to play

For each word, `ml/scripts/build_sign_bank.py`:

1. **Gates on hand coverage** — prefers takes where MediaPipe actually saw the
   hands (all 261 chosen takes are ≥77%, mean 92%). A take that is typical of
   the class but has hands missing half the time makes a useless animation.
2. **Picks the medoid** of the qualifying takes — the recording closest to the
   class average. Unlike averaging several takes, this is a real performance
   rather than a blur of several.
3. **Detects the loop period.** Clips shorter than 60 sampled frames were
   *loop-padded* during preprocessing, so most tensors contain the sign
   performed roughly twice. Playing all 60 frames shows it twice with a dead
   stretch between.
4. **Trims to the active window** using wrist speed and elevation from the pose
   landmarks — cutting the rest periods at the start and end.

The result is one clean performance per word, and forward and reverse
translation share a single source of truth: what you see signed back is exactly
what the recogniser believes that sign to be.

### Why not a 3D avatar?

Considered and rejected. A rigged 3D hand model needs joint rotations, but
MediaPipe gives 3D *positions* — converting requires inverse kinematics per
finger, and errors there produce anatomically wrong hands, which for a sign
language is not a cosmetic problem but a mistranslation. Skeleton playback is
honest: it shows exactly the data that exists, with no interpolation inventing
detail the source never had.

---

## 5. Real-world limitations

Stated plainly, because a system that oversells itself is worse than one that
doesn't.

### Vocabulary

**261 isolated words.** No sentences, no fingerspelling. INCLUDE is a
word-level corpus, so signs for `WATER`, `NEED`, `HELP` may simply not exist —
the app reports unknown words instead of guessing. Fingerspelling would require
ISL manual-alphabet recordings the dataset does not contain, and ISL uses a
**two-handed** alphabet, so ASL fingerspelling assets cannot be substituted.

### Grammar

`gloss.py` is a **rule engine, not a translation model**. It encodes documented
structural differences (no articles/copula, SOV, time-first, question-final) but
does not handle non-manual markers (facial expression, head tilt, mouthing),
classifiers, spatial agreement, or directional verbs — all of which carry real
grammatical meaning in ISL. Output is understandable but stilted, like a
phrasebook.

### Recognition

- **Isolated signs only.** The model classifies one sign per 60-frame window.
  Continuous signing needs segmentation — knowing where one sign ends — which
  is a substantially harder problem and is not implemented.
- **94.55% on a curated test set is not 94.55% in a clinic.** INCLUDE was filmed
  with plain backgrounds, even lighting and cooperative signers. Real webcams
  bring motion blur, backlight, partial occlusion and clipped framing.
- **Signer variance is untested.** The split is stratified by *class*, not by
  *signer*, so the same person can appear in train and test. A signer-disjoint
  split would be a harder and more honest evaluation, and accuracy would drop.
- **Class imbalance:** 8 to 27 clips per class. Rare classes have ~1 test sample,
  so their individual F1 scores are very noisy — this is why macro F1 is
  reported alongside accuracy.

### Playback quality

Source clips were filmed wide: the signer occupies ~18% of frame width. The
player auto-fits and scales stroke weights to compensate, but hand detail is
limited by what MediaPipe recovered from a small figure — roughly 8% of frames
have no hand detected at all and are skipped rather than faked.

### Deployment

Runs on `localhost` only. No authentication, no HTTPS, no rate limiting, no
persistence. `/practice` and `/transcripts` are UI shells. This is a working
prototype, not a product.

---

## 6. Setup and running

### Prerequisites

| Need | Version |
|---|---|
| Python | 3.10, 3.11 or 3.12 |
| Node.js | 18+ |
| Webcam | for `/live` only |

> **Python 3.13 does not work.** `mediapipe` ships compiled extensions and 0.10.14 —
> the last release containing the `Holistic` model — has no `cp313` wheel.

### One command

```powershell
.\run.ps1
```

Or double-click **`run.bat`** if PowerShell's execution policy gets in the way.

That single command checks Python and Node, creates the `nndl` virtualenv and
installs packages if they are missing, rebuilds any derived artefact that is
absent (sign bank, practice references, UI vocabulary), starts both servers,
waits for the frontend to compile and opens the browser. Safe to run every
time — it skips whatever is already done.

```powershell
.\run.ps1 -Check    # verify the environment, start nothing
.\run.ps1 -Stop     # stop whatever is running on :3000 and :8000
```

It invokes `nndl\Scripts\python.exe` by full path, so **you never need to
activate the virtualenv**.

### Manually

The venv **must** be active — the prompt must show `(nndl)`. Without it you get
`ModuleNotFoundError: No module named 'cv2'`, which looks like a missing package
but is only the wrong Python.

```powershell
.\nndl\Scripts\Activate.ps1
cd backend; python server.py            # → http://localhost:8000
```

```powershell
cd frontend; npm start                  # → http://localhost:3000   (Node; no venv needed)
```

### In VS Code

`File → Open Folder` → this folder. `.vscode/settings.json` pins the interpreter
to `nndl`, so terminals activate automatically. **Ctrl+Shift+B** starts both servers.

### Confirming it works

Backend startup should print:

```
  models loaded : ['bilstm', 'cnn']
  classes       : 261
```

`MOCK MODE` instead means `backend/models/` has no checkpoints — the app still
runs, with placeholder predictions.

---

## 7. Training from scratch

The dataset (`archive (3)`, the full INCLUDE corpus, 54 GB) is **not** in this
repo. Get it from [Zenodo](https://zenodo.org/record/4010759) and place it
beside `ml/`.

```powershell
cd ml
python -u run_pipeline.py --videos "../archive (3)" --classes all --max-per-class 0 `
    --min-per-class 6 --sample-frames 32 --workers 4 --epochs 60 --batch 32 `
    --lr 3e-3 --no-augment
```

| Flag | Why it matters |
|---|---|
| `--min-per-class 6` | **Required.** Two classes have 4 clips; a stratified 70/15/15 split cannot give them a member in every fold and sklearn raises — *after* an hour of extraction. |
| `--no-augment` | **Required for these results.** See below. |
| `--lr 3e-3` | Default 1e-3 converges much more slowly here. |

Runtime on CPU: ~90 min extraction, ~33 min BiLSTM, ~5 min CNN.

> ### The augmentation finding
>
> With augmentation on (jitter + 10% frame drop + ±4 temporal shift + 50%
> mirror), the BiLSTM sat at **0.94% validation accuracy after 16 epochs** —
> chance is 0.38%. With `--no-augment` it reached **58.97% in 5 epochs**.
>
> With ~11 clips per class, augmentation destroyed more signal than it added.
> Regularisation tuned for large datasets can actively prevent learning on small
> ones. Both models use the identical setting, so the comparison stays fair.

Already have tensors? Skip extraction: `python run_pipeline.py --skip-preprocess ...`

After training, rebuild the reverse-translation bank:

```powershell
python scripts/build_sign_bank.py
```

### Adding your own recordings

`_train.py` reads from **both** `data/processed/include` and
`data/processed/custom` and merges them automatically. Organise clips one folder
per sign (folder name = label), then:

```powershell
python -u scripts/preprocess.py --videos data/custom_videos --out data/processed/custom --sample-frames 32 --workers 4
```

Aim for ≥6 clips per sign from more than one signer. Multi-sign phrases are the
biggest gap in INCLUDE, so recording those adds the most value.

---

## 8. Repository layout

```
silent_voice/
├── setup.ps1 / start.ps1     one-time setup · start both servers
├── frontend/                 React app (CRA + craco + Tailwind)
│   └── src/
│       ├── pages/            9 routes
│       ├── components/       SignPlayer (reverse playback), LandmarkOverlay, …
│       ├── hooks/            useLiveCapture (webcam), useComparison (metrics)
│       └── lib/api.js        every function maps to a real endpoint
├── backend/
│   ├── server.py             FastAPI: frame, status, comparison, text-to-sign
│   ├── inference.py          loads bilstm/cnn/transformer checkpoints
│   ├── gloss.py              English → ISL gloss rules
│   ├── models/               .pt checkpoints + sign_bank.json  (gitignored)
│   └── static/               plain-JS fallback UI, no build step
├── ml/
│   ├── run_pipeline.py       preprocess → train → evaluate → report
│   └── scripts/
│       ├── preprocess.py     video → (60,225) landmark tensors
│       ├── models.py         BiLSTM, 1D CNN, Transformer
│       ├── _train.py         shared training loop (identical for all archs)
│       ├── evaluate.py       test metrics + confusion matrices
│       └── build_sign_bank.py   tensors → playable animations
├── CLASSES.md                the 261 words, with clip counts
└── memory/PRD.md             original product requirements
```

Derived artefacts (tensors, checkpoints, `sign_bank.json`, logs) are gitignored —
they are regenerable and would bloat the repo. **Back up `ml/data/processed/`
(~234 MB) separately**; it represents ~90 minutes of extraction and is the one
thing that cannot be trivially recreated without the 54 GB source.

---

## 9. API reference

Base URL `http://localhost:8000`.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/frame` | One webcam frame → landmarks + prediction. Body: `{image, record, mode, model}` |
| `POST` | `/api/reset` | Clear the server-side landmark buffer |
| `GET` | `/api/status` | Loaded models, class count, vocabulary |
| `GET` | `/api/comparison` | Measured metrics from `ml/logs/comparison.json` |
| `POST` | `/api/text-to-sign` | English → gloss **+ animation frames** |
| `POST` | `/api/text-to-gloss` | English → gloss only (no frames) |
| `GET` | `/api/vocabulary` | The 261 signable words |
| `POST` | `/api/practice/score` | Score a recorded attempt against the reference |
| `GET` | `/api/practice/words` | Words that have a reference recording |
| `POST` | `/api/auth/register` | Create an account. Body: `{username, password, displayName}` |
| `POST` | `/api/auth/login` | Exchange credentials for a bearer token |
| `POST` | `/api/auth/logout` | Revoke the current token |
| `GET` | `/api/auth/me` | Current user plus transcript/practice counts |
| `GET` `POST` | `/api/me/transcripts` | List or save your sessions (auth required) |
| `DELETE` | `/api/me/transcripts/{id}` | Delete one of your sessions |
| `GET` `POST` | `/api/me/practice` | Practice history and best-per-word (auth required) |

Everything under `/api/me/` and `/api/auth/me` requires `Authorization: Bearer <token>`
and is scoped to your user id — one account cannot read or delete another's rows,
which `backend/test_auth.py` asserts directly.

`/api/comparison` reads from disk on **every** request, so retraining updates the
website with no rebuild and no restart.

---

## 10. Troubleshooting

| Problem | Cause and fix |
|---|---|
| `ModuleNotFoundError: cv2` / `torch` / `fastapi` | Virtualenv not active. Check the prompt shows `(nndl)`, or use `.\start.ps1`. |
| `No module named 'mediapipe'` | Needs Python ≤ 3.12. Check `python --version`. |
| `Couldn't build proto file into descriptor pool` | Corrupt mediapipe install: `pip install --force-reinstall --no-deps mediapipe==0.10.14` |
| Backend says `MOCK MODE` | No checkpoints in `backend/models/`. Train, or copy from `ml/models/`. |
| `/research` says "Backend unreachable" | Backend isn't running. |
| `/reverse` shows nothing | `backend/models/sign_bank.json` missing → `cd ml && python scripts/build_sign_bank.py` |
| Frontend `ajv` / `formatMinimum` errors | Known CRA 5 hoisting issue. `rm -rf frontend/node_modules` and reinstall. |
| `yarn: not recognized` | Use `npm install --legacy-peer-deps` and `npm start`. |
| Training stuck at ~0.4% accuracy | Augmentation is on. Add `--no-augment`. |

---

## 11. Bugs found and fixed

Recorded because each one was invisible until the pipeline was run end to end,
and each would silently mislead.

1. **`preprocess.py` wrote zero usable tensors while reporting success.** It
   saved to `<name>.npy.tmp`, but `numpy.save()` appends `.npy` unless the name
   already ends in it — so the file landed as `<name>.npy.tmp.npy` and every
   atomic rename raised `FileNotFoundError`, caught per-clip and summarised as
   success.
2. **Training and evaluation could never run.** Both built
   `LandmarkDataset([])` with empty roots intending to inject paths afterwards,
   but the constructor raises on an empty glob first. `verify_setup.py` passed
   real directories, so the pre-flight check never exercised the broken path.
3. **`evaluate.py` crashed on 261 classes.** Figure size scaled linearly with
   class count, requesting a ~15000×14000 px canvas.
4. **Checkpoints were stranded on failure.** `run_pipeline.py` staged weights to
   `backend/models/` as its *last* step, so a crash in reporting discarded a
   successful 37-minute training run.
5. **The CNN was never served.** `inference.py` iterated a hardcoded
   `("bilstm", "transformer")`, so `cnn.pt` was ignored — the best model could
   not be loaded, and `predict()` defaulted to an architecture this project
   never trains.
6. **`/research` showed invented metrics.** "87% / 91%" was displayed as
   "current val-set results" before any training had run, comparing the wrong
   pair of models.
7. **The Research page then couldn't read the real ones.** The hook looked for
   `val_acc` and `latency_ms`; `evaluate.py` writes `test_acc` and
   `latency_ms_mean`.
8. **Six frontend API functions called endpoints that did not exist.** Removed.

---

*Course: 23CSE461 — Neural Networks and Deep Learning · Dataset: INCLUDE (IIT Bombay, ACM MM 2020)*

---

## 12. Tests

Three suites, all runnable without a GPU, a camera or the internet.

```powershell
# Accounts: hashing, tokens, per-user isolation, rate limiting, expiry
cd backend
..\nndl\Scripts\python.exe test_auth.py          # 38 assertions

# 3-D hand kinematics: bone-length invariance, curl trajectory,
# finger ordering, replay of real landmark frames
cd ..\frontend
node scripts/handmodel.test.mjs                   # 51 assertions

# Every route, in jsdom, with the backend deliberately DOWN.
# Fails on any console error or a page that renders nothing.
npm run build
node scripts/routecheck.mjs                       # 10 routes
```

`routecheck.mjs` is the one worth understanding. A successful webpack build only
proves the code parses and resolves; it says nothing about a hook called
conditionally, a null dereference in an effect, or a route that renders an empty
shell. Running the real bundle in jsdom with `fetch` stubbed to fail catches all
three, and doubles as a check that every page degrades honestly when the server is
not running rather than white-screening.

It also asserts the route guard works: a deep link to `/transcripts` with no
identity must land on the gate. A guard that silently lets you through is worse
than no guard.
