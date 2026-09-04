"""Export one reference tensor per class, for Practice-mode scoring.

The sign bank (build_sign_bank.py) stores 2-D screen coordinates for *drawing*.
Scoring needs the full (60, 225) tensor in the model's own feature space, so the
user's attempt and the reference are compared in exactly the representation the
recogniser uses.

Same exemplar selection as the sign bank — coverage-gated medoid — so the clip a
learner watches is the clip they are scored against.

Output: backend/models/practice_refs.npz
    labels : (N,)        class names
    refs   : (N, 60, 225) float16   reference tensors

float16 halves the file (7 MB → 3.5 MB) and costs ~1e-3 of precision, which is
far below the differences this scoring can meaningfully resolve.

    python scripts/build_practice_refs.py
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import numpy as np

from build_sign_bank import coverage, medoid

DATA = Path("data/processed/include")
OUT = Path("../backend/models/practice_refs.npz")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(DATA))
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    files = sorted(Path(args.data).glob("*.npy"))
    if not files:
        raise SystemExit(f"no tensors under {args.data} — run preprocess.py first")

    by_label: dict[str, list[Path]] = defaultdict(list)
    for f in files:
        by_label[f.stem.split("__")[0]].append(f)

    labels, refs = [], []
    for label in sorted(by_label):
        tensors = [np.load(p) for p in by_label[label]]
        cov = [coverage(t) for t in tensors]
        good = [i for i, c in enumerate(cov) if c >= 0.75] or \
               [i for i, c in enumerate(cov) if c >= 0.5] or [int(np.argmax(cov))]
        pick = medoid(tensors, candidates=good)
        labels.append(label)
        refs.append(tensors[pick].astype(np.float16))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, labels=np.array(labels), refs=np.stack(refs))
    print(f"OK {len(labels)} references -> {out}  ({out.stat().st_size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
