"""White-box tests for the production monitor (backend/monitor.py).

Run:  cd backend && python test_monitor.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from monitor import MIN_PREDICTIONS, LiveMonitor  # noqa: E402

PASSED = FAILED = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name}  {detail}")


m = LiveMonitor(reference={"cnn": 0.90})
r = m.report()
check("empty monitor reports no frames and no alarm", r["frames_processed"] == 0 and not r["drift_alarm"] and r["hand_visible_rate"] is None)

for i in range(10):
    m.record_frame(i % 2 == 0)
check("hand-visibility rate is the share of frames with a hand", abs(m.report()["hand_visible_rate"] - 0.5) < 1e-9)

m.record_prediction(None)
m.record_prediction({"label": "x", "confidence": 0.99, "model": "cnn", "mock": True})
check("missing and mock predictions are not counted", "cnn" not in m.report()["models"])

for _ in range(MIN_PREDICTIONS - 1):
    m.record_prediction({"confidence": 0.5, "model": "cnn"})
check("no alarm before the minimum number of predictions, even if confidence is low", not m.report()["drift_alarm"])

m.record_prediction({"confidence": 0.5, "model": "cnn"})
rep = m.report()
check("alarm once mean confidence is more than 0.10 below the reference", rep["drift_alarm"] and rep["models"]["cnn"]["drift_alarm"])
check("below-floor rate counts confidences under 0.5", rep["models"]["cnn"]["below_floor_rate"] == 0.0)

m2 = LiveMonitor(window=200, reference={"cnn": 0.90})
for _ in range(200):
    m2.record_prediction({"confidence": 0.85, "model": "cnn"})
check("no alarm for a small, normal drop in confidence (0.05)", not m2.report()["drift_alarm"])
for _ in range(200):
    m2.record_prediction({"confidence": 0.40, "model": "cnn"})
rep = m2.report()
check("window keeps only the most recent predictions", rep["models"]["cnn"]["predictions"] == 200 and abs(rep["models"]["cnn"]["mean_confidence"] - 0.40) < 1e-9)
check("below-floor rate rises when confidence collapses", rep["models"]["cnn"]["below_floor_rate"] == 1.0)

m3 = LiveMonitor(reference={})
for _ in range(150):
    m3.record_prediction({"confidence": 0.1, "model": "bilstm"})
check("no reference -> no alarm (never guesses)", not m3.report()["drift_alarm"])

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
