"""Shared PyTorch Dataset for preprocessed landmark tensors."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset


# MediaPipe Pose: (left, right) landmark index pairs that must swap when mirrored.
_POSE_SWAP = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16),
              (17, 18), (19, 20), (21, 22), (23, 24), (25, 26), (27, 28), (29, 30), (31, 32)]


def _mirror(x: np.ndarray) -> np.ndarray:
    """Mirror a (T, 225) landmark sequence about the vertical axis.

    Hands (cols 0:126) are wrist-origin normalised and centred on 0, so mirroring
    is a plain sign flip of x plus a left<->right swap. Pose (cols 126:225) is in
    raw normalised image space [0, 1], so it mirrors about 0.5 and its left/right
    joint indices must be swapped too — negating it would push it out of range.
    """
    out = x.copy()

    left, right = out[:, 0:63].copy(), out[:, 63:126].copy()
    out[:, 0:63], out[:, 63:126] = right, left
    out[:, 0:126:3] *= -1.0  # flip x on both hands

    pose = out[:, 126:225].reshape(-1, 33, 3)
    pose[:, :, 0] = 1.0 - pose[:, :, 0]
    for a, b in _POSE_SWAP:
        pose[:, [a, b]] = pose[:, [b, a]]
    out[:, 126:225] = pose.reshape(len(out), 99)

    return out


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
    ) -> None:
        roots = [Path(r) for r in roots]
        self.paths: list[Path] = []
        for r in roots:
            self.paths.extend(sorted(r.glob("*.npy")))
        if not self.paths:
            raise FileNotFoundError(f"No .npy tensors found under {roots}")

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
