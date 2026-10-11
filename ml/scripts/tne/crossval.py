"""T&E: test design — stratified k-fold cross-validation.

Retrains both architectures on k folds of the whole INCLUDE set (stratified,
seed 42) with the project's training recipe (AdamW lr 3e-3, wd 1e-4, cosine
schedule, label smoothing 0.05, grad-clip 1.0, batch 32, no augmentation) and
reports the spread of accuracy across folds. The epoch budget is reduced
(default 20) to keep CPU time practical, so these fold scores estimate
*variance across splits*, not the headline accuracy of the 60-epoch models.

    python scripts/tne/crossval.py --folds 3 --epochs 20
"""
from __future__ import annotations

import argparse
import time

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold

from common import ARCHS, NAMES, build, data, plt, save, COLORS


def train_eval(arch, Xtr, ytr, Xte, yte, epochs, log):
    mean = Xtr.reshape(-1, Xtr.shape[2]).mean(0)
    std = Xtr.reshape(-1, Xtr.shape[2]).std(0)
    n = lambda X: ((X - mean) / (std + 1e-6)).astype(np.float32)
    Xtr, Xte = torch.from_numpy(n(Xtr)), n(Xte)
    Ytr = torch.from_numpy(ytr)
    torch.manual_seed(42)
    m = build(arch, 261)
    opt = torch.optim.AdamW(m.parameters(), lr=3e-3, weight_decay=1e-4)
    sch = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    t0 = time.time()
    for ep in range(epochs):
        m.train()
        perm = torch.randperm(len(Xtr))
        for i in range(0, len(Xtr) - 31, 32):
            b = perm[i:i + 32]
            opt.zero_grad()
            F.cross_entropy(m(Xtr[b]), Ytr[b], label_smoothing=0.05).backward()
            torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step()
        sch.step()
        log(f"   {arch} epoch {ep + 1}/{epochs} ({time.time() - t0:.0f}s)")
    m.eval()
    with torch.no_grad():
        p = torch.cat([m(torch.from_numpy(Xte[i:i + 256])) for i in range(0, len(Xte), 256)]).argmax(1).numpy()
    return float((p == yte).mean()), float(f1_score(yte, p, average="macro")), time.time() - t0


def main(folds=3, epochs=20, archs=ARCHS):
    d = data()
    X = np.concatenate([d["train"][0], d["val"][0], d["test"][0]])
    y = np.concatenate([d["train"][1], d["val"][1], d["test"][1]])
    skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
    res = {a: [] for a in archs}
    for k, (tr, te) in enumerate(skf.split(X, y)):
        for a in archs:
            acc, f1, sec = train_eval(a, X[tr], y[tr], X[te], y[te], epochs, print)
            res[a].append({"fold": k + 1, "acc": acc, "macro_f1": f1, "train_seconds": sec, "n_train": int(len(tr)), "n_test": int(len(te))})
            print(f"fold {k + 1} {a}: acc {acc:.4f} macro-F1 {f1:.4f}", flush=True)
    summary = {a: {"acc_mean": float(np.mean([r["acc"] for r in res[a]])), "acc_std": float(np.std([r["acc"] for r in res[a]], ddof=1)),
                   "f1_mean": float(np.mean([r["macro_f1"] for r in res[a]])), "f1_std": float(np.std([r["macro_f1"] for r in res[a]], ddof=1))} for a in archs}
    p = plt()
    f, ax = p.subplots(figsize=(3.4, 1.95))
    for i, a in enumerate(archs):
        v = [r["acc"] * 100 for r in res[a]]
        ax.scatter([i] * len(v), v, color=COLORS[a], s=14, zorder=3)
        ax.errorbar(i + .18, summary[a]["acc_mean"] * 100, yerr=summary[a]["acc_std"] * 100, fmt="o", color="black", ms=3, capsize=3)
    ax.set_xticks(range(len(archs)))
    ax.set_xticklabels([NAMES[a] for a in archs])
    ax.set_xlim(-.5, len(archs) - .5)
    ax.set_ylabel("Fold accuracy (%)")
    f.tight_layout()
    f.savefig("logs/tne/crossval.png", dpi=300)
    save("crossval", {"folds": folds, "epochs": epochs, "per_fold": res, "summary": summary})
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=3)
    ap.add_argument("--epochs", type=int, default=20)
    a = ap.parse_args()
    main(a.folds, a.epochs)
