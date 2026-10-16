# Model comparison — 261 ISL classes, 642 held-out test clips

| Model | Test acc | Top-5 acc | Macro F1 | Params | Latency (ms) | Train time |
|---|---|---|---|---|---|---|
| BiLSTM | 91.3% | 98.1% | 0.908 | 2,665,477 | 3.36 | 32.5 min |
| 1D-CNN (baseline) | 95.2% | 98.4% | 0.951 | 736,773 | 0.35 | 4.8 min |
| Transformer | 95.3% | 97.8% | 0.951 | 460,677 | 0.61 | 4.5 min |

## Weakest classes (macro F1, worst 10)

**BiLSTM**: `extra` 0.00, `thursday` 0.00, `tomorrow` 0.00, `ugly` 0.00, `week` 0.00, `husband` 0.40, `bathroom` 0.50, `he` 0.50, `kitchen` 0.50, `pencil` 0.50

**1D-CNN (baseline)**: `extra` 0.00, `bathroom` 0.50, `doctor` 0.50, `kitchen` 0.50, `pencil` 0.50, `yellow` 0.50, `bedroom` 0.67, `dress` 0.67, `gift` 0.67, `hat` 0.67

**Transformer**: `extra` 0.00, `thursday` 0.00, `yellow` 0.33, `court` 0.40, `bathroom` 0.50, `gift` 0.50, `he` 0.50, `kitchen` 0.50, `pencil` 0.50, `bedroom` 0.67
