"""Shared PyTorch Dataset for preprocessed landmark tensors."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset


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
            # Gaussian jitter
            x = x + np.random.normal(0, 0.01, x.shape).astype(np.float32)
            # Random frame drop
            keep = np.random.random(x.shape[0]) > 0.1
            if keep.any():
                x[~keep] = 0
            # Horizontal mirror (swap hands + negate x)
            if np.random.random() < 0.5:
                left = x[:, 0:63].copy()
                right = x[:, 63:126].copy()
                x[:, 0:63] = right
                x[:, 63:126] = left
                x[:, 0::3] *= -1  # flip x coordinate across every 3rd column

        if self.mean is not None and self.std is not None:
            x = (x - self.mean) / (self.std + 1e-6)

        return torch.from_numpy(x), int(self.y[i])


def compute_stats(paths: list[Path]) -> tuple[np.ndarray, np.ndarray]:
    """Compute per-feature mean/std across all tensors."""
    arrs = [np.load(p) for p in paths]
    stacked = np.concatenate(arrs, axis=0)  # (T_total, 225)
    return stacked.mean(0), stacked.std(0)


def save_stats(mean: np.ndarray, std: np.ndarray, path: Path) -> None:
    with open(path, "w") as f:
        json.dump({"mean": mean.tolist(), "std": std.tolist()}, f)


def load_stats(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with open(path) as f:
        d = json.load(f)
    return np.array(d["mean"], dtype=np.float32), np.array(d["std"], dtype=np.float32)
