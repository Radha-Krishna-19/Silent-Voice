"""Storage for user-contributed sign recordings (the /contribute feature).

Kept apart from server.py so it can be tested without MediaPipe/PyTorch.
Contributions are only written to disk with a manifest line for human review;
nothing here retrains a model.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import numpy as np


def slug(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (label or "").strip().lower()).strip("_")
    return s or "unlabeled"


def save_contribution(contrib_dir: Path, label: str, frames: list) -> dict:
    """Persist one raw (unnormalised) recording; never overwrites an earlier clip."""
    sl = slug(label)
    out_dir = Path(contrib_dir) / sl
    out_dir.mkdir(parents=True, exist_ok=True)

    arr = np.stack(frames)   # (n_frames, 225) — same per-frame layout as preprocess.py
    stamp = time.strftime("%Y%m%dT%H%M%S")
    fname = f"{stamp}_{len(frames)}f.npy"
    n = 1
    while (out_dir / fname).exists():          # two clips in the same second
        n += 1
        fname = f"{stamp}_{len(frames)}f_{n}.npy"
    np.save(out_dir / fname, arr)

    with (out_dir / "manifest.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({
            "file": fname, "label": label, "slug": sl,
            "frame_count": len(frames), "collected_at": stamp,
        }) + "\n")

    return {"saved": True, "slug": sl, "file": fname, "frame_count": len(frames)}
