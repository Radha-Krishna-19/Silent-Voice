"""T&E: robustness — Gaussian landmark noise and dropped frames.

Noise is added to raw landmark features before normalisation, scaled by each
feature's training standard deviation. The six wrist-origin features are exactly
zero by construction (std 0) and are left untouched: perturbing them would be
amplified ~1e6x by normalisation and is not a physically meaningful error.
Dropped frames are set to all-zero (what the pipeline produces when MediaPipe
finds nobody). Each setting is averaged over three seeds.
"""
from __future__ import annotations

import numpy as np

from common import OUT, ARCHS, COLORS, NAMES, acc, data, load_model, norm, plt, predict, save

NOISE = [0, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0]
DROP = [0, 0.1, 0.2, 0.3, 0.5]
SEEDS = (0, 1, 2)


def main():
    d = data()
    X, y = d["test"]
    live, std = d["live"], d["std"]
    res = {"noise": {}, "drop": {}}
    for a in ARCHS:
        m = load_model(a)
        res["noise"][a], res["drop"][a] = {}, {}
        for s in NOISE:
            v = []
            for sd in SEEDS:
                r = np.random.RandomState(sd)
                Xp = X.copy()
                if s:
                    Xp[:, :, live] += (r.normal(0, 1, Xp[:, :, live].shape) * std[live] * s).astype(np.float32)
                v.append(acc(predict(m, norm(Xp)), y))
            res["noise"][a][str(s)] = float(np.mean(v))
            print(f"{a} noise {s}: {np.mean(v):.4f}")
        for pd in DROP:
            v = []
            for sd in SEEDS:
                r = np.random.RandomState(sd)
                Xp = X.copy()
                if pd:
                    Xp[r.random_sample(Xp.shape[:2]) < pd] = 0
                v.append(acc(predict(m, norm(Xp)), y))
            res["drop"][a][str(pd)] = float(np.mean(v))
            print(f"{a} drop {pd}: {np.mean(v):.4f}")
    p = plt()
    for key, xs, xl, fn in (("noise", NOISE, "Gaussian noise (x feature std)", "robustness_noise.png"),
                            ("drop", DROP, "Fraction of frames dropped", "robustness_drop.png")):
        f, ax = p.subplots(figsize=(3.4, 1.95))
        for a in ARCHS:
            ax.plot(range(len(xs)), [res[key][a][str(x)] * 100 for x in xs], "o-", ms=3, lw=1.2, color=COLORS[a], label=NAMES[a])
        ax.set_xticks(range(len(xs)))
        ax.set_xticklabels([str(x) for x in xs])
        ax.set_xlabel(xl)
        ax.set_ylabel("Test accuracy (%)")
        ax.set_ylim(0, 100)
        ax.legend(frameon=False, fontsize=7)
        f.tight_layout()
        f.savefig(OUT / fn, dpi=300)
    save("robustness", res)
    return res


if __name__ == "__main__":
    main()
