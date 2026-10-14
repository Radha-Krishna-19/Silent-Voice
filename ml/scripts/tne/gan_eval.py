"""T&E: GAN data augmentation, step 2 — does synthetic data help the model?

1. Generates 11 synthetic clips per class (about one real class's worth) from the
   trained conditional generator (logs/tne/gan_generator.pt).
2. Fidelity: how often the served, real-data-trained models recognise a
   synthetic clip as the class it was generated for, and how close the synthetic
   feature statistics are to the real ones.
3. Utility: retrains the 1D CNN with the project recipe (60 epochs, best
   validation epoch kept) on real clips only (control) and on real + synthetic
   clips, and scores both on the same 642 held-out test clips. Same seed, same
   schedule; the only difference is the synthetic data.
"""
from __future__ import annotations

import time

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import f1_score

from common import NAMES, OUT, build, data, load_model, norm, plt, predict, save
from gan_train import G, ZD

PER_CLASS = 11
EPOCHS = 60


def train(Xtr, ytr, Xva, yva, Xte, yte, tag):
    torch.manual_seed(42)
    np.random.seed(42)
    m = build("cnn", 261)
    opt = torch.optim.AdamW(m.parameters(), lr=3e-3, weight_decay=1e-4)
    sch = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=EPOCHS)
    X, Y = torch.from_numpy(Xtr), torch.from_numpy(ytr)
    best, best_ep, state, t0 = -1, 0, None, time.time()
    for ep in range(1, EPOCHS + 1):
        m.train()
        perm = torch.randperm(len(X))
        for i in range(0, len(X) - 31, 32):
            b = perm[i:i + 32]
            opt.zero_grad()
            F.cross_entropy(m(X[b]), Y[b], label_smoothing=0.05).backward()
            torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step()
        sch.step()
        va = float((predict(m, Xva).argmax(1) == yva).mean())
        if va > best:
            best, best_ep, state = va, ep, {k: v.clone() for k, v in m.state_dict().items()}
        if ep % 10 == 0:
            print(f"   {tag} epoch {ep}: val {va:.4f} ({time.time() - t0:.0f}s)", flush=True)
    m.load_state_dict(state)
    p = predict(m, Xte).argmax(1)
    return {"train_clips": int(len(Xtr)), "best_val_acc": best, "best_epoch": best_ep,
            "test_acc": float((p == yte).mean()), "macro_f1": float(f1_score(yte, p, average="macro")), "seconds": time.time() - t0}


def main():
    d = data()
    g = G()
    g.load_state_dict(torch.load(OUT / "gan_generator.pt"))
    g.eval()
    torch.manual_seed(7)
    ys = np.repeat(np.arange(261), PER_CLASS)
    with torch.no_grad():
        Xs = torch.cat([g(torch.randn(len(ys[i:i + 256]), ZD), torch.from_numpy(ys[i:i + 256])) for i in range(0, len(ys), 256)]).numpy().astype(np.float32)
    Xtr, Xva, Xte = norm(d["train"][0]).astype(np.float32), norm(d["val"][0]).astype(np.float32), norm(d["test"][0]).astype(np.float32)
    ytr, yva, yte = d["train"][1], d["val"][1], d["test"][1]
    live = d["live"]
    fid = {"synthetic_clips": int(len(Xs)),
           "feature_mean_abs_diff": float(np.abs(Xs[:, :, live].mean((0, 1)) - Xtr[:, :, live].mean((0, 1))).mean()),
           "feature_std_ratio": float((Xs[:, :, live].std((0, 1)) / (Xtr[:, :, live].std((0, 1)) + 1e-6)).mean()),
           "frame_to_frame_change_synthetic": float(np.abs(np.diff(Xs[:, :, live], axis=1)).mean()),
           "frame_to_frame_change_real": float(np.abs(np.diff(Xtr[:, :, live], axis=1)).mean())}
    for a in ("bilstm", "cnn"):
        p = predict(load_model(a), Xs)
        fid[f"{a}_recognises_conditioned_class"] = float((p.argmax(1) == ys).mean())
        fid[f"{a}_top5_conditioned_class"] = float(np.mean([ys[i] in np.argsort(-p[i])[:5] for i in range(len(ys))]))
    print("fidelity", fid, flush=True)
    ctrl = train(Xtr, ytr, Xva, yva, Xte, yte, "real only")
    print("control", ctrl, flush=True)
    aug = train(np.concatenate([Xtr, Xs]), np.concatenate([ytr, ys]), Xva, yva, Xte, yte, "real + GAN")
    print("augmented", aug, flush=True)
    res = {"fidelity": fid, "cnn_real_only": ctrl, "cnn_real_plus_gan": aug,
           "delta_test_acc_points": (aug["test_acc"] - ctrl["test_acc"]) * 100}
    p = plt()
    f, ax = p.subplots(figsize=(3.4, 1.95))
    v = [ctrl["test_acc"] * 100, aug["test_acc"] * 100]
    b = ax.bar(["1D CNN, real clips", "1D CNN, real + GAN clips"], v, color=["#d97a1c", "#8c5a2b"], width=.5)
    for r, x in zip(b, v):
        ax.text(r.get_x() + r.get_width() / 2, x, f"{x:.2f}", ha="center", va="bottom", fontsize=7)
    ax.set_ylabel("Test accuracy (%)")
    ax.set_ylim(min(v) - 8, 100)
    f.tight_layout()
    f.savefig("logs/tne/gan_augmentation.png", dpi=300)
    save("gan", res)
    return res


if __name__ == "__main__":
    main()
