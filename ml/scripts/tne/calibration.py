"""T&E: uncertainty — calibration and selective prediction.

Expected calibration error (ECE, 15 equal-width bins), maximum calibration error,
negative log-likelihood and Brier score; temperature scaling fitted on the
validation split (never on test) as a mitigation; and selective prediction:
accuracy when the model only answers above a confidence threshold, including the
0.5 floor the live app uses in continuous mode (CONTINUOUS_CONFIDENCE_FLOOR).
"""
from __future__ import annotations

import numpy as np
import torch

from common import ARCHS, COLORS, NAMES, data, load_model, norm, plt, save

BINS = 15


def calib(p, y):
    conf, pred = p.max(1), p.argmax(1)
    correct = pred == y
    edges = np.linspace(0, 1, BINS + 1)
    ece, mce, rows = 0.0, 0.0, []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mk = (conf > lo) & (conf <= hi)
        if mk.any():
            gap = abs(correct[mk].mean() - conf[mk].mean())
            ece += mk.mean() * gap
            mce = max(mce, gap)
            rows.append({"bin": [float(lo), float(hi)], "n": int(mk.sum()), "acc": float(correct[mk].mean()), "conf": float(conf[mk].mean())})
    onehot = np.eye(p.shape[1])[y]
    return {"acc": float(correct.mean()), "mean_conf": float(conf.mean()), "ece": float(ece), "mce": float(mce),
            "nll": float(-np.log(np.clip(p[np.arange(len(y)), y], 1e-12, 1)).mean()),
            "brier": float(((p - onehot) ** 2).sum(1).mean()), "bins": rows}


@torch.no_grad()
def logits(m, Xn):
    return torch.cat([m(torch.from_numpy(Xn[i:i + 128])) for i in range(0, len(Xn), 128)])


def main():
    d = data()
    (Xva, yva), (Xte, yte) = d["val"], d["test"]
    res = {}
    for a in ARCHS:
        m = load_model(a)
        lv, lt = logits(m, norm(Xva)), logits(m, norm(Xte))
        # temperature scaling on validation only
        T = torch.ones(1, requires_grad=True)
        opt = torch.optim.LBFGS([T], lr=0.05, max_iter=200)
        yv = torch.from_numpy(yva)

        def closure():
            opt.zero_grad()
            loss = torch.nn.functional.cross_entropy(lv / T, yv)
            loss.backward()
            return loss
        opt.step(closure)
        pt = lt.softmax(1).numpy()
        pts = (lt / T.detach()).softmax(1).numpy()
        conf = pt.max(1)
        correct = pt.argmax(1) == yte
        sel = {}
        for thr in (0.0, 0.5, 0.7, 0.9):
            mk = conf >= thr
            sel[str(thr)] = {"coverage": float(mk.mean()), "acc": float(correct[mk].mean()) if mk.any() else None}
        order = np.argsort(-conf)
        cov = {}
        for c in (1.0, 0.9, 0.8, 0.7):
            k = int(round(c * len(order)))
            cov[str(c)] = float(correct[order[:k]].mean())
        res[a] = {"uncalibrated": calib(pt, yte), "temperature": float(T.item()), "temperature_scaled": calib(pts, yte),
                  "threshold": sel, "accuracy_at_coverage": cov,
                  "mean_conf_correct": float(conf[correct].mean()), "mean_conf_wrong": float(conf[~correct].mean())}
        u, s = res[a]["uncalibrated"], res[a]["temperature_scaled"]
        print(f"{a}: ECE {u['ece']:.4f} -> {s['ece']:.4f} (T={T.item():.3f}); conf correct {res[a]['mean_conf_correct']:.3f} wrong {res[a]['mean_conf_wrong']:.3f}")
    p = plt()
    f, ax = p.subplots(figsize=(3.4, 2.3))
    ax.plot([0, 1], [0, 1], "--", color="#999", lw=.8, label="Perfect calibration")
    for a in ARCHS:
        b = res[a]["uncalibrated"]["bins"]
        ax.plot([r["conf"] for r in b], [r["acc"] for r in b], "o-", ms=3, lw=1.1, color=COLORS[a],
                label=f"{NAMES[a]} (ECE {res[a]['uncalibrated']['ece']:.3f})")
    ax.set_xlabel("Mean confidence in bin")
    ax.set_ylabel("Accuracy in bin")
    ax.legend(frameon=False, fontsize=6.5)
    f.tight_layout()
    f.savefig("logs/tne/calibration_reliability.png", dpi=300)
    save("calibration", res)
    return res


if __name__ == "__main__":
    main()
