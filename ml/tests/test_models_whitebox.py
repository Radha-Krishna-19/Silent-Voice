"""White-box tests of the model code (structure and internals, not accuracy).

Run:  cd ml && python tests/test_models_whitebox.py
Needs only PyTorch, NumPy and scikit-learn; no dataset or checkpoints, except
WB-09, which compares the saved normalisation statistics with a recomputation
from the training split and is skipped when the data is not present.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _check import check, finish  # noqa: E402
from _train import make_splits  # noqa: E402
from dataset import _mirror, compute_stats  # noqa: E402
from models import build, param_count  # noqa: E402

torch.manual_seed(0)
x = torch.randn(4, 60, 225)

# WB-01 parameter counts match the architecture reported in the paper
bl, cn = build("bilstm", 261), build("cnn", 261)
check("WB-01", "BiLSTM has 2,665,477 trainable parameters", param_count(bl) == 2665477, str(param_count(bl)))
check("WB-02", "1D CNN has 736,773 trainable parameters", param_count(cn) == 736773, str(param_count(cn)))

# WB-03 forward shapes
for name, m in (("BiLSTM", bl), ("1D CNN", cn)):
    m.eval()
    check("WB-03", f"{name} maps (4, 60, 225) to (4, 261) logits", tuple(m(x).shape) == (4, 261))

# WB-04 every parameter receives a gradient (no disconnected layers)
for name, m in (("BiLSTM", bl), ("1D CNN", cn)):
    m.train()
    m.zero_grad()
    m(x).sum().backward()
    dead = [n for n, p in m.named_parameters() if p.grad is None or p.grad.abs().sum() == 0]
    check("WB-04", f"{name}: gradient reaches every parameter", not dead, ",".join(dead[:3]))

# WB-05 dropout is active only in train mode (eval is deterministic)
for name, m in (("BiLSTM", bl), ("1D CNN", cn)):
    m.eval()
    with torch.no_grad():
        same = torch.equal(m(x), m(x))
    m.train()
    with torch.no_grad():
        diff = not torch.equal(m(x), m(x))
    check("WB-05", f"{name}: eval mode deterministic, train mode stochastic (dropout)", same and diff)

# WB-06 BatchNorm running statistics are frozen in eval mode
cn.eval()
before = cn.features[0][1].running_mean.clone()
with torch.no_grad():
    cn(x * 10)
check("WB-06", "1D CNN BatchNorm running stats unchanged by eval-mode inference", torch.equal(before, cn.features[0][1].running_mean))

# WB-10 Transformer internals (the third architecture)
tf = build("transformer", 261)
check("WB-10", "Transformer has 460,677 trainable parameters", param_count(tf) == 460677, str(param_count(tf)))
tf.eval()
check("WB-10b", "Transformer maps (4, 60, 225) to (4, 261) logits", tuple(tf(x).shape) == (4, 261))
check("WB-10c", "positional table is a fixed buffer, not a trained parameter",
      "pos" in dict(tf.named_buffers()) and "pos" not in dict(tf.named_parameters()))
tf.train()
tf.zero_grad()
tf(x).sum().backward()
dead = [n for n, p in tf.named_parameters() if p.grad is None or p.grad.abs().sum() == 0]
check("WB-10d", "Transformer: gradient reaches every parameter (incl. CLS token)", not dead, ",".join(dead[:3]))
tf.eval()
with torch.no_grad():
    same = torch.equal(tf(x), tf(x))
    batch_vs_single = torch.allclose(tf(x)[1:2], tf(x[1:2]), atol=1e-5)
    # Positions matter: reversing time must change the output (the model is not a bag of frames).
    order_sensitive = not torch.allclose(tf(x), tf(torch.flip(x, dims=[1])), atol=1e-4)
check("WB-10e", "Transformer: eval mode deterministic", same)
check("WB-10f", "Transformer: a clip's output does not depend on the rest of the batch", batch_vs_single)
check("WB-10g", "Transformer: output depends on frame order (positional encoding in effect)", order_sensitive)

# WB-07 mirror augmentation is an involution and swaps the hands
a = np.random.RandomState(1).rand(60, 225).astype(np.float32)
mm = _mirror(_mirror(a))
check("WB-07", "dataset._mirror applied twice returns the original clip", np.allclose(mm, a, atol=1e-6))
check("WB-07b", "dataset._mirror moves left-hand features into the right-hand block",
      np.allclose(_mirror(a)[:, 63:126][:, 1::3], a[:, 0:63][:, 1::3]))

# WB-08 split logic: deterministic, disjoint, complete, stratified 70/15/15
labels = [f"c{i}" for i in range(20)]
paths = [Path(f"{l}__{k:04d}.npy") for l in labels for k in range(20)]
s1, s2 = make_splits(paths, labels), make_splits(paths, labels)
tr, va, te = (set(map(str, s)) for s in s1)
check("WB-08", "make_splits is deterministic (seed 42)", [list(map(str, s)) for s in s1] == [list(map(str, s)) for s in s2])
check("WB-08b", "train/val/test are disjoint and cover every clip", not (tr & va or tr & te or va & te) and len(tr | va | te) == len(paths))
check("WB-08c", "split sizes are 70/15/15", (len(tr), len(va), len(te)) == (280, 60, 60), f"{len(tr)}/{len(va)}/{len(te)}")
check("WB-08d", "every class appears in the test split (stratified)", {p.split("__")[0] for p in te} == set(labels))

# WB-09 normalisation statistics come from the training split only (no leakage)
with tempfile.TemporaryDirectory() as td:
    rs = np.random.RandomState(2)
    fs = []
    for i in range(6):
        p = Path(td) / f"x__{i}.npy"
        np.save(p, rs.rand(60, 225).astype(np.float32) + i)
        fs.append(p)
    mean, std = compute_stats(fs[:3])
    manual = np.concatenate([np.load(p) for p in fs[:3]]).mean(0)
    check("WB-09", "compute_stats uses exactly the files it is given", np.allclose(mean, manual, atol=1e-5))

stats = ML / "models" / "preproc_stats.json"
if not stats.exists():
    stats = ML.parent / "backend" / "models" / "preproc_stats.json"
data_dir = ML / "data" / "processed" / "include"
if stats.exists() and data_dir.exists() and any(data_dir.glob("*.npy")):
    import os
    os.chdir(ML)
    from _train import collect_paths
    lab = json.load(open(stats.parent / "label_map.json"))
    trp, _, _ = make_splits(collect_paths(), lab)
    m_tr, s_tr = compute_stats(trp)
    saved = json.load(open(stats))
    check("WB-09b", "saved preproc_stats.json equals statistics of the TRAIN split alone (no val/test leakage)",
          np.allclose(m_tr, np.array(saved["mean"]), atol=1e-4) and np.allclose(s_tr, np.array(saved["std"]), atol=1e-4))
else:
    print("  SKIP  [WB-09b] dataset/checkpoint stats not present")

finish()
