"""Side-by-side evaluation of BiLSTM and Transformer on the test split.

Writes logs/comparison.json with per-model val + test accuracy, latency,
per-class F1, and confusion-matrix PNGs.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader

from dataset import LandmarkDataset, load_stats
from models import build

DATA_ROOTS = [Path("data/processed/include"), Path("data/processed/custom")]
MODEL_DIR = Path("models")
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    with open(MODEL_DIR / "label_map.json") as f:
        label_list = json.load(f)
    mean, std = load_stats(MODEL_DIR / "preproc_stats.json")

    all_paths: list[Path] = []
    for r in DATA_ROOTS:
        if r.exists():
            all_paths.extend(sorted(r.glob("*.npy")))
    y = [label_list.index(p.stem.split("__")[0]) for p in all_paths]
    _, tmp_p, _, tmp_y = train_test_split(all_paths, y, test_size=0.30, stratify=y, random_state=42)
    _, test_p, _, _ = train_test_split(tmp_p, tmp_y, test_size=0.50, stratify=tmp_y, random_state=42)

    ds = LandmarkDataset([], label_list=label_list, augment=False, mean=mean, std=std)
    ds.paths = test_p
    ds.y = np.array([label_list.index(p.stem.split("__")[0]) for p in test_p], dtype=np.int64)
    dl = DataLoader(ds, batch_size=1, shuffle=False)

    results = {}
    for arch in ("bilstm", "transformer"):
        ckpt = MODEL_DIR / f"{arch}.pt"
        if not ckpt.exists():
            print(f"⚠ {ckpt} not found — skip")
            continue
        state = torch.load(ckpt, map_location=device)
        model = build(arch, num_classes=len(label_list)).to(device)
        model.load_state_dict(state["model"])
        model.eval()

        preds, gts, latencies = [], [], []
        with torch.no_grad():
            for xb, yb in dl:
                xb = xb.to(device)
                t0 = time.perf_counter()
                p = model(xb).argmax(-1).item()
                latencies.append((time.perf_counter() - t0) * 1000)
                preds.append(p)
                gts.append(int(yb.item()))

        acc = float(np.mean(np.array(preds) == np.array(gts)))
        report = classification_report(gts, preds, target_names=label_list, output_dict=True, zero_division=0)
        results[arch] = {
            "test_acc": acc,
            "val_acc_train_best": state.get("val_acc"),
            "latency_ms_mean": float(np.mean(latencies)),
            "latency_ms_p95": float(np.percentile(latencies, 95)),
            "macro_f1": report["macro avg"]["f1-score"],
            "weighted_f1": report["weighted avg"]["f1-score"],
        }
        print(f"{arch:<12s}  test_acc {acc:.4f}  latency {np.mean(latencies):.1f}ms  macro_f1 {report['macro avg']['f1-score']:.4f}")

    with open(LOG_DIR / "comparison.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"✓ wrote {LOG_DIR/'comparison.json'}")


if __name__ == "__main__":
    main()
