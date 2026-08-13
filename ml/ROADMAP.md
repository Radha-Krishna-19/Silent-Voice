# Silent Voice — what to test, who it's for, and where it goes next

Companion to `ml/README.md`. The README covers *how* the forward pipeline works;
this covers the questions that come up in a viva or a pitch.

---

## 1. Words you can actually test with

The archive on disk has **262 classes across 15 categories**. Not all are equally
useful to demo, and some are far more interesting than others for showing what the
BiLSTM buys you over the CNN.

### Tier 1 — the ISL-20 starter set (`scripts/classes_isl20.txt`)

These 20 are the exact intersection of *what's in the archive* and *what the
Silent Voice app vocabulary needs*, so every trained class is demo-usable:

| Group | Words |
|---|---|
| Greetings | `hello`, `good_morning`, `thank_you` |
| Pronouns | `i`, `you` |
| People | `family`, `father`, `mother`, `friend`, `student`, `teacher`, `doctor` |
| Medical | `hospital`, `medicine`, `sick` |
| Time | `time`, `today`, `tomorrow`, `yesterday` |
| Objects | `book` |

Twenty classes × ~16-24 takes = 320-480 clips. Chance accuracy is 5%, so any
result above ~60% is clearly real learning, and the confusion matrix stays
readable at 20×20.

### Tier 2 — the pairs that make the BiLSTM-vs-CNN argument

Put these in the report. They are the cases where *temporal order* is the only
signal, which is precisely what the CNN's fixed receptive field cannot capture:

- **`today` / `tomorrow` / `yesterday`** — near-identical handshape near the
  torso; the discriminating feature is which direction the hand travels and when.
  The single best triple in this dataset for the argument.
- **`mother` / `father`** — same motion, different location on the face. Tests
  whether pose landmarks are being used, not just hand shape.
- **`teacher` / `student`** — related signs, one often derived from the other.
- **`sick` / `hospital` / `medicine`** — semantically adjacent, visually distinct.
  A good control: if these confuse, the problem is capacity, not temporal modelling.
- **`i` / `you`** — both are pointing signs. Distinguished almost entirely by
  direction, which mirror augmentation could destroy if you're not careful — worth
  checking their per-class F1 with and without `--augment`.

### Tier 3 — full-vocabulary stress test

Once ISL-20 works, rerun with `--classes scripts/classes_locked.txt`
(~76 words, ~20 of which exist in the archive) or drop `--classes` entirely for
all 262. Accuracy will fall — that's expected and worth reporting. The
interesting number is **top-5 accuracy**, which `evaluate.py` already computes:
a live app can surface the top-3 as correction chips, so top-5 is closer to the
real user experience than top-1.

### Words to record yourself (`data/custom/`)

INCLUDE has no multi-word phrases. For a live demo, record 15-20 takes each of
a handful of phrases into `data/custom/<label>/take_01.mp4`:
`hello`, `thank_you`, `my_name_is`, `how_are_you`, `i_need_help`, `where_is_the_doctor`.
720p, front-lit, plain backdrop, hands fully in frame. These also let you demo on
*your own* signing rather than a stranger's, which reads much better live — and
they surface the domain gap between studio footage and a laptop webcam, which is
the single biggest thing standing between this project and a real product.

---

## 2. Potential clients

Ordered roughly by how short the path to a real pilot is.

### Near-term, highest fit

- **Government hospitals and primary health centres.** The medical vocabulary
  (`doctor`, `hospital`, `medicine`, `sick`, `pain`) is the highest-stakes,
  smallest-vocabulary use case there is. A Deaf patient at a district hospital
  today either brings a family member to interpret or goes without. India has
  roughly 300 certified ISL interpreters for a Deaf population in the millions,
  so demand vastly outstrips supply — that gap *is* the business case.
- **Schools for the Deaf and inclusive-education classrooms.** The classroom
  vocabulary pack maps directly onto this. Also the easiest place to get more
  training data ethically: students and teachers who benefit from the tool
  are also the people best placed to contribute signed clips.
- **Government service counters** — ration offices, transport, municipal desks,
  banks. Short, scripted, closed-vocabulary interactions. A kiosk that handles
  fifty phrases well beats a general translator that handles none reliably.

### Institutional / funding

- **NGOs and advocacy bodies** — the National Association of the Deaf (India),
  regional Deaf associations, disability-rights organisations. Usually the route
  to both users and credibility.
- **ISLRTC (Indian Sign Language Research and Training Centre)**, the government
  body that standardises ISL and publishes the ISL dictionary. The natural
  institutional partner for vocabulary correctness and data.
- **CSR and accessibility-compliance budgets.** The Rights of Persons with
  Disabilities Act, 2016 places accessibility obligations on public institutions.
  Compliance budgets are a real, funded procurement channel.

### Commercial

- **Enterprise accessibility teams** at large employers with Deaf staff — HR
  onboarding, safety briefings, all-hands captioning.
- **Customer-support and telehealth platforms** wanting a signed channel.
- **ISL learning apps** — Practice Mode is already the right shape for this, and
  a learner-facing product tolerates lower accuracy than an interpreter-facing one.

### Be honest about the ceiling

A 20-class, or even 262-class, isolated-sign classifier is **not** an interpreter
and should never be sold as one. Positioned honestly it is: a *triage and
assistive* tool for constrained, high-frequency exchanges, and a *practice
partner* for learners. Medical and legal settings need a human interpreter in the
loop — say this before someone else does. The demo should show confidence scores
and correction chips precisely because they communicate "this is a suggestion".

---

## 3. Extending to full ISL translation

The current system does **isolated sign → single word**. Real ISL is continuous,
spatially grammatical, and multi-channel. Four things have to change, in this order:

### Step 1 — segmentation (isolated → continuous)

Right now a clip is assumed to contain exactly one sign. In continuous signing
there are no gaps. You need to either detect boundaries or stop needing them:

- **Sliding window + smoothing** — the cheap version, already compatible with the
  current model. Run the classifier over a rolling 60-frame buffer every ~10
  frames, then collapse repeated predictions and drop low-confidence ones. Ships
  in a week; produces a rough gloss stream. This is the right next step.
- **CTC (Connectionist Temporal Classification)** — the proper version. Replace
  the mean-pool + softmax head with a per-frame output layer and CTC loss. The
  model learns alignment itself, so you never label boundaries. **The BiLSTM
  encoder transfers directly** — this is a strong argument for the BiLSTM over the
  CNN, because BiLSTM+CTC is the standard continuous-recognition backbone.

### Step 2 — the missing channels

Isolated word recognition can ignore the face. Sentence-level ISL cannot:

- **Non-manual markers** carry grammar. Raised eyebrows mark a yes/no question,
  furrowed brows mark a wh-question, head shake marks negation. Without them
  "you are going" and "are you going?" are the *same* manual sequence.
- **Spatial referencing.** Signers establish referents at points in signing space
  and then point back at them. Wrist-origin normalisation currently throws this
  away for the hands; pose is retained, but you'd want to add explicit
  hand-position-relative-to-torso features.
- **Fingerspelling** for names and out-of-vocabulary words — effectively a
  separate high-frame-rate character-level model that the main model hands off to.

Concretely: turn on `refine_face_landmarks`, add the ~20 landmarks around brows,
eyes and mouth, and keep absolute hand position alongside the normalised version.
Feature dim goes from 225 to roughly 300.

### Step 3 — gloss → fluent English

ISL gloss order is not English order. A signer produces roughly
`YESTERDAY I HOSPITAL GO` — no articles, no copula, no tense inflection, topic
first. Two options:

- **Rule-based reordering** for the demo — fast, debuggable, breaks on anything
  unusual. Fine for a fixed set of sentence templates.
- **A small seq2seq or an LLM pass** over the gloss stream. This is where a
  hosted model earns its keep: give it the gloss sequence plus the domain
  ("medical intake") and ask for natural English. Robust to the recogniser
  dropping or mangling a gloss, which the rule-based version is not.

### Step 4 — data, which is the actual bottleneck

262 isolated words is a vocabulary, not a language. Continuous ISL needs
sentence-level annotated video. ISL-CSLTR is the main public option (~700
sentences) and is small. Realistically this means partnering with ISLRTC or a
Deaf school to collect data, with the community involved in labelling and
consent. **This is the honest limiting factor** — not model architecture. Say so
in the report; it's a stronger answer than pretending a bigger network fixes it.

### Suggested phasing

| Phase | Capability | Main change |
|---|---|---|
| now | isolated word, 20 classes | — |
| +1 mo | isolated word, 262 classes, live webcam | full preprocessing run + MediaPipe in browser |
| +3 mo | short phrases via sliding window | rolling buffer + prediction smoothing |
| +6 mo | continuous gloss stream | BiLSTM + CTC head, face landmarks |
| +12 mo | fluent sentence translation | gloss→English model, new sentence-level data |

---

## 4. How English → ISL would work

*(Not part of the current build — noted here so the design is on record.)*

Reverse translation is a **different problem** from recognition, and, importantly,
much easier to ship at demo quality. It's a generation problem with a hard
constraint: the output must be *real* ISL, and a model that hallucinates a sign is
worse than useless. So the pipeline is retrieval-first, synthesis-later.

### Stage A — English → ISL gloss

Text normalisation, then reordering into ISL gloss grammar:

- Drop function words ISL doesn't use — articles, copula, most prepositions
- Reorder toward topic-comment / SOV: *"I went to the hospital yesterday"* →
  `YESTERDAY I HOSPITAL GO`
- Lemmatise — ISL doesn't inflect for tense; time is marked by a time sign
  at the front of the clause
- Mark non-manuals explicitly in the gloss, e.g. `YOU GOING [q]` for a question
- Route names and unknown words to a `[fingerspell: ...]` token

A rule-based pass covers a surprising amount here and is fully debuggable — the
right choice for a demo. An LLM with a few-shot prompt handles the long tail
better and is the right choice once you have gloss/English pairs to validate against.

### Stage B — gloss → visible signing

Three implementation levels, cheapest first:

1. **Clip library (recommended, and what the current UI is built for).** One
   recorded video per gloss, stitched into a sequence with cross-fades. Pros: it's
   *real* ISL produced by real signers, so it's correct by construction, and it's
   trivially auditable. Cons: no coarticulation between signs (real signers blend
   the end of one into the start of the next), and every new word needs a
   recording session. `SignClipPlayer` and the `sign_clips` collection already
   assume this model.
2. **Skeleton/avatar playback.** Store the *landmark sequences* rather than video,
   render them onto a 3D avatar. Same source data, but now you can interpolate
   between signs for smoother transitions, retarget to any avatar, and ship
   kilobytes instead of megabytes. Natural upgrade path, and it reuses the
   exact `(T, 225)` tensors the forward pipeline already produces —
   the preprocessing work is not wasted.
3. **Generative pose synthesis.** A text-to-pose model producing novel landmark
   sequences, rendered on the avatar. This is where research is heading, and it's
   the only path to open-vocabulary output. It is also the riskiest: a model that
   generates a plausible-looking but wrong sign will mislead someone with no way
   to detect the error. Not appropriate for a medical or legal deployment without
   a human check.

### The bit people forget

Many Deaf users are more comfortable in ISL than in written English — that's the
premise of the product. So the reverse direction is not a nice-to-have bolted onto
recognition; for a genuine two-way conversation it's half the system. But it is
also the half where "correct or nothing" matters most, which is exactly why the
clip library beats a generative model at this stage.
