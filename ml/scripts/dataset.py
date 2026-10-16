"""Shared PyTorch Dataset for preprocessed landmark tensors."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset


# The mirror transform lives in preprocess.py (no torch dependency, so the web
# server can use it for left-handed signers). Re-exported under the old name.
from preprocess import mirror_sequence as _mirror  # noqa: E402,F401


class LandmarkDataset(Dataset):
    """Reads .npy tensors of shape (T, 225) written by preprocess.py.

    Applies train-time augmentations (jitter, frame-drop, mirror) if augment=True.
    """

    def __init__(
        self,
        roots: list[Path] | list[str],
        label_list: list[str] | None = None,
        augment: bool = False,
        mean: np.ndarray | None = None,
        std: np.ndarray | None = None,
        paths: list[Path] | None = None,
    ) -> None:
        # Two ways to build the set:
        #   roots=[dir, ...]  -> glob every .npy underneath (used by verify_setup)
        #   paths=[file, ...] -> an explicit, already-split file list
        # The split-aware callers (_train.py, evaluate.py) need the second form:
        # they compute a stratified train/val/test split first and must hand the
        # exact member files in, not a directory that would re-glob all of them.
        if paths is not None:
            self.paths = [Path(p) for p in paths]
        else:
            self.paths = []
            for r in [Path(x) for x in roots]:
                self.paths.extend(sorted(r.glob("*.npy")))
        if not self.paths:
            raise FileNotFoundError(
                f"No .npy tensors found (roots={list(roots)}, paths={'None' if paths is None else len(paths)})"
            )

        labels = [p.stem.split("__")[0] for p in self.paths]
        if label_list is None:
            label_list = sorted(set(labels))
        self.label_to_idx = {l: i for i, l in enumerate(label_list)}
        self.labels = label_list
        self.y = np.array([self.label_to_idx[l] for l in labels], dtype=np.int64)

        self.augment = augment
        self.mean = mean
        self.std = std

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, i: int):
        x = np.load(self.paths[i]).astype(np.float32)  # (T, 225)

        if self.augment:
            # Gaussian jitter on coordinates
            x = x + np.random.normal(0, 0.01, x.shape).astype(np.float32)

            # Random frame drop (simulates dropped webcam frames / MediaPipe misses)
            drop = np.random.random(x.shape[0]) < 0.10
            x[drop] = 0

            # Random temporal shift (sign may start slightly early/late in the window)
            shift = np.random.randint(-4, 5)
            if shift:
                x = np.roll(x, shift, axis=0)
                if shift > 0:
                    x[:shift] = 0
                else:
                    x[shift:] = 0

            # Horizontal mirror — left- vs right-handed signers
            if np.random.random() < 0.5:
                x = _mirror(x)

        if self.mean is not None and self.std is not None:
            x = (x - self.mean) / (self.std + 1e-6)

        return torch.from_numpy(x), int(self.y[i])


def compute_stats(paths: list[Path]) -> tuple[np.ndarray, np.ndarray]:
    """Per-feature mean/std over the given tensors, computed in a single
    streaming pass so RAM stays flat regardless of dataset size.

    Call this with the TRAIN paths only — using val/test here leaks statistics.
    """
    n = 0
    total = None
    total_sq = None
    for p in paths:
        a = np.load(p).astype(np.float64)  # (T, 225)
        if total is None:
            total = np.zeros(a.shape[1], dtype=np.float64)
            total_sq = np.zeros(a.shape[1], dtype=np.float64)
        total += a.sum(0)
        total_sq += (a ** 2).sum(0)
        n += a.shape[0]

    if total is None or n == 0:
        raise ValueError("compute_stats got no tensors")

    mean = total / n
    var = np.maximum(total_sq / n - mean ** 2, 0.0)
    return mean.astype(np.float32), np.sqrt(var).astype(np.float32)


def save_stats(mean: np.ndarray, std: np.ndarray, path: Path) -> None:
    with open(path, "w") as f:
        json.dump({"mean": mean.tolist(), "std": std.tolist()}, f)


def load_stats(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with open(path) as f:
        d = json.load(f)
    return np.array(d["mean"], dtype=np.float32), np.array(d["std"], dtype=np.float32)
