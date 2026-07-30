"""Shared training loop used by train_bilstm.py and train_transformer.py."""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader

from dataset import LandmarkDataset, compute_stats, save_stats
from models import build

DATA_ROOTS = [Path("data/processed/include"), Path("data/processed/custom")]
MODEL_DIR = Path("models")
MODEL_DIR.mkdir(exist_ok=True)


def run(model_name: str, epochs: int, batch: int, lr: float, out_name: str):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"→ device: {device}")

    # Collect all paths and stratified-split into train/val/test
    all_paths: list[Path] = []
    for r in DATA_ROOTS:
        if r.exists():
            all_paths.extend(sorted(r.glob("*.npy")))
    if not all_paths:
        raise SystemExit(f"No preprocessed tensors under {DATA_ROOTS}. Run preprocess.py first.")

    labels = [p.stem.split("__")[0] for p in all_paths]
    label_list = sorted(set(labels))
    y = [label_list.index(l) for l in labels]

    train_p, tmp_p, _, tmp_y = train_test_split(all_paths, y, test_size=0.30, stratify=y, random_state=42)
    val_p, test_p, _, _ = train_test_split(tmp_p, tmp_y, test_size=0.50, stratify=tmp_y, random_state=42)

    print(f"→ train: {len(train_p)}  val: {len(val_p)}  test: {len(test_p)}  labels: {len(label_list)}")

    mean, std = compute_stats(train_p)
    save_stats(mean, std, MODEL_DIR / "preproc_stats.json")

    def _ds(paths, aug):
        d = LandmarkDataset([], label_list=label_list, augment=aug, mean=mean, std=std)
        d.paths = paths
        d.y = np.array([label_list.index(p.stem.split("__")[0]) for p in paths], dtype=np.int64)
        return d

    train_dl = DataLoader(_ds(train_p, aug=True), batch_size=batch, shuffle=True, num_workers=2, drop_last=True)
    val_dl = DataLoader(_ds(val_p, aug=False), batch_size=batch, shuffle=False, num_workers=2)

    model = build(model_name, num_classes=len(label_list)).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    loss_fn = torch.nn.CrossEntropyLoss(label_smoothing=0.05)

    best_val = 0.0
    for epoch in range(1, epochs + 1):
        model.train()
        t0 = time.time()
        train_loss = 0.0
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            train_loss += loss.item() * xb.size(0)
        sched.step()

        # validate
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for xb, yb in val_dl:
                xb, yb = xb.to(device), yb.to(device)
                pred = model(xb).argmax(-1)
                correct += (pred == yb).sum().item()
                total += yb.size(0)
        val_acc = correct / max(total, 1)
        print(f"epoch {epoch:03d}  loss {train_loss/len(train_dl.dataset):.4f}  val_acc {val_acc:.4f}  ({time.time()-t0:.1f}s)")

        if val_acc > best_val:
            best_val = val_acc
            torch.save({
                "model": model.state_dict(),
                "labels": label_list,
                "arch": model_name,
                "val_acc": best_val,
            }, MODEL_DIR / f"{out_name}.pt")

    with open(MODEL_DIR / "label_map.json", "w") as f:
        json.dump(label_list, f)

    print(f"✓ best val_acc {best_val:.4f} → {MODEL_DIR / (out_name + '.pt')}")


def cli(default_name: str, out_name: str):
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    args = ap.parse_args()
    run(default_name, args.epochs, args.batch, args.lr, out_name)
