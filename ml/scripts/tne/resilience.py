"""T&E: resilience — recovery after a disruption in a live stream.

Simulates the live app's sliding-window recognition: a stream is a sign clip
(60 frames), then a blackout of B all-zero frames (camera or tracking lost),
then the same sign again. A 60-frame window slides over the stream one frame at
a time. Recovery time is the number of frames after the blackout ends until the
window prediction is correct and stays correct. Measured on 200 test clips that
the model gets right on the clean clip. At the app's 12 fps capture rate,
12 frames = 1 second.
"""
from __future__ import annotations

import numpy as np

from common import ARCHS, data, load_model, norm, predict, save

BLACKOUTS = (15, 30)


def main():
    d = data()
    X, y = d["test"]
    r = np.random.RandomState(0)
    res = {}
    for a in ARCHS:
        m = load_model(a)
        ok = predict(m, norm(X)).argmax(1) == y
        pool = np.where(ok)[0]
        pick = r.choice(pool, min(200, len(pool)), replace=False)
        res[a] = {}
        for B in BLACKOUTS:
            rec, during = [], []
            for i in pick:
                s = np.concatenate([X[i], np.zeros((B, 225), np.float32), X[i]])
                wins = np.stack([s[t - 59:t + 1] for t in range(59, len(s))])
                pr = predict(m, norm(wins)).argmax(1) == y[i]
                end = 60 + B
                ends = np.arange(59, len(s))
                after = pr[ends >= end]
                ia = len(after)
                for k in range(len(after)):
                    if after[k:].all():
                        ia = k
                        break
                rec.append(ia)
                during.append(float(pr[(ends >= 60) & (ends < end)].mean()))
            rec = np.array(rec)
            res[a][f"blackout_{B}"] = {"median_recovery_frames": float(np.median(rec)), "p90_recovery_frames": float(np.percentile(rec, 90)),
                                       "median_recovery_seconds_at_12fps": float(np.median(rec) / 12),
                                       "recovered_within_stream": float((rec < 60).mean()),
                                       "correct_during_blackout": float(np.mean(during)), "n_streams": int(len(rec))}
            print(a, B, res[a][f"blackout_{B}"])
    save("resilience", res)
    return res


if __name__ == "__main__":
    main()
