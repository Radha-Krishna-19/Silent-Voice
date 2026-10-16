"""Convert the stored INCLUDE tensors to canonical body position.

    cd ml
    python scripts/canonicalize_dataset.py

Reads data/processed/include/*.npy, writes data/processed/include_canon/*.npy
with the pose block moved/scaled to where the INCLUDE signers stand
(preprocess.canonicalize_pose). Same file names, so the seed-42 train/val/test
split is identical. Needs no videos and no MediaPipe run (~20 s). After this,
_train.py trains on include_canon automatically.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from preprocess import canonicalize_pose  # noqa: E402

SRC, DST = Path("data/processed/include"), Path("data/processed/include_canon")


def main() -> None:
    files = sorted(SRC.glob("*.npy"))
    if not files:
        raise SystemExit(f"no tensors in {SRC} (run from the ml/ folder)")
    DST.mkdir(parents=True, exist_ok=True)
    for i, f in enumerate(files, 1):
        np.save(DST / f.name, canonicalize_pose(np.load(f).astype(np.float32)))
        if i % 500 == 0 or i == len(files):
            print(f"   {i}/{len(files)}", flush=True)
    print(f"OK {len(files)} tensors -> {DST}")


if __name__ == "__main__":
    main()
