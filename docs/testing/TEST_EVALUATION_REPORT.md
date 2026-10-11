# Test and Evaluation Report — Silent Voice

Structured after the CDAO *Test and Evaluation of AI Models* framework (April 2024): performance, testing methods, data, models, context and documentation. **Every number below is read automatically from the result files in `ml/logs/`** by `ml/scripts/tne/make_report.py`; each section names the script that produced it and the evidence file.

## How to reproduce

```
cd ml
python scripts/tne/run_all.py              # performance suite (~20 min on a laptop CPU)
python scripts/tne/crossval.py --folds 3 --epochs 20   # retrains; slow
python tests/test_models_whitebox.py
python tests/test_models_blackbox.py
python scripts/tne/gan_train.py 1500       # trains the conditional GAN (25 min)
python scripts/tne/gan_eval.py             # GAN fidelity + augmentation retraining
python scripts/tne/make_report.py          # rebuilds this report
cd ../backend && python test_auth.py && python test_nlg.py && python test_gloss.py && python test_contrib.py && python test_monitor.py
cd ../frontend && npm run verify
```

Each run of `run_all.py` also writes a timestamped log, `ml/logs/tne/run_<date>_<time>.log`, recording the Python/PyTorch versions and every printed result.

## 1. Test strategy at a glance

| Suite | Level | Box | Execution | Metric type | Script | Evidence | Result |
|---|---|---|---|---|---|---|---|
| Gloss rules | Unit | Black | Automated (CI) | Quantitative | backend/test_gloss.py | ml/logs/tne/tests/backend_test_gloss.log | 17 passed, 0 failed |
| Sentence formation | Unit | Black | Automated (CI) | Quantitative | backend/test_nlg.py | ml/logs/tne/tests/backend_test_nlg.log | 14 passed, 0 failed |
| Contribution storage | Unit | White | Automated (CI) | Quantitative | backend/test_contrib.py | ml/logs/tne/tests/backend_test_contrib.log | 12 passed, 0 failed |
| Production drift monitor | Unit | White | Automated (CI) | Quantitative | backend/test_monitor.py | ml/logs/tne/tests/backend_test_monitor.log | 10 passed, 0 failed |
| Accounts API | Integration | Black | Automated (CI) | Quantitative | backend/test_auth.py | ml/logs/tne/tests/backend_test_auth.log | 38 passed, 0 failed |
| Backend code coverage | Unit + integration | White | Automated | Quantitative | coverage.py over the 5 backend suites | ml/logs/tne/tests/backend_coverage.txt | 92% statement+branch |
| Model internals | Unit | White | Automated (CI) | Quantitative | ml/tests/test_models_whitebox.py | ml/logs/tne/tests/test_models_whitebox.log | 17 passed, 0 failed |
| Model behaviour and acceptance | Model | Black | Automated | Quantitative | ml/tests/test_models_blackbox.py | ml/logs/tne/tests/test_models_blackbox.log | 20 passed, 0 failed |
| Frontend routes/styles/build | UI | Black | Automated (CI) | Quantitative | frontend npm run verify | CI logs | 11 routes, 1,027 class names, 19 checks |
| End-to-end system (browser + backend + models) | System | Black | Automated | Quantitative + screenshots | tests/e2e/test_e2e_system.py | ml/logs/tne/e2e/ | 10 passed, 0 failed |
| Real user, real webcam | Acceptance | Black | Manual | Qualitative + quantitative | docs/testing/MANUAL_TEST_PLAN.md | docs/testing/evidence/manual/ | to be executed by the tester |

**Black-box** tests check inputs and outputs without looking inside (accuracy, edge-case inputs, metamorphic relations, API and browser tests). **White-box** tests use knowledge of the internals (parameter counts, gradient flow, dropout and BatchNorm behaviour, split and normalisation logic, saliency, code coverage). **Quantitative** metrics are numbers (accuracy, F1, calibration error, latency, memory); **qualitative** evaluation looks at what the errors are (confused pairs, near misses, saliency over time) and at the manual usability observations.

## 2. Framework coverage matrix

| Framework area | Item | Covered by | Section |
|---|---|---|---|
| Performance | Correctness | evaluate.py, black-box tests | 3.1 |
| Performance | Interpretability | explainability.py | 3.4 |
| Performance | Bias | bias.py | 3.7 |
| Performance | Robustness | robustness.py, adversarial.py | 3.2, 3.5 |
| Performance | Resilience | resilience.py | 3.9 |
| Performance | Uncertainty | calibration.py | 3.3 |
| Performance | Drift | drift.py (simulated drift); backend/monitor.py + GET /api/monitor (live) | 3.8 |
| Performance | Representativeness | bias.py | 3.7 |
| Performance | Latency | evaluate.py, black-box BB-09 | 3.1, 3.11 |
| Testing methods | Comparison (A/B, back-to-back) | BiLSTM vs CNN vs logistic regression | 3.1, 3.11 |
| Testing methods | Adversarial testing | adversarial.py (FGSM, PGD) | 3.5 |
| Testing methods | Metamorphic testing | metamorphic.py | 3.6 |
| Testing methods | Experience-based testing | Manual test plan | MANUAL_TEST_PLAN.md |
| Testing methods | Test design: cross-validation | crossval.py | 3.10 |
| Testing methods | Continuous vs discrete, automatic vs manual, black vs white box, live vs model | CI + scripts + manual plan + E2E | 1 |
| Data | Select, clean, engineer, split, curate, verify | DATA_CARD.md; WB-08/09 tests | DATA_CARD.md |
| Models | Select, train, evaluate, deploy, maintain | MODEL_CARD.md; live monitor /api/monitor | MODEL_CARD.md, 3.8, 3.11 |
| Data | Synthetic data (GAN augmentation) | gan_train.py, gan_eval.py | 3.12 |
| Context | Use case and environment | MODEL_CARD.md intended use | 3.11 |
| Documentation | Data card, model card | DATA_CARD.md, MODEL_CARD.md | - |

## 3. Results

### 3.1 Correctness and latency (quantitative) — `ml/scripts/evaluate.py`, `ml/logs/comparison.json`

| Metric | BiLSTM | 1D CNN |
|---|---|---|
| Top-1 accuracy | 91.74% | 94.55% |
| Top-5 accuracy | 97.66% | 98.44% |
| Macro F1 | 0.9140 | 0.9433 |
| Weighted F1 | 0.9126 | 0.9422 |
| Mean / p95 latency per clip | 4.12 / 6.90 ms | 0.74 / 1.05 ms |

Baseline: logistic regression on time-pooled features, 82% accuracy.

### 3.2 Robustness — `robustness.py`, `robustness.json`, `robustness_noise.png`, `robustness_drop.png`

| Condition | BiLSTM | 1D CNN |
|---|---|---|
| Gaussian noise 0 x std | 91.74% | 94.55% |
| Gaussian noise 0.05 x std | 91.69% | 94.65% |
| Gaussian noise 0.1 x std | 91.69% | 94.70% |
| Gaussian noise 0.2 x std | 91.80% | 94.70% |
| Gaussian noise 0.5 x std | 91.95% | 94.60% |
| Gaussian noise 1.0 x std | 91.95% | 93.67% |
| Gaussian noise 2.0 x std | 87.85% | 79.65% |
| 10% frames dropped | 90.71% | 56.13% |
| 20% frames dropped | 86.03% | 18.07% |
| 30% frames dropped | 78.30% | 6.23% |
| 50% frames dropped | 45.28% | 2.39% |

### 3.3 Uncertainty and calibration — `calibration.py`, `calibration.json`, `calibration_reliability.png`

| Metric | BiLSTM | 1D CNN |
|---|---|---|
| Expected calibration error (15 bins) | 0.0337 | 0.0345 |
| ECE after temperature scaling (fitted on validation) | 0.0270 (T = 0.846) | 0.0239 (T = 0.820) |
| Negative log-likelihood / Brier score | 0.411 / 0.1293 | 0.325 / 0.0957 |
| Mean confidence when right / when wrong | 0.915 / 0.595 | 0.925 / 0.698 |
| Answers given at the app's 0.5 confidence floor (coverage, accuracy) | 93.6%, 94.51% | 97.2%, 95.67% |
| Accuracy on the 80% most confident clips | 97.47% | 97.67% |

### 3.4 Interpretability (white-box) — `explainability.py`, `explainability.json`, `xai_*.png`

| Occluded features | BiLSTM accuracy | 1D CNN accuracy |
|---|---|---|
| None | 91.74% | 94.55% |
| Left-hand block | 74.92% | 79.28% |
| Right-hand block | 39.56% | 36.60% |
| Pose | 23.83% | 16.36% |

| Share of gradient x input saliency | BiLSTM | 1D CNN |
|---|---|---|
| Left-hand block | 22.8% | 20.4% |
| Right-hand block | 33.9% | 36.8% |
| Pose | 43.3% | 42.7% |

Removing any single 10-frame window leaves accuracy between 86.1% and 91.4% (BiLSTM) and 93.0% and 93.9% (CNN).

### 3.5 Adversarial testing (white-box attacks) — `adversarial.py`, `adversarial.json`, `adversarial.png`

| Budget epsilon (x feature std) | BiLSTM FGSM | BiLSTM PGD-10 | CNN FGSM | CNN PGD-10 |
|---|---|---|---|---|
| 0.0 | 91.7% | 91.7% | 94.5% | 94.5% |
| 0.01 | 90.7% | 89.9% | 93.6% | 93.6% |
| 0.02 | 87.5% | 86.8% | 91.1% | 90.5% |
| 0.05 | 81.9% | 74.0% | 76.9% | 72.7% |
| 0.1 | 71.8% | 43.8% | 45.0% | 23.2% |
| 0.2 | 53.7% | 9.7% | 6.1% | 0.6% |

### 3.6 Metamorphic testing (black-box) — `metamorphic.py`, `metamorphic.json`, `metamorphic.png`

A violation is a prediction that changes under a transformation that should not change the sign.

| Relation | BiLSTM violations | 1D CNN violations |
|---|---|---|
| MR1 noise 0.1std | 0.3% | 0.5% |
| MR2 time shift pm2 | 0.9% | 0.5% |
| MR3 speed pm10pct | 2.0% | 1.1% |
| MR4 camera shift 5pct | 51.6% | 20.6% |
| MR5 mirror left handed | 77.6% | 78.3% |

### 3.7 Bias and representativeness — `bias.py`, `bias.json`, `bias_groups.png`

Clips per class range from 8 to 27; every class is in the test split; the largest train-vs-test difference in a class's share is 0.16 percentage points. Signer identity is not available, so per-signer fairness is not measurable.

| Group | Test clips | BiLSTM | 1D CNN |
|---|---|---|---|
| Classes with few clips (<= 14) | 223 | 91.48% | 93.27% |
| Medium | 249 | 91.57% | 95.18% |
| Many clips (> 20) | 170 | 92.35% | 95.29% |
| One-handed signs | 81 | 86.42% | 91.36% |
| Two-handed signs | 561 | 92.51% | 95.01% |

### 3.8 Drift monitoring — `drift.py`, `drift.json`

A drift monitor (feature KS tests + confidence drop) tested on held-out clips with simulated drift (300 clips per scenario). Its output-based part runs in production: the server records every live prediction in `backend/monitor.py` and `GET /api/monitor` reports frames processed, hand visibility, mean confidence and a drift alarm (unit-tested in `backend/test_monitor.py`, exercised end to end by E2E-10).

| Scenario | Feature drift score | Confidence drop (BiLSTM / CNN) | Alarm | Accuracy (BiLSTM / CNN) |
|---|---|---|---|---|
| no drift heldout | 0.000 | 0.006 / -0.007 | no | 91.3% / 94.3% |
| sensor noise 0.5std | 0.000 | 0.009 / 0.007 | no | 92.0% / 94.7% |
| dropped frames 20pct | 0.721 | 0.138 / 0.691 | yes | 86.0% / 19.3% |
| camera shift 10pct | 0.151 | 0.559 / 0.487 | yes | 13.7% / 31.7% |
| left handed signers | 0.557 | 0.509 / 0.550 | yes | 22.0% / 21.3% |

### 3.9 Resilience — `resilience.py`, `resilience.json`

Sliding-window recognition over a stream: sign, blackout of B empty frames, sign again (200 streams per setting).

| Setting | BiLSTM median recovery | CNN median recovery | Correct during blackout (BiLSTM / CNN) |
|---|---|---|---|
| blackout 15 frames | 0 frames | 54 frames (4.5 s at 12 fps) | 97.5% / 37.1% |
| blackout 30 frames | 26 frames | 54 frames (4.5 s at 12 fps) | 90.1% / 21.1% |

### 3.10 Cross-validation (test design) — `crossval.py`, `crossval.json`, `crossval.png`

Stratified 3-fold cross-validation over all 4,276 clips, retraining each model per fold with the project recipe at a reduced budget of 20 epochs (the headline models use 60), so fold scores estimate the variance across splits rather than the final accuracy.

| Model | Fold 1 | Fold 2 | Fold 3 | Mean +/- SD |
|---|---|---|---|---|
| BiLSTM | 87.45% | 90.32% | 91.02% | 89.59 +/- 1.89% |
| 1D CNN | 86.47% | 84.98% | 84.42% | 85.29 +/- 1.06% |

### 3.11 End-to-end system tests

End-to-end browser tests (`tests/e2e/test_e2e_system.py`, `ml/logs/tne/e2e/`):

| ID | Check | Result | Detail |
|---|---|---|---|
| E2E-01 | backend /api/status reports both models loaded | PASS | models=['bilstm', 'cnn'], labels=261 |
| E2E-02 | gate: 'Continue as guest' opens the home page | PASS |  |
| E2E-03 | live: webcam frames stream over the WebSocket and the server answers | PASS | sent 71, received 70, server_ms 84.9 |
| E2E-04 | live: no caption is invented for an empty scene (fake camera shows no person) | PASS | hands_visible=False |
| E2E-10 | monitor: /api/monitor counts the streamed frames (production monitoring is live) | PASS | frames_processed 77, hand_visible_rate 0.0 |
| E2E-05 | reverse: 'where is the doctor tomorrow' is glossed TOMORROW DOCTOR WHERE | PASS |  |
| E2E-06 | research: page shows the measured accuracy from comparison.json | PASS |  |
| E2E-07 | practice: page loads the list of practisable words from the backend | PASS |  |
| E2E-08 | contribute: page renders with the review queue | PASS |  |
| E2E-09 | no uncaught JavaScript errors on any page | PASS |  |

### 3.12 GAN data augmentation — `gan_train.py`, `gan_eval.py`, `gan.json`, `gan_augmentation.png`

A class-conditional GAN trained on the training clips generated 2871 synthetic clips (11 per class). Fidelity: the real-data models recognise a synthetic clip as its intended class 19.9% (BiLSTM) and 16.9% (CNN) of the time (chance is 0.4%); synthetic clips change 2.2x more from frame to frame than real ones.

| 1D CNN trained on | Training clips | Best validation | Test accuracy | Macro F1 |
|---|---|---|---|---|
| Real clips (control) | 2993 | 95.16% | 94.08% | 0.9343 |
| Real + GAN clips | 5864 | 93.60% | 93.30% | 0.9336 |

Change in test accuracy from adding GAN clips: -0.78 percentage points.

## 4. Qualitative evaluation — `qualitative.py`, `qualitative.json`, `qualitative_saliency_examples.png`

* **BiLSTM:** 53 errors, of which 38 are near misses (true word in the top 5) and 15 far misses. Most confused pairs: bicycle -> fish (2), he -> she (2), skirt -> pant (2), boat -> bicycle (1), bathroom -> pencil (1).
* **1D CNN:** 35 errors, of which 25 are near misses (true word in the top 5) and 10 far misses. Most confused pairs: dress -> clothing (2), card -> gift (1), bathroom -> pencil (1), blue -> orange (1), wife -> husband (1).
* **Model agreement:** both wrong on 27 clips, only the BiLSTM wrong on 26, only the CNN wrong on 8; picking whichever model is right would reach 95.79%, so the models make partly different mistakes.
* Classes both models miss at least once: bathroom, bedroom, big_large, blue, extra, gift, hat, hot, kitchen, lawyer, market, page, pencil, priest, sister, soap, soldier, telephone, thursday, today, tool, truck, university, wife.
* Example predictions with top-3 confidences are listed under `sample_predictions` in `qualitative.json`.
* Manual usability observations are recorded in `MANUAL_TEST_PLAN.md` when the manual session is run.

## 5. Findings and recommended actions

1. **Position sensitivity (metamorphic MR4):** a 5% sideways shift of the signer changes many predictions because pose is in raw image coordinates. Recommended fix: centre and scale pose on the shoulders, then retrain.
2. **Left-handed signers (MR5):** mirrored clips change most predictions. Recommended fix: mirror augmentation during training.
3. **Missing frames:** the CNN degrades sharply with dropped frames and recovers slowly after a blackout; the BiLSTM is the more resilient live model. Recommended: use the BiLSTM for unreliable cameras or train the CNN with frame dropping.
4. **Calibration:** both models are well calibrated (ECE about 0.03); temperature scaling improves it slightly. The app's 0.5 confidence floor raises the accuracy of the captions it does show.
5. **Drift:** the monitor raises no alarm on clean data or mild noise and does alarm on dropped frames, camera shift and left-handed signers, which are the conditions that cut accuracy.

## 6. Limitations of this evaluation

* One dataset (INCLUDE) and no signer identity: no signer-independent or demographic fairness test.
* No production traffic: drift and resilience are tested on simulated conditions.
* No human red team: adversarial robustness is tested with algorithmic attacks only.
* End-to-end tests use a synthetic camera, so they prove integration, not live accuracy; live accuracy with real signers is the manual test plan's job.
* Cross-validation uses a reduced epoch budget.
