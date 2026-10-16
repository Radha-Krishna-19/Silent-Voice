"""Retrain the recognisers on canonical-position data and deploy if better.

    cd ml
    python scripts/retrain_canonical.py                 # CNN, 60 epochs (~5 min CPU)
    python scripts/retrain_canonical.py --models cnn bilstm   # BiLSTM adds ~30 min

Why: the shipped models were trained on raw pose, where INCLUDE signers stand far
from the camera. The server now moves every live signer to that same position
(preprocess.canonicalize_pose); a model trained on already-canonical data fits it
properly (the old model loses ~8 points on clean clips under canonicalisation,
though it is far better than raw on a webcam: 87% vs ~1%).

Steps: canonicalise the stored tensors -> train (no augmentation, as before) ->
evaluate on the SAME 642 test clips -> deploy to backend/models/ if it is at least
as accurate as the model being served (old one backed up). The checkpoint carries
its own normalisation statistics, so other models are unaffected.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ML = HERE.parent
BACKEND_MODELS = ML.parent / "backend" / "models"


def log(m):
    print(m, flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", default=["cnn"], choices=["cnn", "bilstm"])
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--force", action="store_true", help="deploy even if not more accurate")
    a = ap.parse_args()
    try:
        import torch  # noqa: F401
    except ImportError:
        sys.exit("PyTorch is needed for training: pip install torch")
    os.chdir(ML)
    t0 = time.time()

    log("== 1/4  canonicalising the stored tensors")
    subprocess.run([sys.executable, str(HERE / "canonicalize_dataset.py")], check=True)

    # import AFTER the folder exists so _train picks include_canon
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(ML.parent / "backend"))
    import importlib
    import _train
    importlib.reload(_train)
    from retrain_with_contributions import current_acc, evaluate

    rp = ML / "logs" / "canonical_retrain_report.json"
    report = {"started": time.strftime("%Y-%m-%d %H:%M:%S"), "models": {}}
    if rp.exists():                       # keep earlier models' results (e.g. cnn when now running bilstm)
        try:
            report["models"] = json.loads(rp.read_text(encoding="utf-8")).get("models", {})
        except Exception:
            pass
    for arch in a.models:
        before = current_acc(arch)          # served model, scored on the canonical test clips
        log(f"\n== 2/4  training {arch} on canonical data ({a.epochs} epochs, no augmentation)")
        _train.run(arch, a.epochs, a.batch, a.lr, f"{arch}_canon", patience=15, augment=False,
                   stats_file=f"preproc_stats_{arch}_canon.json")
        log(f"\n== 3/4  evaluating {arch} on the fixed INCLUDE test split")
        new = ML / "models" / f"{arch}_canon.pt"
        ev = evaluate(arch, new)
        log(f"   new: {ev['test_acc']:.2%} on {ev['test_clips']} clips"
            + (f"   served model on the same canonical clips: {before:.2%}" if before is not None else ""))
        ok = a.force or before is None or ev["test_acc"] >= before
        entry = {**ev, "served_before": before, "deployed": False}
        log(f"\n== 4/4  deploy {arch}")
        if ok:
            bk = BACKEND_MODELS / "backup"
            bk.mkdir(parents=True, exist_ok=True)
            served = BACKEND_MODELS / f"{arch}.pt"
            if served.exists():
                shutil.copy2(served, bk / f"{arch}_{time.strftime('%Y%m%dT%H%M%S')}_rawpose.pt")
            shutil.copy2(new, served)
            entry["deployed"] = True
            log(f"   deployed -> backend/models/{arch}.pt (old one backed up; the server reloads on restart)")
        else:
            log("   NOT deployed: not more accurate than the served model. Use --force to override.")
        report["models"][arch] = entry
    report["minutes"] = round((time.time() - t0) / 60, 1)
    (ML / "logs").mkdir(exist_ok=True)
    (ML / "logs" / "canonical_retrain_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"\nOK finished in {report['minutes']} min -> logs/canonical_retrain_report.json")


if __name__ == "__main__":
    main()
