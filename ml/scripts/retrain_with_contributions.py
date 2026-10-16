"""Retrain on INCLUDE + contributed clips, check it, and hand it to the server.

    cd ml
    python scripts/retrain_with_contributions.py                  # CNN, 40 epochs
    python scripts/retrain_with_contributions.py --models cnn bilstm --epochs 60

Also launched by the "Retrain with contributions" button on the Contribute page
(POST /api/contribute/retrain), which tails logs/retrain.log.

Steps
  1. Ingest: any video in data/contributed_videos/ that has no tensor yet is run
     through the same MediaPipe extraction as INCLUDE.
  2. Train: _train.run() — contributions are in TRAIN only (see make_splits), so
     val/test are still the original INCLUDE clips.
  3. Evaluate on the fixed 642-clip INCLUDE test split.
  4. Deploy only if accuracy did not drop by more than --max-drop compared with
     the model currently being served (contributions must not make the model
     worse at what it already knew). The old checkpoint is backed up first.

The BiLSTM-vs-CNN research results (logs/comparison.json, ml/models/*.pt) are
NOT touched: retrained weights are written as <model>_contrib.pt.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ML = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ML.parent / "backend"))

BACKEND_MODELS = ML.parent / "backend" / "models"
LOGS = ML / "logs"


def log(msg: str) -> None:
    print(msg, flush=True)


def ingest() -> None:
    import contrib  # backend/contrib.py
    log("== 1/4  extracting skeletons from new contributed videos")
    res = contrib.ingest_pending()
    if not res:
        log("   nothing new to extract")
    for r in res:
        state = "added" if r["tensor_saved"] else f"skipped ({r.get('reason')})"
        log(f"   {r['slug']}/{r['video_file']}: {r['frames']} frames, hands in {r['hand_frames']} -> {state}")
    s = contrib.summary()
    log(f"   contributed training clips: {s['tensors']} across {len(s['words'])} word(s)")


def evaluate(arch: str, ckpt_path: Path) -> dict:
    import torch
    from _train import collect_paths, make_splits
    from models import build

    ck = torch.load(ckpt_path, map_location="cpu")
    labels = ck["labels"]
    if ck.get("mean") is not None:
        mean, std = np.array(ck["mean"], "float32"), np.array(ck["std"], "float32")
    else:                                   # older checkpoints: stats live beside them
        st = json.loads((BACKEND_MODELS / "preproc_stats.json").read_text())
        mean, std = np.array(st["mean"], "float32"), np.array(st["std"], "float32")
    all_paths = collect_paths()
    _, _, test_p = make_splits(all_paths, sorted({p.stem.split("__")[0] for p in all_paths}))
    m = build(arch, num_classes=len(labels))
    m.load_state_dict(ck["model"])
    m.eval()
    X = np.stack([(np.load(p) - mean) / (std + 1e-6) for p in test_p]).astype("float32")
    y = np.array([labels.index(p.stem.split("__")[0]) for p in test_p])
    with torch.no_grad():
        pred = torch.cat([m(torch.from_numpy(X[i:i + 128])).argmax(-1) for i in range(0, len(X), 128)]).numpy()
    return {"test_acc": float((pred == y).mean()), "test_clips": int(len(y)), "classes": len(labels)}


def current_acc(arch: str) -> float | None:
    """Accuracy of the model being served now, on the same test split."""
    served = BACKEND_MODELS / f"{arch}.pt"
    if not served.exists():
        return None
    try:
        return evaluate(arch, served)["test_acc"]
    except Exception as exc:   # e.g. an old checkpoint without embedded stats
        log(f"   (could not re-evaluate served {arch}: {exc}; using comparison.json)")
        try:
            comp = json.loads((LOGS / "comparison.json").read_text())
            return float(comp["models"][arch]["test_acc"])
        except Exception:
            return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=["cnn"], choices=["cnn", "bilstm"])
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--max-drop", type=float, default=0.03,
                    help="refuse to deploy if INCLUDE test accuracy falls by more than this")
    ap.add_argument("--force", action="store_true", help="deploy regardless of --max-drop")
    ap.add_argument("--skip-ingest", action="store_true")
    a = ap.parse_args()

    try:
        import torch  # noqa: F401
    except ImportError:
        sys.exit("PyTorch is needed for training: pip install torch  (then retry)")

    import os
    os.chdir(ML)                                   # _train.py uses ml/-relative paths
    t0 = time.time()
    if not a.skip_ingest:
        ingest()

    from _train import run
    report = {"started": time.strftime("%Y-%m-%d %H:%M:%S"), "models": {}}
    for arch in a.models:
        log(f"\n== 2/4  training {arch} on INCLUDE + contributions ({a.epochs} epochs)")
        before = current_acc(arch)
        run(arch, a.epochs, a.batch, a.lr, f"{arch}_contrib", patience=12,
            stats_file=f"preproc_stats_{arch}_contrib.json")

        log(f"\n== 3/4  evaluating {arch} on the fixed INCLUDE test split")
        new_ckpt = ML / "models" / f"{arch}_contrib.pt"
        ev = evaluate(arch, new_ckpt)
        log(f"   new: {ev['test_acc']:.2%} on {ev['test_clips']} clips, {ev['classes']} classes"
            + (f"   (served now: {before:.2%})" if before is not None else ""))

        ok = a.force or before is None or ev["test_acc"] >= before - a.max_drop
        entry = {**ev, "previous_test_acc": before, "deployed": False}
        log(f"\n== 4/4  deploy {arch}")
        if ok:
            backup = BACKEND_MODELS / "backup"
            backup.mkdir(parents=True, exist_ok=True)
            served = BACKEND_MODELS / f"{arch}.pt"
            if served.exists():
                dst = backup / f"{arch}_{time.strftime('%Y%m%dT%H%M%S')}.pt"
                shutil.copy2(served, dst)
                log(f"   backed up current model -> {dst.relative_to(ML.parent)}")
            shutil.copy2(new_ckpt, served)
            entry["deployed"] = True
            log(f"   deployed -> backend/models/{arch}.pt  (server reloads it automatically)")
        else:
            log(f"   NOT deployed: accuracy dropped more than {a.max_drop:.0%}. "
                "Review the contributed clips, or rerun with --force.")
        report["models"][arch] = entry

    report["minutes"] = round((time.time() - t0) / 60, 1)
    LOGS.mkdir(exist_ok=True)
    (LOGS / "retrain_report.json").write_text(json.dumps(report, indent=2))
    log(f"\nOK retrain finished in {report['minutes']} min -> logs/retrain_report.json")


if __name__ == "__main__":
    main()
