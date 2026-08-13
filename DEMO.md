# Demo runbook

Read this top to bottom the night before. The only step with unavoidable
wall-clock cost is training (~45–70 min), so start it first and do everything
else while it runs.

---

## Tonight

### 1. Start training (do this first, then walk away)

```bash
cd ml
pip install -r requirements-training.txt
python scripts/verify_setup.py --videos "../archive (3)"
```

`verify_setup.py` takes ~30 seconds and checks dependencies, all three model
architectures, the augmentation maths, label parsing, and one real MediaPipe
extraction. **If it fails, fix that before starting the long run** — it exists
precisely so you don't discover a broken dependency 50 minutes in.

Then:

```bash
python run_pipeline.py --videos "../archive (3)"
```

This does landmarks → BiLSTM → CNN → evaluation → report, and copies the
checkpoints into `backend/models/` for you. It is resumable: if it dies, rerun
the identical command and it skips finished work.

**Expected output when it finishes:**

```
ml/logs/report.html          <- the thing you show faculty
ml/logs/comparison.md
ml/logs/confusion_*.png
ml/models/bilstm.pt, cnn.pt, label_map.json, preproc_stats.json
backend/models/  (same files, copied)
```

### 2. Install the demo server deps

```bash
cd backend
pip install -r requirements.txt
```

### 3. Rehearse — this is not optional

```bash
cd ml
python demo_webcam.py
```

Hold SPACE, sign, release. **Find 3–4 words that work reliably on your webcam
and your signing**, and write them down. Do not discover this live.

Expect live accuracy to be clearly below the test-set number. The model trained
on studio 1080p footage of other signers; you are a different signer on a laptop
webcam in different lighting. That gap is real, it is worth naming out loud, and
naming it first makes you look rigorous rather than caught out.

Tips that materially help:
- plain wall behind you, light on your face not behind you
- both hands and your upper torso fully in frame
- sign a little slower than natural
- check the "hands detected" indicator before you start

If the webcam is hopeless in the room's lighting, you have a fallback that needs
no camera at all:

```bash
python demo_webcam.py --clip "../archive (3)/Greetings_1of2/Greetings/1. hello/MVI_XXXX.MOV"
```

It plays a held-out clip on loop with the live skeleton overlay and prediction.
**Pick one held-out clip tonight and keep the exact path in a text file.**

---

## Tomorrow — run order

Model rigour first, live demo second. That order is deliberate: you establish the
numbers while nothing can fail, then the live demo is a bonus rather than the
thing everything rests on.

Start the server once, at the beginning, and do the whole demo in one browser:

```bash
cd backend && python server.py     # then open http://localhost:8000
```

Pages: **Home · Live · Results · Reverse · Practice · Transcripts · Settings · About**.
`Live` and `Results` are real. The rest are design previews and are labelled as such
on each page — say that out loud once and it becomes a strength, not a gap.

### Part 1 — results (4–5 min, zero risk)

Go to **Results**. It reads `ml/logs/comparison.json` off disk, so it always shows
your latest training run. Walk through:

1. **Setup** — 20 ISL words, N held-out clips, chance is 5%.
2. **The data representation.** You do not train on video. MediaPipe Holistic
   extracts 21+21 hand and 33 pose landmarks per frame → 225 numbers/frame → a
   fixed 60×225 tensor per clip. 54 KB instead of 12 MB, no GPU needed, and —
   the important one — background, lighting, clothing and skin tone are gone, so
   the model cannot cheat on the room it was filmed in.
3. **The comparison table.** BiLSTM vs 1D-CNN. Say explicitly that both went
   through the same split, same seed, same normalisation, same augmentation,
   same optimiser — architecture is the only variable.
4. **The temporal-groups table.** This is your best slide. `today` / `tomorrow` /
   `yesterday` share a handshape and differ mainly in movement direction and
   order. The CNN's receptive field spans ~29 of 60 frames, so it structurally
   cannot relate the start of a sign to its end. Whatever the gap turns out to
   be, that number is the answer to "why a BiLSTM?"
5. **Confusion matrices** — point at one real confusion and explain it.
6. **Limitations slide.** Do not skip it. See the script below.

### Part 2 — live demo (3–4 min)

Go to **Live**, click *Enable camera*. Skeleton overlay, hold-to-sign, top-3
predictions with confidence chips, correction chips, running transcript.

If the browser or camera misbehaves, drop to the zero-dependency version in a
terminal — same model, no web stack:

```bash
cd ml && python demo_webcam.py
```

Demo sequence that works:
1. Show the skeleton tracking your hands **before** predicting anything — this
   makes the pipeline legible: "this is all the model ever sees."
2. Sign one of your rehearsed words. Point at the confidence and the top-3.
3. Switch model BiLSTM → CNN on the same sign. If they disagree, that is the
   whole project in one moment. Have this ready.
4. Toggle Continuous mode and explain why it is worse: the model was trained on
   windows containing one complete sign, and a sliding window mostly contains
   half a sign plus hand-travel. Showing this deliberately, and explaining it, is
   stronger than hiding it.

---

## If something breaks

| Symptom | Fix |
|---|---|
| `AttributeError: module 'mediapipe' has no attribute 'solutions'` | `pip install mediapipe==0.10.14` — v1.0 deleted Holistic |
| Server says **mock mode** | `backend/models/` is missing the `.pt` / `label_map.json` / `preproc_stats.json`. Copy from `ml/models/`. |
| Browser camera blocked | Use `http://localhost:8000`, not the LAN IP — browsers only trust localhost without HTTPS |
| Prediction is always the same word | `preproc_stats.json` missing or mismatched. Recopy it from `ml/models/`. |
| Web UI stutters | Normal — it is throttled to ~12 fps by design. Fall back to `demo_webcam.py`. |
| Results page says "no training output yet" | It reads `ml/logs/comparison.json`. Training didn't finish, or you started the server from the wrong folder — run it from `backend/`. |
| Everything is on fire | `ml/logs/report.html` is a standalone static file with the same numbers. Open it directly. |

**Have `ml/logs/report.html` open in a second browser tab before you start.** It
needs no server at all, so it is your parachute if the server dies mid-demo.

---

## Answers to the questions you will get

**"Why not just train on the video directly?"**
Landmarks are ~200× smaller, train on CPU, and — the real reason — they remove
background and appearance entirely. INCLUDE was shot in a handful of rooms, so a
pixel model can learn "beige wall ⇒ Greetings" and score well on a random split
while being useless on a webcam. Landmarks make that shortcut impossible.

**"Why BiLSTM and not just a CNN?"**
Point at the temporal-groups table. Also: the BiLSTM encoder is what transfers to
continuous sign recognition later, because BiLSTM+CTC is the standard backbone
there. The CNN is a dead end for that.

**"Bidirectional? Doesn't that break real-time?"**
For isolated signs, no — you classify a completed 2-second gesture, so the whole
clip is already in the buffer. It would matter for streaming continuous
recognition, which is the next phase and would need a causal or chunked variant.

**"How accurate is it really?"**
Give the test number, then immediately volunteer that train and test clips come
from the same recording sessions, so a signer-disjoint split would be lower and
more honest. Naming your own weakest point first is worth more than the number.

**"Can it translate full sentences?"**
No. It classifies isolated signs. Continuous ISL needs segmentation (sliding
window, then CTC), facial landmarks for grammar — eyebrow raise marks a question,
head shake marks negation — and sentence-level annotated data, which barely
exists for ISL. That data gap, not the model, is the real bottleneck.
See `ml/ROADMAP.md`.

**"Who would use this?"**
Government hospitals and PHCs (small, high-stakes vocabulary; India has roughly
300 certified ISL interpreters for a Deaf population in the millions), Deaf
schools, and government service counters. Be clear it is an assistive and triage
tool, not a replacement for a human interpreter — medical and legal settings need
a human in the loop.

**"What's the divide with your teammate?"**
BiLSTM and the CNN baseline are yours. The Transformer is theirs. All three run
through one shared training function so the comparison is controlled.

---

## Do not claim

- ...that it translates sentences. It classifies isolated words.
- ...that live accuracy matches the table. Different signer, different camera.
- ...that the UI is production-ready. It is a local demo server.
- ...that it replaces an interpreter.

Every one of these is something a faculty member will probe. Volunteering them
first reads as rigour; being caught on one reads as overclaiming.
