"""T&E: interpretability (white-box) — occlusion and gradient x input saliency.

Occlusion replaces a block of *normalised* features with 0 (= the training mean):
the left-hand features (cols 0-62), right-hand features (63-125), pose (126-224),
or one 10-frame window. Saliency is |gradient of the true-class logit x input|,
summed per feature group and per frame, computed with the model in eval mode.
"""
from __future__ import annotations

import numpy as np
import torch

from common import ARCHS, COLORS, NAMES, data, load_model, norm, plt, predict, save

GROUPS = {"left_hand": slice(0, 63), "right_hand": slice(63, 126), "pose": slice(126, 225)}


def main():
    d = data()
    X, y = d["test"]
    Xn = norm(X)
    idx = np.arange(len(y))
    res = {"occlusion_group": {}, "occlusion_time": {}, "saliency_group": {}, "saliency_time": {}}
    for a in ARCHS:
        m = load_model(a)
        p0 = predict(m, Xn)
        og = {"none": {"acc": float((p0.argmax(1) == y).mean()), "p_true": float(p0[idx, y].mean())}}
        for g, sl in GROUPS.items():
            X2 = Xn.copy()
            X2[:, :, sl] = 0
            p = predict(m, X2)
            og[g] = {"acc": float((p.argmax(1) == y).mean()), "p_true": float(p[idx, y].mean())}
        res["occlusion_group"][a] = og
        ot = []
        for w in range(6):
            X2 = Xn.copy()
            X2[:, w * 10:(w + 1) * 10] = 0
            p = predict(m, X2)
            ot.append({"frames": f"{w * 10 + 1}-{w * 10 + 10}", "acc": float((p.argmax(1) == y).mean()), "p_true": float(p[idx, y].mean())})
        res["occlusion_time"][a] = ot
        m.eval()
        ts, gs = np.zeros(60), np.zeros(3)
        for i in range(0, len(Xn), 64):
            xb = torch.from_numpy(Xn[i:i + 64]).clone().requires_grad_(True)
            out = m(xb)
            out[torch.arange(len(xb)), torch.from_numpy(y[i:i + 64])].sum().backward()
            sal = (xb.grad * xb).abs().detach().numpy()
            ts += sal.sum((0, 2))
            gs += np.array([sal[:, :, sl].sum() for sl in GROUPS.values()])
        res["saliency_group"][a] = dict(zip(GROUPS, (gs / gs.sum()).tolist()))
        res["saliency_time"][a] = (ts / ts.sum()).tolist()
        print(a, og, res["saliency_group"][a])
    p = plt()
    labels = ["None", "Left hand", "Right hand", "Pose"]
    keys = ["none", "left_hand", "right_hand", "pose"]
    for fn, vals, yl, xt, xl in (
        ("xai_occlusion_group.png", {a: [res["occlusion_group"][a][k]["acc"] * 100 for k in keys] for a in ARCHS}, "Test accuracy (%)", labels, None),
        ("xai_occlusion_time.png", {a: [r["acc"] * 100 for r in res["occlusion_time"][a]] for a in ARCHS}, "Test accuracy (%)", [r["frames"] for r in res["occlusion_time"]["cnn"]], "Occluded frames"),
        ("xai_saliency_group.png", {a: [res["saliency_group"][a][k] * 100 for k in GROUPS] for a in ARCHS}, "Share of saliency (%)", labels[1:], None)):
        f, ax = p.subplots(figsize=(3.4, 1.95))
        x = np.arange(len(xt))
        for i, a in enumerate(ARCHS):
            b = ax.bar(x + (i - .5) * .36, vals[a], .36, color=COLORS[a], label=NAMES[a])
            for r, v in zip(b, vals[a]):
                ax.text(r.get_x() + r.get_width() / 2, v, f"{v:.1f}", ha="center", va="bottom", fontsize=6)
        ax.set_xticks(x)
        ax.set_xticklabels(xt)
        ax.set_ylabel(yl)
        if xl:
            ax.set_xlabel(xl)
        ax.set_ylim(0, max(max(v) for v in vals.values()) * 1.18)
        ax.legend(frameon=False, fontsize=7, ncol=2, loc="upper center", bbox_to_anchor=(.5, 1.15))
        f.tight_layout()
        f.savefig(f"logs/tne/{fn}", dpi=300)
    save("explainability", res)
    return res


if __name__ == "__main__":
    main()
