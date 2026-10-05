# Testing and test design

Everything below is runnable; nothing is claimed that is not measured. Gaps are listed at the end.

## 1. Test levels

| Level | What is tested | Tool | Where |
|---|---|---|---|
| Unit | ISL gloss rules (order, drops, synonyms, inflection, phrases) | `test_gloss.py` (17 checks) | `backend/` |
| Unit | Gloss → English sentence (rule-based path) | `test_nlg.py` (14 checks) | `backend/` |
| Unit | Contribution storage (slug safety, shape, manifest, no overwrite) | `test_contrib.py` (12 checks) | `backend/` |
| Integration | Account system through the real FastAPI router (sign-up, login, rate limit, sessions) on a throwaway DB | `test_auth.py` (38 checks) | `backend/` |
| Frontend static / build | Every page route renders; every `className` resolves to a defined class; trail data valid; production build compiles | `npm run verify` → `routecheck.mjs` (11 routes), `classcheck.mjs` (1027 classNames, 94 files), `trailcheck.mjs` (19 checks), `react-scripts build` | `frontend/` |
| Model (system) | Held-out accuracy, top-5, macro-F1, latency, parameters for both models on 642 unseen test clips | `ml/scripts/evaluate.py` → `ml/logs/comparison.json` | `ml/` |
| Consistency | Same recording through the training path and the serving path gives the same prediction (no train/serve skew) | `ml/scripts/verify_setup.py` | `ml/` |
| Build / CI | All of the above on every push; Docker images build | `.github/workflows/ci.yml` | repo |

Run everything: `cd backend && python test_auth.py && python test_nlg.py && python test_gloss.py && python test_contrib.py`, then `cd frontend && npm run verify`.

## 2. Test design

- **Black-box, requirement-driven.** Each check asserts one claim the product makes (a grammar rule in `gloss.py`'s docstring, a sentence on the sign-in page, a route in the README).
- **Equivalence classes and boundaries.** Gloss: empty/None input, punctuation and case, 1-, 2- and 3-word phrases, known vs unknown words. Contribution: same label spelt differently, three saves in one second, path-traversal label.
- **Isolation.** No test touches real data: throwaway SQLite DB, temporary directories, an in-memory sign bank (the real `sign_bank.json` is git-ignored). Heavy dependencies (PyTorch, MediaPipe, OpenCV) are not needed, so CI is fast.
- **Honest model evaluation.** Metrics come from a held-out test split; both models are scored on the same 642 clips.

## 3. Requirement → test traceability

| Requirement | Test |
|---|---|
| Recognise 261 signs, compare BiLSTM vs 1D CNN | `evaluate.py` (BiLSTM 91.74 % top-1, CNN 94.55 %) |
| Live recognition identical to training pipeline | `verify_setup.py` skew check |
| English → ISL: drop articles/copula; time first; question last; remove inflection | `test_gloss.py` |
| Gloss → fluent English | `test_nlg.py` |
| Accounts / guest mode | `test_auth.py` |
| Contribute a sign without losing earlier clips | `test_contrib.py` |
| All pages reachable, styles resolve, app builds | `npm run verify` |

## 4. Results (last run)

| Suite | Result |
|---|---|
| test_auth.py | 38 / 38 pass |
| test_nlg.py | 14 / 14 pass |
| test_gloss.py | 17 / 17 pass |
| test_contrib.py | 12 / 12 pass |
| routecheck / classcheck / trailcheck | 11 / 11 routes; 0 problems in 1027 classNames over 94 files; 19 / 19 |
| Model, 642 held-out clips | BiLSTM 91.74 % (top-5 97.66 %, F1 0.9140, 4.12 ms); 1D CNN 94.55 % (top-5 98.44 %, F1 0.9433, 0.74 ms) |

## 5. Defects found by testing

1. `test_gloss.py`: "going"/"goes" were not reduced to GO (stems shorter than 3 letters were rejected). Fixed in `gloss.py`.
2. `test_contrib.py` design review: two clips saved in the same second got the same filename and the second overwrote the first. Fixed in `contrib.py`.
3. `npm run verify`: a missing `fetchContributions` export broke the production build. Fixed.

## 6. Known gaps (not hidden)

- No automated browser/UI test of the live webcam flow; this was checked by hand.
- The WebSocket endpoint and MediaPipe path are not unit-tested in CI (they need the heavy dependencies); the Docker build only proves they install and import.
- The train/serve consistency check uses the reference recordings, so it is a consistency check, not an accuracy measurement.
- Accuracy is measured on INCLUDE, recorded by a limited set of signers; real-world accuracy with new signers, lighting and cameras is untested.
- Irregular verbs ("went") are not lemmatised by the gloss rules.
