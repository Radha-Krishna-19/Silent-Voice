"""T&E: drift monitoring.

A deployable drift monitor plus a test of it on simulated drift. There is no
production traffic to observe, so drift is simulated by transforming held-out
clips the way real conditions could change.

DriftMonitor (feature-based + output-based):
  * feature drift: two-sample Kolmogorov-Smirnov test, per clip-averaged feature,
    between a reference sample (the held-out validation clips, which the model
    did not train on, so its confidence there is realistic) and an incoming
    batch of test clips; the score is the fraction of the 219 non-constant features with p < 0.01/219
    (Bonferroni);
  * output drift: mean top-1 confidence of the incoming batch vs the reference.
An alarm is raised when the feature score > 0.10 or confidence falls by > 0.10.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import ks_2samp

from common import ARCHS, _mirror, data, load_model, norm, predict, save


class DriftMonitor:
    def __init__(self, reference_clips, model, live_mask, feature_threshold=0.10, conf_drop=0.10):
        self.live = live_mask
        self.ref = reference_clips.mean(1)[:, live_mask]
        self.model = model
        self.ref_conf = float(predict(model, norm(reference_clips)).max(1).mean())
        self.ft, self.cd = feature_threshold, conf_drop

    def check(self, batch):
        feats = batch.mean(1)[:, self.live]
        alpha = 0.01 / feats.shape[1]
        drifted = sum(ks_2samp(self.ref[:, j], feats[:, j]).pvalue < alpha for j in range(feats.shape[1]))
        score = drifted / feats.shape[1]
        conf = float(predict(self.model, norm(batch)).max(1).mean())
        alarm = bool(score > self.ft or (self.ref_conf - conf) > self.cd)
        return {"feature_drift_score": float(score), "mean_confidence": conf, "confidence_drop": self.ref_conf - conf, "alarm": alarm}


def main():
    d = data()
    ref = d["val"][0]
    X, y = d["test"]
    r = np.random.RandomState(0)
    live, std = d["live"], d["std"]

    def noisy(B, s):
        B = B.copy()
        B[:, :, live] += (r.normal(0, 1, B[:, :, live].shape) * std[live] * s).astype(np.float32)
        return B

    def dropped(B, f):
        B = B.copy()
        B[r.random_sample(B.shape[:2]) < f] = 0
        return B

    def camshift(B, dx):
        B = B.copy()
        pose = B[:, :, 126:225].reshape(len(B), 60, 33, 3)
        pose[..., 0:1] += dx * (np.abs(pose).sum(-1, keepdims=True) > 0)
        B[:, :, 126:225] = pose.reshape(len(B), 60, 99)
        return B

    idx = r.choice(len(X), 300, replace=False)
    B, yb = X[idx], y[idx]
    scen = {
        "no_drift_heldout": B,
        "sensor_noise_0.5std": noisy(B, 0.5),
        "dropped_frames_20pct": dropped(B, 0.2),
        "camera_shift_10pct": camshift(B, 0.10),
        "left_handed_signers": np.stack([_mirror(x) for x in B]),
    }
    res = {}
    for a in ARCHS:
        m = load_model(a)
        mon = DriftMonitor(ref, m, live)
        res[a] = {"reference_confidence": mon.ref_conf}
        for name, Bx in scen.items():
            out = mon.check(Bx)
            out["accuracy"] = float((predict(m, norm(Bx)).argmax(1) == yb).mean())
            res[a][name] = out
            print(a, name, out)
    save("drift", res)
    return res


if __name__ == "__main__":
    main()
