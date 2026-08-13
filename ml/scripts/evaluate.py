"""Side-by-side evaluation of every trained model on the held-out test split.

Compares BiLSTM (mine), CNN (baseline / control), and Transformer (teammate's)
on the *same* test split produced by _train.make_splits, so the numbers are
directly comparable.

Outputs:
    logs/comparison.json      machine-readable metrics for every model
    logs/comparison.md        a table you can paste straight into the report
    logs/confusion_<arch>.png normalised confusion matrix per model

Run from the `ml/` directory:
    python scripts/evaluate.py
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix, top_k_accuracy_score
from torch.utils.data import DataLoader

from _train import DATA_ROOTS, collect_paths, make_splits
from dataset import LandmarkDataset, load_stats
from models import build, param_count

MODEL_DIR = Path("models")
LOG_DIR = Path("logs")
ARCHS = ["bilstm", "cnn", "transformer"]
PRETTY = {"bilstm": "BiLSTM", "cnn": "1D-CNN (baseline)", "transformer": "Transformer"}


def plot_confusion(cm: np.ndarray, labels: list[str], arch: str, out: Path) -> None:
    n = len(labels)
    fig, ax = plt.subplots(figsize=(max(6, n * 0.42), max(5, n * 0.38)), dpi=140)
    im = ax.imshow(cm, cmap="magma", vmin=0, vmax=1)
    ax.set_xticks(range(n), labels, rotation=90, fontsize=7)
    ax.set_yticks(range(n), labels, fontsize=7)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(f"{PRETTY.get(arch, arch)} — row-normalised confusion")
    fig.colorbar(im, ax=ax, fraction=0.046)
    fig.tight_layout()
    fig.savefig(out)
    plt.close(fig)


def main() -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    LOG_DIR.mkdir(exist_ok=True)

    with open(MODEL_DIR / "label_map.json") as f:
        label_list = json.load(f)
    mean, std = load_stats(MODEL_DIR / "preproc_stats.json")

    all_paths = collect_paths()
    _, _, test_p = make_splits(all_paths, label_list)

    ds = LandmarkDataset(
        [], label_list=label_list, augment=False, mean=mean, std=std, paths=test_p
    )
    dl = DataLoader(ds, batch_size=1, shuffle=False)
    print(f"-> test set: {len(test_p)} clips across {len(label_list)} classes")

    results: dict[str, dict] = {}

    for arch in ARCHS:
        ckpt_path = MODEL_DIR / f"{arch}.pt"
        if not ckpt_path.exists():
            print(f"-- {ckpt_path} not found, skipping")
            continue

        state = torch.load(ckpt_path, map_location=device, weights_only=False)
        model = build(arch, num_classes=len(label_list)).to(device)
        model.load_state_dict(state["model"])
        model.eval()

        preds, gts, probs, latencies = [], [], [], []
        with torch.no_grad():
            # warm-up so the first call's lazy init doesn't skew latency
            for xb, _ in dl:
                model(xb.to(device))
                break
            for xb, yb in dl:
                xb = xb.to(device)
                t0 = time.perf_counter()
                logits = model(xb)
                latencies.append((time.perf_counter() - t0) * 1000.0)
                probs.append(torch.softmax(logits, -1).cpu().numpy()[0])
                preds.append(int(logits.argmax(-1).item()))
                gts.append(int(yb.item()))

        preds_a, gts_a, probs_a = np.array(preds), np.array(gts), np.stack(probs)
        acc = float((preds_a == gts_a).mean())
        rep = classification_report(gts_a, preds_a, labels=list(range(len(label_list))),
                                    target_names=label_list, output_dict=True, zero_division=0)

        k = min(5, len(label_list))
        top_k = float(top_k_accuracy_score(gts_a, probs_a, k=k, labels=list(range(len(label_list)))))

        hist_path = LOG_DIR / f"{arch}_history.json"
        hist = json.load(open(hist_path)) if hist_path.exists() else {}

        results[arch] = {
            "name": PRETTY.get(arch, arch),
            "test_acc": acc,
            f"test_top{k}_acc": top_k,
            "val_acc_best": state.get("val_acc"),
            "macro_f1": rep["macro avg"]["f1-score"],
            "weighted_f1": rep["weighted avg"]["f1-score"],
            "params": state.get("params", param_count(model)),
            "latency_ms_mean": float(np.mean(latencies)),
            "latency_ms_p95": float(np.percentile(latencies, 95)),
            "train_wall_seconds": hist.get("train_wall_seconds"),
            "best_epoch": state.get("epoch"),
            "per_class_f1": {l: rep[l]["f1-score"] for l in label_list},
        }

        cm = confusion_matrix(gts_a, preds_a, labels=list(range(len(label_list))))
        cm_norm = cm / np.maximum(cm.sum(axis=1, keepdims=True), 1)
        plot_confusion(cm_norm, label_list, arch, LOG_DIR / f"confusion_{arch}.png")

        print(f"{PRETTY.get(arch, arch):<20s} acc {acc:.4f}  macroF1 {rep['macro avg']['f1-score']:.4f}  "
              f"top{k} {top_k:.4f}  {np.mean(latencies):.2f} ms  {results[arch]['params']:,} params")

    with open(LOG_DIR / "comparison.json", "w") as f:
        json.dump({"n_classes": len(label_list), "n_test": len(test_p),
                   "labels": label_list, "models": results}, f, indent=2)

    # --- markdown table for the report -------------------------------------
    k = min(5, len(label_list))
    lines = [
        f"# Model comparison — {len(label_list)} ISL classes, {len(test_p)} held-out test clips",
        "",
        f"| Model | Test acc | Top-{k} acc | Macro F1 | Params | Latency (ms) | Train time |",
        "|---|---|---|---|---|---|---|",
    ]
    for arch, r in results.items():
        tt = f"{r['train_wall_seconds']/60:.1f} min" if r.get("train_wall_seconds") else "—"
        lines.append(
            f"| {r['name']} | {r['test_acc']*100:.1f}% | {r[f'test_top{k}_acc']*100:.1f}% | "
            f"{r['macro_f1']:.3f} | {r['params']:,} | {r['latency_ms_mean']:.2f} | {tt} |"
        )

    if results:
        lines += ["", "## Weakest classes (macro F1, worst 10)", ""]
        for arch, r in results.items():
            worst = sorted(r["per_class_f1"].items(), key=lambda kv: kv[1])[:10]
            lines.append(f"**{r['name']}**: " + ", ".join(f"`{l}` {v:.2f}" for l, v in worst))
            lines.append("")

    (LOG_DIR / "comparison.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"OK wrote {LOG_DIR/'comparison.json'} and {LOG_DIR/'comparison.md'}")


if __name__ == "__main__":
    main()
