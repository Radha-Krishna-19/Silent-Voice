"""Shared helpers for the test-and-evaluation (T&E) suite.

Every script in this folder evaluates the *trained* checkpoints on the same
stratified split used for training (seed 42, 70/15/15), so its numbers are
directly comparable with logs/comparison.json.

Run from the repo's ml/ directory, e.g.:
    python scripts/tne/run_all.py
Results land in ml/logs/tne/ (JSON + PNG) together with a timestamped run log.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent
ML = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

from _train import collect_paths, make_splits  # noqa: E402
from dataset import load_stats, _mirror  # noqa: E402
from models import build  # noqa: E402

OUT = ML / "logs" / "tne"
ARCHS = ("bilstm", "cnn")
NAMES = {"bilstm": "BiLSTM", "cnn": "1D CNN"}
SEED = 42


def model_dir() -> Path:
    env = os.environ.get("SV_MODEL_DIR")
    cands = [Path(env)] if env else []
    # The served checkpoints (backend/models) first, so results describe what the app runs.
    cands += [ML.parent / "backend" / "models", ML / "models"]
    for c in cands:
        if all((c / f).exists() for f in ("cnn.pt", "bilstm.pt", "label_map.json", "preproc_stats.json")):
            return c
    raise SystemExit(f"No checkpoints found in {[str(c) for c in cands]}")


def setup() -> None:
    os.chdir(ML)  # _train.collect_paths uses paths relative to ml/
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    torch.set_num_threads(int(os.environ.get("SV_THREADS", "2")))
    OUT.mkdir(parents=True, exist_ok=True)


_DATA = {}


def data():
    """labels, mean, std, and the (X, y) arrays for train/val/test (raw, un-normalised)."""
    if _DATA:
        return _DATA
    setup()
    md = model_dir()
    labels = json.load(open(md / "label_map.json"))
    mean, std = load_stats(md / "preproc_stats.json")
    tr, va, te = make_splits(collect_paths(), labels)

    def load(paths):
        X = np.stack([np.load(p).astype(np.float32) for p in paths])
        y = np.array([labels.index(p.stem.split("__")[0]) for p in paths])
        return X, y

    _DATA.update(labels=labels, mean=mean, std=std, live=std > 1e-3,
                 train=load(tr), val=load(va), test=load(te),
                 paths={"train": tr, "val": va, "test": te})
    return _DATA


def norm(X: np.ndarray) -> np.ndarray:
    d = data()
    return (X - d["mean"]) / (d["std"] + 1e-6)


def load_model(arch: str) -> torch.nn.Module:
    st = torch.load(model_dir() / f"{arch}.pt", map_location="cpu", weights_only=False)
    m = build(arch, len(data()["labels"]))
    m.load_state_dict(st["model"])
    m.eval()
    return m


@torch.no_grad()
def predict(m: torch.nn.Module, Xn: np.ndarray, bs: int = 128) -> np.ndarray:
    """Softmax probabilities for already-normalised inputs."""
    m.eval()
    out = [m(torch.from_numpy(np.ascontiguousarray(Xn[i:i + bs]))).softmax(1).numpy() for i in range(0, len(Xn), bs)]
    return np.concatenate(out)


def acc(p: np.ndarray, y: np.ndarray) -> float:
    return float((p.argmax(1) == y).mean())


def _git() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ML, stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return "unknown"


def save(name: str, results: dict) -> Path:
    meta = {
        "script": f"scripts/tne/{name}.py",
        "run_at": _dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "git_commit": _git(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "platform": platform.platform(),
        "n_test": int(len(data()["test"][1])),
        "seed": SEED,
    }
    path = OUT / f"{name}.json"
    json.dump({"meta": meta, "results": results}, open(path, "w"), indent=1)
    print(f"-> wrote {path.relative_to(ML)}")
    return path


def plt():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as p
    p.rcParams.update({"font.family": "serif", "font.size": 8, "axes.spines.top": False,
                       "axes.spines.right": False, "axes.linewidth": .6})
    return p


COLORS = {"bilstm": "#1f6fb2", "cnn": "#d97a1c"}
