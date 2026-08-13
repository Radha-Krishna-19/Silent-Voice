"""Shared training loop used by train_bilstm.py / train_cnn.py / train_transformer.py.

Every model goes through this exact function, so the BiLSTM-vs-CNN-vs-Transformer
comparison is honest: identical split (seed 42), identical normalisation stats,
identical augmentation, identical optimiser schedule. The only variable is the
architecture returned by models.build().

Run from the `ml/` directory:
    python scripts/train_bilstm.py --epochs 60 --batch 32
"""
from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader

from dataset import LandmarkDataset, compute_stats, save_stats
from models import build, param_count

DATA_ROOTS = [Path("data/processed/include"), Path("data/processed/custom")]
MODEL_DIR = Path("models")
LOG_DIR = Path("logs")
SEED = 42


def set_seed(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def collect_paths() -> list[Path]:
    paths: list[Path] = []
    for r in DATA_ROOTS:
        if r.exists():
            paths.extend(sorted(r.glob("*.npy")))
    if not paths:
        raise SystemExit(
            f"No preprocessed tensors under {[str(r) for r in DATA_ROOTS]}.\n"
            "Run: python scripts/preprocess.py --videos <dataset> --out data/processed/include"
        )
    return paths


def make_splits(paths: list[Path], label_list: list[str]):
    """Stratified 70/15/15 train/val/test. Deterministic across every model."""
    y = [label_list.index(p.stem.split("__")[0]) for p in paths]
    train_p, tmp_p, _, tmp_y = train_test_split(
        paths, y, test_size=0.30, stratify=y, random_state=SEED
    )
    val_p, test_p, _, _ = train_test_split(
        tmp_p, tmp_y, test_size=0.50, stratify=tmp_y, random_state=SEED
    )
    return train_p, val_p, test_p


def run(model_name: str, epochs: int, batch: int, lr: float, out_name: str, patience: int = 20):
    set_seed()
    MODEL_DIR.mkdir(exist_ok=True)
    LOG_DIR.mkdir(exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"-> device: {device}")

    all_paths = collect_paths()
    label_list = sorted({p.stem.split("__")[0] for p in all_paths})
    train_p, val_p, test_p = make_splits(all_paths, label_list)
    print(f"-> train {len(train_p)} | val {len(val_p)} | test {len(test_p)} | classes {len(label_list)}")

    # Normalisation stats come from TRAIN ONLY — no leakage into val/test.
    mean, std = compute_stats(train_p)
    save_stats(mean, std, MODEL_DIR / "preproc_stats.json")

    def _ds(paths: list[Path], aug: bool) -> LandmarkDataset:
        d = LandmarkDataset([], label_list=label_list, augment=aug, mean=mean, std=std)
        d.paths = paths
        d.y = np.array([label_list.index(p.stem.split("__")[0]) for p in paths], dtype=np.int64)
        return d

    workers = 0 if device.type == "cpu" else 2
    train_dl = DataLoader(_ds(train_p, aug=True), batch_size=batch, shuffle=True,
                          num_workers=workers, drop_last=len(train_p) > batch)
    val_dl = DataLoader(_ds(val_p, aug=False), batch_size=batch, shuffle=False, num_workers=workers)

    model = build(model_name, num_classes=len(label_list)).to(device)
    print(f"-> {model_name}: {param_count(model):,} trainable params")

    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    loss_fn = torch.nn.CrossEntropyLoss(label_smoothing=0.05)

    best_val, best_epoch, history = 0.0, 0, []
    wall0 = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        t0, train_loss, seen = time.time(), 0.0, 0
        for xb, yb in train_dl:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad()
            loss = loss_fn(model(xb), yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            train_loss += loss.item() * xb.size(0)
            seen += xb.size(0)
        sched.step()

        model.eval()
        correct = total = 0
        val_loss = 0.0
        with torch.no_grad():
            for xb, yb in val_dl:
                xb, yb = xb.to(device), yb.to(device)
                logits = model(xb)
                val_loss += loss_fn(logits, yb).item() * xb.size(0)
                correct += (logits.argmax(-1) == yb).sum().item()
                total += yb.size(0)

        val_acc = correct / max(total, 1)
        epoch_s = time.time() - t0
        history.append({
            "epoch": epoch,
            "train_loss": train_loss / max(seen, 1),
            "val_loss": val_loss / max(total, 1),
            "val_acc": val_acc,
            "lr": sched.get_last_lr()[0],
            "seconds": epoch_s,
        })
        print(f"epoch {epoch:03d}  loss {train_loss/max(seen,1):.4f}  "
              f"val_loss {val_loss/max(total,1):.4f}  val_acc {val_acc:.4f}  ({epoch_s:.1f}s)")

        if val_acc > best_val:
            best_val, best_epoch = val_acc, epoch
            torch.save({
                "model": model.state_dict(),
                "labels": label_list,
                "arch": model_name,
                "val_acc": best_val,
                "epoch": epoch,
                "params": param_count(model),
            }, MODEL_DIR / f"{out_name}.pt")
        elif epoch - best_epoch >= patience:
            print(f"-> early stop: no val improvement for {patience} epochs")
            break

    with open(MODEL_DIR / "label_map.json", "w") as f:
        json.dump(label_list, f, indent=2)

    with open(LOG_DIR / f"{out_name}_history.json", "w") as f:
        json.dump({
            "arch": model_name,
            "best_val_acc": best_val,
            "best_epoch": best_epoch,
            "params": param_count(model),
            "train_wall_seconds": time.time() - wall0,
            "epochs_ran": len(history),
            "history": history,
        }, f, indent=2)

    print(f"OK best val_acc {best_val:.4f} @ epoch {best_epoch} -> {MODEL_DIR / (out_name + '.pt')}")
    return best_val


def cli(default_name: str, out_name: str):
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--patience", type=int, default=20)
    args = ap.parse_args()
    run(default_name, args.epochs, args.batch, args.lr, out_name, args.patience)
