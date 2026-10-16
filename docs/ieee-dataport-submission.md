# IEEE DataPort submission — Silent Voice landmark dataset

Paste each block into the matching DataPort field (dataport.ieee.org → Upload Dataset). **Do not upload the raw INCLUDE videos** — they are IIT Bombay's (Zenodo, CC BY-NC-SA). Publish only your derived landmark tensors and cite INCLUDE.

> I cannot log in or submit for you. Items marked **[FILL]** are yours.

## Title
Silent Voice: MediaPipe Holistic Landmark Tensors for 261 Indian Sign Language Words (derived from INCLUDE)

## Dataset type / Category
Standard Dataset · Categories: Computer Vision, Machine Learning, Accessibility

## Abstract (≤ 500 words)
This dataset contains 4,276 pose and hand landmark sequences extracted from the INCLUDE Indian Sign Language corpus (Sridhar et al., ACM Multimedia 2020), covering 261 isolated word-level signs. Each clip was processed with MediaPipe Holistic and resampled to 60 frames, giving a float32 tensor of shape (60, 225): 21 left-hand, 21 right-hand and 33 body-pose landmarks, each with (x, y, z). Hand coordinates are wrist-origin and shoulder-width normalised; pose coordinates are kept in normalised image space. Files are named `<label>__<id>.npy`. Clips per class range from 8 to 27 (mean 16.4). The release also includes the fixed stratified 70/15/15 split (seed 42), train-split normalisation statistics, and the label map, so results are reproducible. The tensors were used to train and compare a BiLSTM and a 1D CNN sign classifier (CNN 94.55% vs BiLSTM 91.74% top-1 on 642 held-out clips), and to support an ablation study. Because only landmarks are shared, no faces or raw video are distributed, which lowers privacy risk and file size (≈231 MB vs 54 GB of video).

## Keywords
sign language recognition, Indian Sign Language, MediaPipe, pose estimation, landmarks, deep learning, BiLSTM, 1D CNN, accessibility

## Files to upload
| File | Description |
|---|---|
| `include_landmarks.zip` | 4,276 `.npy` tensors, shape (60,225), float32 (zip `ml/data/processed/include`) |
| `label_map.json` | 261 class names, index = class id |
| `preproc_stats.json` | per-feature mean/std from the training split |
| `splits.json` | train/val/test file lists, seed 42 (ready: submission_upload/DataPort_splits.json) |
| `README.txt` | this description + channel layout below |

Channel layout: columns 0–62 left hand (21×xyz), 63–125 right hand, 126–224 pose (33×xyz). Missing/undetected frames are zeros.

## Instructions / how to use
```python
import numpy as np
x = np.load("hello__0001.npy")      # (60, 225)
# z-score with preproc_stats.json (train mean/std) before feeding a model
```
Code: [FILL GitHub URL] (`ml/scripts/preprocess.py`, `_train.py`, `ablation.py`).

## License & source attribution
Landmarks are derived from INCLUDE (CC BY-NC-SA 4.0). State that this dataset is released under **CC BY-NC-SA 4.0**, non-commercial. Cite: Sridhar, A. et al., "INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition," ACM Multimedia 2020, doi:10.1145/3394171.3413528. Data: https://zenodo.org/record/4010759

## Funding / Ethics
No external funding **[confirm]**. No human subjects were recruited; no faces or video are distributed.

## Authors
Radha Krishna (CB.SC.U4CSE23134) **[FILL teammates, affiliation: Amrita Vishwa Vidyapeetham, ORCID]**

## Checklist before Submit
1. Zip and upload (free open-access needs no subscription; IEEE login required).
2. Choose Open Access, license CC BY-NC-SA.
3. Confirm with faculty that DataPort (not Zenodo) is required — rubric row 10.
4. Submit → copy the DOI DataPort assigns and put it in the paper/README.
