"""Torch-free inference for the trained CNN and BiLSTM checkpoints.

Why this exists: the live demo should not depend on a ~800 MB PyTorch install
just to run two small forward passes. This module

  * reads a `torch.save` checkpoint (a zip of pickled metadata + raw tensor
    storages) WITHOUT importing torch, and
  * re-implements the forward pass of `CNN1DClassifier` and `BiLSTMClassifier`
    (ml/scripts/models.py) in NumPy, in eval mode (BatchNorm uses running
    stats, dropout is identity).

inference.py uses torch when it is installed and falls back to this otherwise.
tests: backend/test_npmodels.py checks it reproduces the reported test accuracy.
"""
from __future__ import annotations

import pickle
import zipfile
from collections import OrderedDict
from pathlib import Path

import numpy as np

# --------------------------------------------------------------------------- #
# checkpoint loading (no torch)
# --------------------------------------------------------------------------- #
_DTYPES = {
    "FloatStorage": np.float32, "DoubleStorage": np.float64, "HalfStorage": np.float16,
    "LongStorage": np.int64, "IntStorage": np.int32, "ShortStorage": np.int16,
    "CharStorage": np.int8, "ByteStorage": np.uint8, "BoolStorage": np.bool_,
}


class _StorageType:
    def __init__(self, name: str):
        self.dtype = _DTYPES.get(name, np.float32)


def _rebuild_tensor(storage, offset, size, stride, *_args):
    arr, = storage
    if not size:
        return arr[offset].copy() if arr.size else np.zeros((), arr.dtype)
    itemsize = arr.itemsize
    return np.lib.stride_tricks.as_strided(
        arr[offset:], shape=tuple(size), strides=tuple(s * itemsize for s in stride)).copy()


def _rebuild_parameter(data, *_args):
    return data


class _Unpickler(pickle.Unpickler):
    def __init__(self, fh, zf: zipfile.ZipFile, prefix: str):
        super().__init__(fh)
        self.zf, self.prefix = zf, prefix

    def find_class(self, module, name):
        if module == "torch._utils" and name == "_rebuild_tensor_v2":
            return _rebuild_tensor
        if module == "torch._utils" and name == "_rebuild_parameter":
            return _rebuild_parameter
        if module == "torch" and name.endswith("Storage"):
            return _StorageType(name)
        if module == "collections" and name == "OrderedDict":
            return OrderedDict
        if module.startswith("torch"):
            # dtypes / devices etc. — nothing we need the value of
            return lambda *a, **k: None
        return super().find_class(module, name)

    def persistent_load(self, pid):
        # ('storage', storage_type, key, location, numel)
        _, stype, key, _loc, _numel = pid
        dtype = stype.dtype if isinstance(stype, _StorageType) else np.float32
        raw = self.zf.read(f"{self.prefix}/data/{key}")
        return (np.frombuffer(raw, dtype=dtype),)


def load_checkpoint(path: Path) -> dict:
    with zipfile.ZipFile(path) as zf:
        pkl = next(n for n in zf.namelist() if n.endswith("data.pkl"))
        prefix = pkl.rsplit("/", 1)[0]
        with zf.open(pkl) as fh:
            return _Unpickler(fh, zf, prefix).load()


# --------------------------------------------------------------------------- #
# layers
# --------------------------------------------------------------------------- #
def _erf(x):
    # Abramowitz & Stegun 7.1.26, |err| < 1.5e-7 — plenty for a classifier.
    s = np.sign(x)
    a = np.abs(x)
    t = 1.0 / (1.0 + 0.3275911 * a)
    y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
               + 0.254829592) * t * np.exp(-a * a)
    return s * y


def _gelu(x):
    return 0.5 * x * (1.0 + _erf(x / np.sqrt(2.0)))


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _conv1d(x, w, b, pad):
    """x (B, Cin, T), w (Cout, Cin, K) -> (B, Cout, T)."""
    B, C, T = x.shape
    K = w.shape[2]
    xp = np.pad(x, ((0, 0), (0, 0), (pad, pad)))
    cols = np.stack([xp[:, :, k:k + T] for k in range(K)], axis=3)       # B, C, T, K
    return np.einsum("bctk,ock->bot", cols, w, optimize=True) + b[None, :, None]


def _bn(x, sd, p, eps=1e-5):
    g, b = sd[p + ".weight"], sd[p + ".bias"]
    m, v = sd[p + ".running_mean"], sd[p + ".running_var"]
    return (x - m[None, :, None]) / np.sqrt(v[None, :, None] + eps) * g[None, :, None] + b[None, :, None]


def _maxpool2(x):
    T = x.shape[2] // 2 * 2
    return x[:, :, :T].reshape(x.shape[0], x.shape[1], -1, 2).max(axis=3)


def _linear(x, sd, p):
    return x @ sd[p + ".weight"].T + sd[p + ".bias"]


# --------------------------------------------------------------------------- #
# models
# --------------------------------------------------------------------------- #
class NumpyCNN:
    def __init__(self, sd: dict):
        self.sd = {k: v.astype(np.float32) for k, v in sd.items()}

    def __call__(self, x: np.ndarray) -> np.ndarray:            # (B, T, 225) -> logits
        sd = self.sd
        z = x.transpose(0, 2, 1).astype(np.float32)
        for i, pool in ((0, True), (1, True), (2, False)):
            w = sd[f"features.{i}.0.weight"]
            z = _conv1d(z, w, sd[f"features.{i}.0.bias"], w.shape[2] // 2)
            z = _gelu(_bn(z, sd, f"features.{i}.1"))
            if pool:
                z = _maxpool2(z)
        h = np.concatenate([z.mean(axis=2), z.max(axis=2)], axis=1)
        h = _gelu(_linear(h, sd, "head.0"))
        return _linear(h, sd, "head.3")


class NumpyBiLSTM:
    def __init__(self, sd: dict):
        self.sd = {k: v.astype(np.float32) for k, v in sd.items()}
        self.layers = 1 + max(int(k.split("_l")[1].split("_")[0]) for k in sd if k.startswith("lstm.weight_ih_l"))

    def _run(self, x, layer, reverse):
        sfx = f"_l{layer}" + ("_reverse" if reverse else "")
        sd = self.sd
        Wi, Wh = sd["lstm.weight_ih" + sfx], sd["lstm.weight_hh" + sfx]
        b = sd["lstm.bias_ih" + sfx] + sd["lstm.bias_hh" + sfx]
        B, T, _ = x.shape
        H = Wh.shape[1]
        h = np.zeros((B, H), np.float32)
        c = np.zeros((B, H), np.float32)
        xi = x @ Wi.T + b                                       # B, T, 4H
        out = np.zeros((B, T, H), np.float32)
        steps = range(T - 1, -1, -1) if reverse else range(T)
        for t in steps:
            g = xi[:, t] + h @ Wh.T
            i, f, gg, o = np.split(g, 4, axis=1)                # PyTorch gate order
            c = _sigmoid(f) * c + _sigmoid(i) * np.tanh(gg)
            h = _sigmoid(o) * np.tanh(c)
            out[:, t] = h
        return out

    def __call__(self, x: np.ndarray) -> np.ndarray:
        z = x.astype(np.float32)
        for layer in range(self.layers):
            z = np.concatenate([self._run(z, layer, False), self._run(z, layer, True)], axis=2)
        h = z.mean(axis=1)
        h = _gelu(_linear(h, self.sd, "head.0"))
        return _linear(h, self.sd, "head.3")


def build(name: str, ckpt_path: Path):
    ck = load_checkpoint(ckpt_path)
    sd = ck["model"] if isinstance(ck, dict) and "model" in ck else ck
    if name == "cnn":
        return NumpyCNN(sd), ck
    if name == "bilstm":
        return NumpyBiLSTM(sd), ck
    raise ValueError(f"no NumPy implementation for {name}")


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)
