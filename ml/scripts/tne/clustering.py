"""T&E: k-means clustering (k = 261) in three feature spaces.

Fitted on the training clips: time-pooled raw landmarks (mean + std, 450-d) and
the 512-d pooled embedding each model feeds to its classifier head. Each cluster
is labelled with its majority training class; a test clip takes the label of its
nearest centroid. Quality is also scored with NMI and ARI against true labels.
"""
from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score

from common import ARCHS, NAMES, data, load_model, norm, plt, predict, save


def embed(m, Xn):
    cap = []
    h = m.dropout.register_forward_pre_hook(lambda mod, inp: cap.append(inp[0].detach().numpy()))
    predict(m, Xn)
    h.remove()
    return np.concatenate(cap)


def pooled(X):
    Z = norm(X)
    return np.concatenate([Z.mean(1), Z.std(1)], 1)


def main():
    d = data()
    (Xtr, ytr), (Xte, yte) = d["train"], d["test"]
    spaces = {"raw_pooled_landmarks": (pooled(Xtr), pooled(Xte))}
    for a in ARCHS:
        m = load_model(a)
        spaces[f"{a}_embedding"] = (embed(m, norm(Xtr)), embed(m, norm(Xte)))
    res = {}
    for name, (Etr, Ete) in spaces.items():
        km = KMeans(n_clusters=261, n_init=2, random_state=42).fit(Etr)
        ctr, cte = km.labels_, km.predict(Ete)
        maj = {c: np.bincount(ytr[ctr == c], minlength=261).argmax() for c in set(ctr)}
        pred = np.array([maj.get(c, -1) for c in cte])
        purity = sum(np.bincount(ytr[ctr == c]).max() for c in set(ctr)) / len(ytr)
        res[name] = {"dim": int(Etr.shape[1]), "test_vote_acc": float((pred == yte).mean()),
                     "nmi_test": float(normalized_mutual_info_score(yte, cte)), "ari_test": float(adjusted_rand_score(yte, cte)),
                     "train_purity": float(purity)}
        print(name, res[name])
    p = plt()
    f, ax = p.subplots(figsize=(3.4, 1.95))
    names = list(res)
    v = [res[n]["test_vote_acc"] * 100 for n in names]
    b = ax.bar(["Raw\nlandmarks", "BiLSTM\nembedding", "1D CNN\nembedding"], v, color=["#8a8a8a", "#1f6fb2", "#d97a1c"], width=.55)
    for r, x in zip(b, v):
        ax.text(r.get_x() + r.get_width() / 2, x, f"{x:.1f}", ha="center", va="bottom", fontsize=7)
    ax.set_ylabel("K-means vote accuracy (%)")
    ax.set_ylim(0, 105)
    f.tight_layout()
    f.savefig("logs/tne/kmeans.png", dpi=300)
    save("clustering", res)
    return res


if __name__ == "__main__":
    main()
