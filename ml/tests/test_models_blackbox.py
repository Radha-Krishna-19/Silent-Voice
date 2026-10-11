"""Black-box tests of the trained models: inputs in, outputs checked, no internals.

Run:  cd ml && python tests/test_models_blackbox.py
Needs the trained checkpoints and the preprocessed INCLUDE tensors (both
git-ignored), so it runs on a developer machine rather than in CI.
Test cases follow equivalence classes and boundary values of the input space,
plus acceptance criteria taken from the project requirements.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import torch

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML / "scripts" / "tne"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _check import check, finish  # noqa: E402

try:
    from common import ARCHS, NAMES, data, load_model, norm, predict  # noqa: E402
    d = data()
except SystemExit as e:  # no checkpoints / data on this machine
    print(f"  SKIP  all black-box tests: {e}")
    sys.exit(0)

X, y = d["test"]
for a in ARCHS:
    n = NAMES[a]
    m = load_model(a)
    p = predict(m, norm(X))
    # BB-01 output contract
    check("BB-01", f"{n}: output is a probability distribution over 261 classes",
          p.shape == (len(X), 261) and np.allclose(p.sum(1), 1, atol=1e-4) and (p >= 0).all())
    # BB-02/03 acceptance criteria on held-out data
    acc = float((p.argmax(1) == y).mean())
    top5 = float(np.mean([y[i] in np.argsort(-p[i])[:5] for i in range(len(y))]))
    check("BB-02", f"{n}: top-1 accuracy on 642 held-out clips >= 90%", acc >= 0.90, f"{acc:.4f}")
    check("BB-03", f"{n}: top-5 accuracy >= 95%", top5 >= 0.95, f"{top5:.4f}")
    # BB-04 boundary: empty scene (no person detected -> all-zero landmarks)
    pz = predict(m, norm(np.zeros((1, 60, 225), np.float32)))
    check("BB-04", f"{n}: all-zero clip (nobody in frame) gives a valid, finite output", np.isfinite(pz).all() and abs(pz.sum() - 1) < 1e-4,
          f"top confidence {pz.max():.3f}")
    check("BB-04b", f"{n}: empty-scene confidence is below the 0.5 floor the live app uses, so nothing is captioned",
          pz.max() < 0.5, f"{pz.max():.3f}")
    # BB-05 boundary: only one hand visible
    one = X[:50].copy()
    one[:, :, 0:63] = 0
    po = predict(m, norm(one))
    check("BB-05", f"{n}: clips with the left hand missing still give valid outputs", np.isfinite(po).all())
    # BB-06 boundary: shorter and longer sequences than 60 frames
    ok = True
    for T in (30, 90):
        Xi = X[:8, np.linspace(0, 59, T).astype(int)]
        ok &= predict(m, norm(Xi)).shape == (8, 261)
    check("BB-06", f"{n}: accepts 30- and 90-frame sequences (variable length)", bool(ok))
    # BB-07 invalid input: wrong feature width is rejected
    try:
        with torch.no_grad():
            m(torch.zeros(1, 60, 224))
        rejected = False
    except Exception:
        rejected = True
    check("BB-07", f"{n}: input with 224 features instead of 225 is rejected", rejected)
    # BB-08 determinism and batch independence
    single = predict(m, norm(X[:5]), bs=1)
    batch = predict(m, norm(X[:5]), bs=5)
    check("BB-08", f"{n}: same clip gives the same output alone or in a batch", np.allclose(single, batch, atol=1e-5))
    # BB-09 latency acceptance criterion (project target: < 100 ms per window)
    xb = torch.from_numpy(norm(X[:1]))
    with torch.no_grad():
        m(xb)
        t = []
        for _ in range(30):
            t0 = time.perf_counter()
            m(xb)
            t.append((time.perf_counter() - t0) * 1000)
    check("BB-09", f"{n}: mean single-clip CPU latency < 100 ms", np.mean(t) < 100, f"{np.mean(t):.2f} ms")

finish()
