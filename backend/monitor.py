"""Production monitoring for live recognition (the "maintain" step of the T&E framework).

The server records every live prediction here. GET /api/monitor reports, over
the most recent window of predictions: how many frames were processed, how
often a hand was visible, the mean top-1 confidence, and the share of
predictions below the confidence floor. When enough predictions have been seen
and mean confidence falls more than DROP below the reference measured on
held-out validation clips (ml/logs/tne/drift.json), it raises a drift alarm,
which is the output-based signal ml/scripts/tne/drift.py validated on
simulated drift (dropped frames, camera shift, left-handed signers).

Nothing here stores video, landmarks or anything that identifies a user: only
counts and confidence values, in memory.
"""
from __future__ import annotations

import json
import threading
from collections import deque
from pathlib import Path

WINDOW = 500
MIN_PREDICTIONS = 100
DROP = 0.10
FLOOR = 0.5
_REF_FILE = Path(__file__).resolve().parent.parent / "ml" / "logs" / "tne" / "drift.json"


def _load_reference() -> dict:
    try:
        r = json.load(open(_REF_FILE))["results"]
        return {a: float(r[a]["reference_confidence"]) for a in r if "reference_confidence" in r[a]}
    except Exception:
        return {}


class LiveMonitor:
    def __init__(self, window: int = WINDOW, reference: dict | None = None):
        self._lock = threading.Lock()
        self.frames = 0
        self.hands = deque(maxlen=window)
        self.conf = {}
        self.reference = _load_reference() if reference is None else reference
        self.window = window

    def record_frame(self, hands_visible: bool) -> None:
        with self._lock:
            self.frames += 1
            self.hands.append(bool(hands_visible))

    def record_prediction(self, prediction: dict | None) -> None:
        if not prediction or prediction.get("mock"):
            return
        model = prediction.get("model", "unknown")
        with self._lock:
            self.conf.setdefault(model, deque(maxlen=self.window)).append(float(prediction.get("confidence", 0.0)))

    def report(self) -> dict:
        with self._lock:
            out = {"frames_processed": self.frames,
                   "hand_visible_rate": (sum(self.hands) / len(self.hands)) if self.hands else None,
                   "models": {}, "drift_alarm": False,
                   "window": self.window, "min_predictions": MIN_PREDICTIONS, "confidence_drop_threshold": DROP}
            for m, c in self.conf.items():
                mean = sum(c) / len(c)
                ref = self.reference.get(m)
                alarm = bool(ref is not None and len(c) >= MIN_PREDICTIONS and (ref - mean) > DROP)
                out["models"][m] = {"predictions": len(c), "mean_confidence": mean,
                                    "below_floor_rate": sum(x < FLOOR for x in c) / len(c),
                                    "reference_confidence": ref, "drift_alarm": alarm}
                out["drift_alarm"] |= alarm
            return out


monitor = LiveMonitor()
