"""The torch-free NumPy forward passes must reproduce the published results.

    cd backend && python test_npmodels.py

Runs both checkpoints on the fixed 642-clip INCLUDE test split (seed 42) and
compares with ml/logs/comparison.json. If this passes, the server gives the same
answers with or without PyTorch installed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
import npmodels  # noqa: E402

paths = sorted((ROOT.parent / "ml" / "data" / "processed" / "include").glob("*.npy"))
if not paths:
    print("SKIP: no processed tensors in ml/data/processed/include")
    sys.exit(0)
labels = sorted({p.stem.split("__")[0] for p in paths})
y = [labels.index(p.stem.split("__")[0]) for p in paths]
_, tmp, _, ty = train_test_split(paths, y, test_size=0.30, stratify=y, random_state=42)
_, test, _, _ = train_test_split(tmp, ty, test_size=0.50, stratify=ty, random_state=42)
st = json.loads((ROOT / "models" / "preproc_stats.json").read_text())
mean, std = np.array(st["mean"], "float32"), np.array(st["std"], "float32")
sys.path.insert(0, str(ROOT.parent / "ml" / "scripts"))
from preprocess import canonicalize_pose  # noqa: E402
comp = json.loads((ROOT.parent / "ml" / "logs" / "comparison.json").read_text())
rep_p = ROOT.parent / "ml" / "logs" / "canonical_retrain_report.json"
canon_all = json.loads(rep_p.read_text())["models"] if rep_p.exists() else {}

fail = 0
for arch in ("cnn", "bilstm"):
    model, ck = npmodels.build(arch, ROOT / "models" / f"{arch}.pt")
    # A model retrained on canonical-position data (retrain_canonical.py) carries its own
    # statistics and expects canonicalised input; the original research checkpoints do not.
    canon_ref = canon_all.get(arch)
    canonical = bool(ck.get("mean") is not None and canon_ref and canon_ref.get("deployed"))
    m_, s_ = (np.array(ck["mean"], "float32"), np.array(ck["std"], "float32")) if canonical else (mean, std)
    X = np.stack([((canonicalize_pose(np.load(p)) if canonical else np.load(p)) - m_) / (s_ + 1e-6) for p in test]).astype("float32")
    Y = np.array([ck["labels"].index(p.stem.split("__")[0]) for p in test])
    pred = np.concatenate([model(X[i:i + 128]).argmax(1) for i in range(0, len(X), 128)])
    acc = float((pred == Y).mean())
    ref = canon_ref["test_acc"] if canonical else comp["models"][arch]["test_acc"]
    ok = abs(acc - ref) < 1e-9
    fail += not ok
    print(f"  {'PASS' if ok else 'FAIL'}  {arch}: numpy {acc:.4%} vs reported {ref:.4%} on {len(Y)} clips")
print(f"\n{2 - fail} passed, {fail} failed")
sys.exit(1 if fail else 0)
