"""Cut a live camera stream into signs, using hand visibility as the boundary.

Why this exists. The models were trained on clips that are tightly cropped to the
sign: hands are present from the first frame to the last (88% of frames; first
hand frame is 0, last is 59 in the median clip). The live app used to classify a
rolling 5-second buffer on every frame, so a 2.5-second sign sat inside a window
that was half empty. Measured on the held-out clips (simulated 12 fps buffer),
that costs accuracy: 61% on the raw buffer vs 86% when the buffer is cropped to
the signing segment first. It also produced a flickering guess on every frame.

This segmenter does what the training data assumes:

  * a sign STARTS when hands are visible for `start_frames` frames in a row
  * it ENDS when hands are gone for `gap_frames` frames (a short detection
    dropout inside a sign does not end it)
  * the segment is cropped to the first..last hands-visible frame, and only
    then resampled to the model's window

Nothing here touches the model; it is plain Python and unit-tested
(test_segmenter.py). Limits, stated plainly: the signer has to lower their hands
(or pause out of frame) between words, and a segment longer than `max_frames`
is cut and classified so the app never waits forever.
"""
from __future__ import annotations

from collections import deque

import numpy as np


class SignSegmenter:
    def __init__(self, start_frames: int = 3, gap_frames: int = 6,
                 min_frames: int = 8, max_frames: int = 90, pre_roll: int = 2):
        self.start_frames = start_frames
        self.gap_frames = gap_frames
        self.min_frames = min_frames
        self.max_frames = max_frames
        self.pre_roll = pre_roll
        self.reset()

    def reset(self) -> None:
        self._recent: deque = deque(maxlen=self.pre_roll + self.start_frames)  # frames before a sign is confirmed
        self._seg: list = []          # frames of the sign in progress (incl. trailing gap)
        self._hands: list = []        # parallel list of hands-visible flags
        self._run = 0                 # consecutive hands-visible frames while idle
        self._gap = 0                 # consecutive hands-missing frames while in a sign
        self.active = False

    @property
    def length(self) -> int:
        return len(self._seg)

    def push(self, feats: np.ndarray, hands_visible: bool):
        """Feed one frame. Returns a (n, 225) segment when a sign has just ended, else None."""
        if not self.active:
            self._recent.append((feats, hands_visible))
            self._run = self._run + 1 if hands_visible else 0
            if self._run >= self.start_frames:
                self.active = True
                self._seg = [f for f, _ in self._recent]
                self._hands = [h for _, h in self._recent]
                self._gap = 0
            return None

        self._seg.append(feats)
        self._hands.append(hands_visible)
        self._gap = 0 if hands_visible else self._gap + 1

        if self._gap >= self.gap_frames or len(self._seg) >= self.max_frames:
            return self._finish()
        return None

    def _finish(self):
        flags = np.asarray(self._hands, dtype=bool)
        seg = np.stack(self._seg)
        self.reset()
        if not flags.any():
            return None
        first, last = np.flatnonzero(flags)[[0, -1]]
        seg = seg[first:last + 1]                      # crop to the signing itself
        return seg if len(seg) >= self.min_frames else None
