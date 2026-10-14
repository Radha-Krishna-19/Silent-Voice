# Model comparison — 261 ISL classes, 642 held-out test clips

| Model | Test acc | Top-5 acc | Macro F1 | Params | Latency (ms) | Train time |
|---|---|---|---|---|---|---|
| BiLSTM | 91.7% | 97.7% | 0.914 | 2,665,477 | 4.12 | 32.5 min |
| 1D-CNN (baseline) | 94.5% | 98.4% | 0.943 | 736,773 | 0.74 | 4.8 min |

## Weakest classes (macro F1, worst 10)

**BiLSTM**: `extra` 0.00, `soldier` 0.00, `thursday` 0.00, `ugly` 0.00, `bicycle` 0.40, `bathroom` 0.50, `he` 0.50, `kitchen` 0.50, `pencil` 0.50, `skirt` 0.50

**1D-CNN (baseline)**: `extra` 0.00, `dress` 0.40, `bathroom` 0.50, `doctor` 0.50, `gift` 0.50, `kitchen` 0.50, `pencil` 0.50, `soldier` 0.50, `bedroom` 0.67, `card` 0.67
