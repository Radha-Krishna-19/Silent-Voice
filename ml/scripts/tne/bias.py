"""T&E: bias and representativeness.

INCLUDE file names carry no signer identity, so demographic or per-signer
fairness cannot be measured from this data (stated as a limitation). What can be
measured:
  * representativeness of the split: per-class share in train vs test;
  * representation bias: accuracy for classes with few vs many clips;
  * handedness groups: accuracy for one-handed vs two-handed signs (a class is
    two-handed if both hands are detected in >= 50% of frames across its clips).
"""
from __future__ import annotations

import numpy as np

from common import ARCHS, NAMES, data, load_model, norm, plt, predict, save


def main():
    d = data()
    (Xtr, ytr), (Xva, yva), (Xte, yte) = d["train"], d["val"], d["test"]
    yall = np.concatenate([ytr, yva, yte])
    Xall = np.concatenate([Xtr, Xva, Xte])
    counts = np.bincount(yall, minlength=261)
    share_tr = np.bincount(ytr, minlength=261) / len(ytr)
    share_te = np.bincount(yte, minlength=261) / len(yte)
    left = np.abs(Xall[:, :, 0:63]).sum(2) > 0
    right = np.abs(Xall[:, :, 63:126]).sum(2) > 0
    both_frac = (left & right).mean(1)
    cls_two = np.array([both_frac[yall == c].mean() >= 0.5 for c in range(261)])
    t1, t2 = np.percentile(counts, [33.3, 66.7])
    tier = np.where(counts <= t1, "few", np.where(counts <= t2, "medium", "many"))
    res = {"representativeness": {
        "clips_per_class": {"min": int(counts.min()), "max": int(counts.max()), "mean": float(counts.mean()), "median": float(np.median(counts))},
        "max_abs_share_diff_train_vs_test": float(np.abs(share_tr - share_te).max()),
        "classes_present_in_test": int((np.bincount(yte, minlength=261) > 0).sum()),
        "frames_with_left_hand": float(left.mean()), "frames_with_right_hand": float(right.mean()),
        "two_handed_classes": int(cls_two.sum()), "one_handed_classes": int((~cls_two).sum()),
        "tier_thresholds_clips": [float(t1), float(t2)]}}
    for a in ARCHS:
        pred = predict(load_model(a), norm(Xte)).argmax(1)
        ok = pred == yte
        g = {}
        for t in ("few", "medium", "many"):
            mk = tier[yte] == t
            g[f"{t}_clips"] = {"n_test": int(mk.sum()), "acc": float(ok[mk].mean())}
        for name, mk in (("two_handed", cls_two[yte]), ("one_handed", ~cls_two[yte])):
            g[name] = {"n_test": int(mk.sum()), "acc": float(ok[mk].mean())}
        res[a] = g
        print(a, g)
    p = plt()
    f, ax = p.subplots(figsize=(3.4, 1.95))
    keys = ["few_clips", "medium_clips", "many_clips", "one_handed", "two_handed"]
    x = np.arange(len(keys))
    for i, a in enumerate(ARCHS):
        v = [res[a][k]["acc"] * 100 for k in keys]
        b = ax.bar(x + (i - .5) * .36, v, .36, color={"bilstm": "#1f6fb2", "cnn": "#d97a1c"}[a], label=NAMES[a])
        for rr, vv in zip(b, v):
            ax.text(rr.get_x() + rr.get_width() / 2, vv, f"{vv:.1f}", ha="center", va="bottom", fontsize=5.5)
    ax.set_xticks(x)
    ax.set_xticklabels(["Few\nclips", "Medium", "Many\nclips", "One-\nhanded", "Two-\nhanded"])
    ax.set_ylabel("Test accuracy (%)")
    ax.set_ylim(0, 112)
    ax.legend(frameon=False, fontsize=7, ncol=2, loc="upper center", bbox_to_anchor=(.5, 1.15))
    f.tight_layout()
    f.savefig("logs/tne/bias_groups.png", dpi=300)
    save("bias", res)
    return res


if __name__ == "__main__":
    main()
