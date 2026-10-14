"""T&E: qualitative analysis — what the errors look like, not just how many.

  * error taxonomy: each misclassified test clip is a "near miss" (true label in
    the top 5) or a "far miss";
  * most-confused class pairs, with how often each pair is confused;
  * a sample of individual predictions (true label, top-3 with confidences);
  * agreement between the two models: errors both make vs errors only one makes;
  * a per-frame saliency heat map for three example clips, to show *when* in the
    sign each model looks.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
import torch

from common import ARCHS, NAMES, data, load_model, norm, plt, predict, save


def main():
    d = data()
    X, y = d["test"]
    labels = d["labels"]
    Xn = norm(X)
    probs, res = {}, {}
    for a in ARCHS:
        p = predict(load_model(a), Xn)
        probs[a] = p
        pred = p.argmax(1)
        wrong = np.where(pred != y)[0]
        top5 = np.argsort(-p, 1)[:, :5]
        near = [i for i in wrong if y[i] in top5[i]]
        pairs = Counter((labels[y[i]], labels[pred[i]]) for i in wrong).most_common(8)
        samples = []
        for i in list(wrong[:6]) + list(np.where(pred == y)[0][:4]):
            t3 = np.argsort(-p[i])[:3]
            samples.append({"true": labels[y[i]], "correct": bool(pred[i] == y[i]),
                            "top3": [[labels[j], round(float(p[i, j]), 3)] for j in t3]})
        res[a] = {"n_errors": int(len(wrong)), "near_miss_in_top5": int(len(near)), "far_miss": int(len(wrong) - len(near)),
                  "most_confused_pairs": [{"true": t, "predicted": q, "count": c} for (t, q), c in pairs],
                  "sample_predictions": samples}
        print(a, res[a]["n_errors"], "errors;", len(near), "near misses;", pairs[:4])
    eb = probs["bilstm"].argmax(1) != y
    ec = probs["cnn"].argmax(1) != y
    res["agreement"] = {"both_wrong": int((eb & ec).sum()), "only_bilstm_wrong": int((eb & ~ec).sum()),
                        "only_cnn_wrong": int((~eb & ec).sum()), "both_right": int((~eb & ~ec).sum()),
                        "oracle_either_right_acc": float(1 - (eb & ec).mean()),
                        "both_wrong_classes": sorted({labels[y[i]] for i in np.where(eb & ec)[0]})}
    print("agreement", {k: v for k, v in res["agreement"].items() if k != "both_wrong_classes"})
    # saliency over time for 3 clips (first correct clips of 3 different classes)
    pick, seen = [], set()
    for i in np.where(~eb & ~ec)[0]:
        if y[i] not in seen:
            pick.append(i)
            seen.add(y[i])
        if len(pick) == 3:
            break
    p_ = plt()
    f, axes = p_.subplots(len(ARCHS), 1, figsize=(3.4, 2.4), sharex=True)
    for ax, a in zip(axes, ARCHS):
        m = load_model(a)
        rows = []
        for i in pick:
            xb = torch.from_numpy(Xn[i:i + 1]).clone().requires_grad_(True)
            m(xb)[0, y[i]].backward()
            s = (xb.grad * xb).abs().sum(2)[0].detach().numpy()
            rows.append(s / s.max())
        ax.imshow(np.array(rows), aspect="auto", cmap="viridis")
        ax.set_yticks(range(len(pick)))
        ax.set_yticklabels([labels[y[i]] for i in pick], fontsize=6)
        ax.set_title(NAMES[a], fontsize=7, loc="left")
    axes[-1].set_xlabel("Frame")
    f.tight_layout()
    f.savefig("logs/tne/qualitative_saliency_examples.png", dpi=300)
    res["saliency_examples"] = [labels[y[i]] for i in pick]
    save("qualitative", res)
    return res


if __name__ == "__main__":
    main()
