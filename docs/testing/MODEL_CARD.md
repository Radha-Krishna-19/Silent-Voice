# Model Card — Silent Voice ISL word recognisers

Format follows the model-card structure recommended in the CDAO *Test and
Evaluation of AI Models* framework (April 2024, p. 64). Every number below is
read from a file in `ml/logs/` produced by a script in `ml/scripts/`.

## Model details
| | BiLSTM | 1D CNN |
|---|---|---|
| Task | Isolated-word Indian Sign Language recognition (261 classes) | same |
| Input | 60 frames x 225 MediaPipe Holistic landmark features (21 x 3 per hand, 33 x 3 pose), standardised with training-split statistics | same |
| Architecture | 2-layer bidirectional LSTM (hidden 256), mean-pooled over time, MLP head | 3 temporal conv blocks (kernel 5), avg+max pooling, MLP head |
| Parameters | 2,665,477 | 736,773 |
| Training | AdamW lr 3e-3, weight decay 1e-4, cosine schedule, label smoothing 0.05, grad-clip 1.0, batch 32, 60 epochs, no augmentation, best validation epoch kept | same |
| Files | `backend/models/bilstm.pt` | `backend/models/cnn.pt` |
| Owner | P. M. Radha Krishna (CB.SC.U4CSE23134), Amrita Vishwa Vidyapeetham | |

## Intended use
Real-time captioning of single ISL words signed to a webcam, as a communication
aid and learning tool in the Silent Voice web app. **Not** intended for
continuous sentence-level signing, for medical, legal or emergency decisions, or
as a replacement for a human interpreter.

## Factors
Performance depends on the signer staying in a similar position in the frame,
signing right-handed as in the training data, the camera seeing both hands, and
frames not being dropped (see Robustness and Metamorphic results).

## Metrics (642-clip held-out test split, `ml/logs/comparison.json`)
| Metric | BiLSTM | 1D CNN |
|---|---|---|
| Top-1 accuracy | 91.74% | 94.55% |
| Top-5 accuracy | 97.66% | 98.44% |
| Macro F1 | 0.9140 | 0.9433 |
| Expected calibration error | 0.034 | 0.035 |
| Mean latency per clip (model only, CPU) | 4.12 ms | 0.74 ms |

## Evaluation data
Held-out 15% of INCLUDE (642 clips, every class present), never used for
training or model selection. See `DATA_CARD.md`.

## Quantitative analyses
Robustness, explainability, calibration, adversarial, metamorphic, bias, drift,
resilience and cross-validation results are in `TEST_EVALUATION_REPORT.md`.

## Ethical considerations
No raw video is stored; only landmark coordinates are processed. The dataset
records no signer identity, so fairness across signers or demographic groups
could not be measured. Left-handed signing is not supported (78% of predictions
change when a clip is mirrored), which disadvantages left-handed signers.

## Caveats and recommendations
* Shifting the signer 5% sideways changes 52% (BiLSTM) / 21% (CNN) of predictions,
  because pose coordinates are not body-centred. Normalising pose relative to
  the shoulders is the recommended fix.
* The CNN loses accuracy sharply when frames are missing (56% at 10% dropped
  frames); the BiLSTM is the safer choice on unreliable cameras.
* Not evaluated with deaf users or with signers outside INCLUDE.
