"""Ablation study for the chosen model (1D CNN by default, or BiLSTM).

Same split (seed 42), same train-only z-score, same optimiser as _train.py.
Each variant changes exactly ONE thing from the baseline, trains from scratch,
and is scored on the held-out test split (never used for model selection:
the epoch is picked on validation accuracy).

Groups:
  features   which landmark channels the model may see
  augment    which training augmentations are on
  arch       depth / kernel / width / norm / pooling / dropout (CNN) or
             direction / layers / hidden / pooling (BiLSTM)
  temporal   number of frames (subsampled from the 60)
  data       fraction of training clips

Run from ml/:
    python scripts/ablation.py --model cnn --epochs 30
    python scripts/ablation.py --model cnn --epochs 30 --seeds 3     # mean +/- std
    python scripts/ablation.py --model cnn --groups features augment --epochs 20   # quick
Outputs: logs/ablation_<model>.json and logs/ablation_<model>.md
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from _train import collect_paths, make_splits, set_seed
from dataset import _mirror, compute_stats
from models import CNN1DClassifier, BiLSTMClassifier, param_count

LOG_DIR = Path("logs")

# column layout of the (60, 225) tensor
LH, RH, POSE = slice(0, 63), slice(63, 126), slice(126, 225)


# --------------------------------------------------------------------- models
class CNNAbl(nn.Module):
    """Configurable twin of CNN1DClassifier; defaults reproduce it exactly."""

    def __init__(self, nc, width=256, k=5, blocks=3, norm=True, pool_head="both", dropout=0.3):
        super().__init__()
        chans = [225, width // 2, width, width][: blocks + 1]
        layers = []
        for i in range(blocks):
            layers += [nn.Conv1d(chans[i], chans[i + 1], k, padding=k // 2)]
            if norm:
                layers += [nn.BatchNorm1d(chans[i + 1])]
            layers += [nn.GELU()]
            if i < 2:
                layers += [nn.MaxPool1d(2)]
        self.features = nn.Sequential(*layers)
        self.pool_head = pool_head
        c = chans[blocks]
        self.dropout = nn.Dropout(dropout)
        self.head = nn.Sequential(
            nn.Linear(c * (2 if pool_head == "both" else 1), 128), nn.GELU(),
            nn.Dropout(dropout), nn.Linear(128, nc))

    def forward(self, x):
        z = self.features(x.transpose(1, 2))
        if self.pool_head == "both":
            p = torch.cat([z.mean(2), z.amax(2)], 1)
        elif self.pool_head == "avg":
            p = z.mean(2)
        else:
            p = z.amax(2)
        return self.head(self.dropout(p))


class LSTMAbl(nn.Module):
    def __init__(self, nc, hidden=256, layers=2, bidir=True, pool="mean", dropout=0.3):
        super().__init__()
        self.lstm = nn.LSTM(225, hidden, layers, batch_first=True, bidirectional=bidir,
                            dropout=dropout if layers > 1 else 0.0)
        d = hidden * (2 if bidir else 1)
        self.pool = pool
        self.dropout = nn.Dropout(dropout)
        self.head = nn.Sequential(nn.Linear(d, 128), nn.GELU(), nn.Dropout(dropout), nn.Linear(128, nc))

    def forward(self, x):
        o, _ = self.lstm(x)
        p = o.mean(1) if self.pool == "mean" else (o[:, -1] if self.pool == "last" else o.amax(1))
        return self.head(self.dropout(p))


# ------------------------------------------------------------------- variants
def variants(model: str, groups: set[str]):
    """name -> dict(group, feat_mask_fn, aug flags, build kwargs, frames, frac, ls)."""
    base = dict(drop=[], aug=dict(jitter=0, frame_drop=0, shift=0, mirror=0), arch={}, frames=60,
                frac=1.0, ls=0.05, nozero_z=False)
    out = {"baseline (full model)": dict(base, group="baseline")}

    def add(name, group, **kw):
        if group in groups:
            v = dict(base, group=group)
            for k2, v2 in kw.items():
                v[k2] = {**base[k2], **v2} if isinstance(base[k2], dict) else v2
            out[name] = v

    add("- left hand", "features", drop=[LH])
    add("- right hand", "features", drop=[RH])
    add("- both hands (pose only)", "features", drop=[LH, RH])
    add("- pose (hands only)", "features", drop=[POSE])
    add("- z coordinate (x,y only)", "features", nozero_z=True)

    # The shipped models were trained WITHOUT augmentation (with ~11 clips per
    # class it stops them fitting at all), so the baseline has none and this group
    # tests adding each one back.
    add("+ jitter", "augment", aug=dict(jitter=1))
    add("+ frame drop", "augment", aug=dict(frame_drop=1))
    add("+ temporal shift", "augment", aug=dict(shift=1))
    add("+ mirror", "augment", aug=dict(mirror=1))
    add("- label smoothing", "augment", ls=0.0)

    if model == "cnn":
        add("- batch norm", "arch", arch=dict(norm=False))
        add("kernel 3 (was 5)", "arch", arch=dict(k=3))
        add("kernel 9 (was 5)", "arch", arch=dict(k=9))
        add("2 conv blocks (was 3)", "arch", arch=dict(blocks=2))
        add("1 conv block (was 3)", "arch", arch=dict(blocks=1))
        add("width 128 (was 256)", "arch", arch=dict(width=128))
        add("width 512 (was 256)", "arch", arch=dict(width=512))
        add("avg-pool only head", "arch", arch=dict(pool_head="avg"))
        add("max-pool only head", "arch", arch=dict(pool_head="max"))
        add("dropout 0.0 (was 0.3)", "arch", arch=dict(dropout=0.0))
        add("dropout 0.5 (was 0.3)", "arch", arch=dict(dropout=0.5))
    else:
        add("unidirectional (was bi)", "arch", arch=dict(bidir=False))
        add("1 layer (was 2)", "arch", arch=dict(layers=1))
        add("hidden 128 (was 256)", "arch", arch=dict(hidden=128))
        add("last-step pooling (was mean)", "arch", arch=dict(pool="last"))
        add("max pooling (was mean)", "arch", arch=dict(pool="max"))
        add("dropout 0.0 (was 0.3)", "arch", arch=dict(dropout=0.0))

    add("30 frames (every 2nd)", "temporal", frames=30)
    add("15 frames (every 4th)", "temporal", frames=15)
    add("50% of training clips", "data", frac=0.5)
    add("25% of training clips", "data", frac=0.25)
    return out


def build(model: str, nc: int, arch: dict) -> nn.Module:
    return CNNAbl(nc, **arch) if model == "cnn" else LSTMAbl(nc, **arch)


# ------------------------------------------------------------------- training
def augment(x: np.ndarray, f: dict, rng: np.random.Generator) -> np.ndarray:
    x = x.copy()
    if f["jitter"]:
        x += rng.normal(0, 0.01, x.shape).astype(np.float32)
    if f["frame_drop"]:
        x[rng.random(len(x)) < 0.10] = 0
    if f["shift"]:
        s = int(rng.integers(-4, 5))
        if s:
            x = np.roll(x, s, 0)
            if s > 0:
                x[:s] = 0
            else:
                x[s:] = 0
    if f["mirror"] and rng.random() < 0.5:
        x = _mirror(x)
    return x


def load(paths, labels):
    X = np.stack([np.load(p).astype(np.float32) for p in paths])
    y = np.array([labels.index(p.stem.split("__")[0]) for p in paths])
    return X, y


def run_variant(v, data, nc, mean, std, epochs, batch, lr, seed, device, progress=None):
    set_seed(seed)
    rng = np.random.default_rng(seed)
    (Xtr, ytr), (Xva, yva), (Xte, yte) = data

    if v["frac"] < 1.0:  # stratified subset of train clips
        keep = []
        for c in np.unique(ytr):
            idx = np.where(ytr == c)[0]
            keep += list(rng.permutation(idx)[: max(1, int(round(len(idx) * v["frac"])))])
        keep = np.array(sorted(keep))
        Xtr, ytr = Xtr[keep], ytr[keep]

    mask = np.ones(225, dtype=np.float32)
    for sl in v["drop"]:
        mask[sl] = 0
    if v["nozero_z"]:
        mask[2::3] = 0
    step = 60 // v["frames"]

    def prep(X, aug):
        if aug:
            X = np.stack([augment(a, v["aug"], rng) for a in X])
        X = (X - mean) / (std + 1e-6) * mask       # zero AFTER z-score => channel removed
        return torch.from_numpy(X[:, ::step]).float()

    Xva_t, Xte_t = prep(Xva, False), prep(Xte, False)
    model = build(v["model"], nc, v["arch"]).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=v["ls"])

    def acc(X, y):
        model.eval()
        with torch.no_grad():
            pred = torch.cat([model(X[i:i + 256].to(device)).argmax(-1).cpu()
                              for i in range(0, len(X), 256)])
        return float((pred.numpy() == y).mean())

    best_val, best_test = -1.0, 0.0
    for ep in range(epochs):
        t_ep = time.time()
        model.train()
        Xt = prep(Xtr, True)
        yt = torch.from_numpy(ytr)
        perm = torch.randperm(len(Xt))
        for i in range(0, len(perm), batch):
            b = perm[i:i + batch]
            if len(b) < 2:
                continue
            opt.zero_grad()
            loss_fn(model(Xt[b].to(device)), yt[b].to(device)).backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
        sched.step()
        va = acc(Xva_t, yva)
        if va > best_val:                      # select epoch on VAL, report TEST at that epoch
            best_val, best_test = va, acc(Xte_t, yte)
        if progress:
            progress(ep + 1, va, time.time() - t_ep)
    return best_val, best_test, param_count(model)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["cnn", "bilstm"], default="cnn")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--seeds", type=int, default=1)
    ap.add_argument("--groups", nargs="+", default=["features", "augment", "arch", "temporal", "data"])
    a = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    paths = collect_paths()
    labels = sorted({p.stem.split("__")[0] for p in paths})
    tr, va, te = make_splits(paths, labels)
    mean, std = compute_stats(tr)
    data = (load(tr, labels), load(va, labels), load(te, labels))
    nc = len(labels)
    print("loading data ...", flush=True)
    print(f"device {device} | train {len(tr)} val {len(va)} test {len(te)} | classes {nc}", flush=True)

    # sanity: the configurable twin must equal the shipped model
    ref = (CNN1DClassifier if a.model == "cnn" else BiLSTMClassifier)(nc)
    mine = build(a.model, nc, {})
    assert param_count(ref) == param_count(mine), "ablation baseline differs from shipped model"

    V = variants(a.model, set(a.groups))
    rows = []
    n_var, done_s, t_all = len(V), [], time.time()
    for k, (name, v) in enumerate(V.items(), 1):
        v["model"] = a.model
        t0 = time.time()

        def progress(ep, va, sec, _k=k, _name=name):
            total_eps = n_var * a.epochs * a.seeds
            eps_done = (_k - 1) * a.epochs * a.seeds + ep
            frac = eps_done / total_eps
            elapsed = time.time() - t_all
            eta = elapsed / frac * (1 - frac) if frac > 0 else 0
            bar = "#" * int(frac * 30) + "-" * (30 - int(frac * 30))
            print(f"  [{bar}] {frac:5.1%}  variant {_k}/{n_var}  epoch {ep}/{a.epochs}  "
                  f"val {va:6.1%}  {sec:4.0f}s/epoch  ~{eta/60:4.1f} min left", flush=True)

        print(f"\n>> [{k}/{n_var}] {name}", flush=True)
        res = [run_variant(v, data, nc, mean, std, a.epochs, a.batch, a.lr, 42 + s, device, progress)
               for s in range(a.seeds)]
        te_accs = [r[1] for r in res]
        row = dict(variant=name, group=v["group"], params=res[0][2],
                   val=float(np.mean([r[0] for r in res])),
                   test=float(np.mean(te_accs)), test_std=float(np.std(te_accs)),
                   seconds=time.time() - t0)
        rows.append(row)
        print(f"{name:34s} test {row['test']*100:6.2f}% (+/-{row['test_std']*100:.2f})  "
              f"val {row['val']*100:6.2f}%  params {row['params']:,}  {row['seconds']:.0f}s", flush=True)
        _dump(a, rows)


def _dump(a, rows):
    LOG_DIR.mkdir(exist_ok=True)
    base = next((r["test"] for r in rows if r["group"] == "baseline"), None)
    for r in rows:
        r["delta_pp"] = None if base is None else (r["test"] - base) * 100
    (LOG_DIR / f"ablation_{a.model}.json").write_text(encoding="utf-8", data=json.dumps(
        dict(model=a.model, epochs=a.epochs, seeds=a.seeds, rows=rows), indent=2))
    md = [f"| Variant | Group | Params | Val % | Test % | Change vs baseline (pp) |", "|---|---|---|---|---|---|"]
    for r in rows:
        sd = f" ±{r['test_std']*100:.2f}" if a.seeds > 1 else ""
        d = "" if r["delta_pp"] is None or r["group"] == "baseline" else f"{r['delta_pp']:+.2f}"
        md.append(f"| {r['variant']} | {r['group']} | {r['params']:,} | {r['val']*100:.2f} | "
                  f"{r['test']*100:.2f}{sd} | {d} |")
    (LOG_DIR / f"ablation_{a.model}.md").write_text("\n".join(md) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
