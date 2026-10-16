Silent Voice: MediaPipe Holistic landmark tensors for 261 Indian Sign Language words (derived from INCLUDE)

Files
  include_landmarks.zip  4,276 .npy tensors, shape (60, 225), float32
  label_map.json         261 class names; list index = class id
  preproc_stats.json     per-feature mean/std from the training split (raw-pose tensors)
  splits.json            train 2993 / val 641 / test 642 file names (seed 42, stratified by class; NOT signer-disjoint)

Channel layout: columns 0-62 left hand (21 x xyz, wrist-relative), 63-125 right hand,
126-224 body pose (33 x xyz, image coordinates). Undetected frames are zeros.

Usage
  import numpy as np
  x = np.load("hello__0001.npy")   # (60, 225); z-score with preproc_stats.json before a model

Results on the test split: 1D CNN 94.55%, BiLSTM 91.74% (raw pose). A CNN trained after moving
the pose to a canonical position (code: canonicalize_pose in preprocess.py) reached 95.95%.

Source and license
  Derived from INCLUDE (Sridhar et al., ACM Multimedia 2020, doi:10.1145/3394171.3413528,
  https://zenodo.org/record/4010759), CC BY-NC-SA 4.0. This derived dataset is released under
  CC BY-NC-SA 4.0, non-commercial. No videos are included.
