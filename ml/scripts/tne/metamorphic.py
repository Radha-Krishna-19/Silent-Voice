"""T&E: metamorphic testing (black-box).

There is no ground truth for "what the model should output" on a transformed
clip, but there are relations the output should satisfy. Each metamorphic
relation (MR) applies a transformation that should NOT change the sign, and
counts how often the model's prediction changes (a violation):

  MR1 small noise      +0.1 x feature-std Gaussian noise on non-constant features
  MR2 time shift       sign starts 2 frames earlier / later (edge frames repeated)
  MR3 speed change     signed 10% faster / slower (temporal resampling)
  MR4 camera shift     signer stands 5% further left in the image (pose x + 0.05)
  MR5 mirror           left-handed signer (left/right mirrored, as dataset._mirror)
"""
from __future__ import annotations

import numpy as np

from common import bar_offsets, COLORS, OUT, ARCHS, NAMES, _mirror, data, load_model, norm, plt, predict, save


def shift(X, k):
    idx = np.clip(np.arange(60) - k, 0, 59)
    return X[:, idx]


def speed(X, f):
    idx = np.clip(np.round(np.arange(60) * f + (60 - 60 * f) / 2).astype(int), 0, 59)
    return X[:, idx]


def cam(X, dx):
    Y = X.copy()
    pose = Y[:, :, 126:225].reshape(len(Y), 60, 33, 3)
    present = np.abs(pose).sum(-1, keepdims=True) > 0
    pose[..., 0:1] += dx * present
    Y[:, :, 126:225] = pose.reshape(len(Y), 60, 99)
    return Y


def main():
    d = data()
    X, y = d["test"]
    r = np.random.RandomState(0)
    noise = (r.normal(0, 1, X[:, :, d["live"]].shape) * d["std"][d["live"]] * 0.1).astype(np.float32)
    X1 = X.copy()
    X1[:, :, d["live"]] += noise
    MRS = {
        "MR1_noise_0.1std": [X1],
        "MR2_time_shift_pm2": [shift(X, 2), shift(X, -2)],
        "MR3_speed_pm10pct": [speed(X, 0.9), speed(X, 1.1)],
        "MR4_camera_shift_5pct": [cam(X, 0.05)],
        "MR5_mirror_left_handed": [np.stack([_mirror(x) for x in X])],
    }
    res = {}
    for a in ARCHS:
        m = load_model(a)
        base = predict(m, norm(X)).argmax(1)
        res[a] = {"base_acc": float((base == y).mean())}
        for name, variants in MRS.items():
            viol, accs = [], []
            for V in variants:
                pv = predict(m, norm(V)).argmax(1)
                viol.append(float((pv != base).mean()))
                accs.append(float((pv == y).mean()))
            res[a][name] = {"violation_rate": float(np.mean(viol)), "acc_after": float(np.mean(accs))}
            print(f"{a} {name}: violations {np.mean(viol):.3f}, acc {np.mean(accs):.4f}")
    p = plt()
    names = list(MRS)
    f, ax = p.subplots(figsize=(3.4, 2.0))
    x = np.arange(len(names))
    bw, offs = bar_offsets(len(ARCHS))
    for i, a in enumerate(ARCHS):
        v = [res[a][n]["violation_rate"] * 100 for n in names]
        b = ax.bar(x + offs[i], v, bw, color=COLORS[a], label=NAMES[a])
        for rr, vv in zip(b, v):
            ax.text(rr.get_x() + rr.get_width() / 2, vv, f"{vv:.1f}", ha="center", va="bottom", fontsize=5.5)
    ax.set_xticks(x)
    ax.set_xticklabels(["Noise", "Time\nshift", "Speed", "Camera\nshift", "Mirror"])
    ax.set_ylabel("Predictions changed (%)")
    ax.legend(frameon=False, fontsize=7)
    f.tight_layout()
    f.savefig(OUT / "metamorphic.png", dpi=300)
    save("metamorphic", res)
    return res


if __name__ == "__main__":
    main()
