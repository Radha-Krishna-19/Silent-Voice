# Data Card — INCLUDE landmark tensors used by Silent Voice

Structure follows the data-card practice recommended in the CDAO *Test and
Evaluation of AI Models* framework (pp. 61-62). Figures are computed by
`ml/scripts/tne/bias.py` (`ml/logs/tne/bias.json`) unless stated otherwise.

## Source
INCLUDE: a word-level Indian Sign Language video dataset (Sridhar et al., ACM
Multimedia 2020). Raw videos and derived tensors are **not** committed to this
repository (size and licence); check the dataset's official page for its licence
before redistributing.

## Composition
| Item | Value |
|---|---|
| Classes (words) | 261 |
| Clips used | 4,276 |
| Clips per class | 8 to 27 (mean 16.4, median 15) |
| Classes judged two-handed / one-handed* | 227 / 34 |
| Frames with left-hand landmarks / right-hand landmarks | 78.9% / 69.4% |
| Signer identity, age, gender | not recorded in the processed files |

*A class counts as two-handed when both hands are detected in at least half of its frames.

## Collection and processing
1. MediaPipe Holistic (model complexity 1) extracts 21 landmarks per hand and 33
   pose landmarks per frame: 225 features (`ml/scripts/preprocess.py`).
2. Each clip is resampled to 60 frames. Hands are stored wrist-relative and
   shoulder-scaled; pose stays in normalised image coordinates.
3. Features are standardised with the mean/std of the **training split only**
   (verified by white-box test WB-09b: no validation/test leakage).

## Splits
Stratified 70/15/15 at seed 42 (`ml/scripts/_train.py`): 2,993 train, 641
validation, 642 test clips. Every class appears in the test split, and the
largest difference between a class's share of train and test is 0.16 percentage
points.

## Known gaps
* No signer identity, so per-signer or demographic fairness cannot be measured
  and there is no signer-independent split.
* Classes are small (8-27 clips), so each class has about 1 to 4 test clips and
  per-class F1 is noisy.
* Recorded in controlled conditions; real webcams, lighting and backgrounds were
  not part of the data.

## Curation in the application
The Contribute page lets users record extra clips for a word. Clips are stored
with a manifest for human review and are never used for training automatically.
