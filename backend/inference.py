"""Model loader + predictor.

Any of `backend/models/{bilstm,cnn,transformer}.pt` that exist are loaded on
FastAPI boot and used for real inference. The set is driven by ARCHS below, not
hardcoded at each call site, so adding a teammate's architecture is a one-word
change here plus an entry in ml/scripts/models.py build().

Otherwise, a mock predictor is used so the whole app remains usable.
The web UI never breaks when models are absent.
"""
from __future__ import annotations

import json
import logging
import random
import time
from pathlib import Path

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "models"
MOCK_VOCAB = [
    "HELLO", "THANK YOU", "PLEASE", "YES", "NO", "HELP",
    "WATER", "DOCTOR", "PAIN", "HOSPITAL", "MEDICINE",
    "MY NAME IS", "HOW ARE YOU", "I LOVE YOU",
]

# Architectures the server can serve. Must match ml/scripts/models.py build().
ARCHS = ("bilstm", "cnn", "transformer")
DEFAULT_ARCH = "cnn"          # best model: 94.55% test vs BiLSTM 91.74%

_state: dict = {a: None for a in ARCHS}
_state["labels"] = None
_state["mean"] = None
_state["std"] = None
_state["backend"] = None      # "torch" | "numpy" | None (mock)
_state["meta"] = {}           # per model: labels + normalisation stats it was trained with


def labels_for(name: str) -> list:
    m = _state["meta"].get(name)
    return list(m["labels"]) if m else list(_state["labels"] or [])


def _stats_for(name: str, ckpt: dict):
    """Normalisation stats a model was trained with. Retraining with
    contributions recomputes them, so each checkpoint may have its own."""
    import numpy as np
    if isinstance(ckpt, dict) and ckpt.get("mean") is not None:
        return np.asarray(ckpt["mean"], "float32"), np.asarray(ckpt["std"], "float32")
    for f in (MODELS_DIR / f"preproc_stats_{name}.json", MODELS_DIR / "preproc_stats.json"):
        if f.exists():
            st = json.loads(f.read_text())
            return np.array(st["mean"], "float32"), np.array(st["std"], "float32")
    return None, None


def _reset() -> None:
    for a in ARCHS:
        _state[a] = None
    _state.update(labels=None, mean=None, std=None, backend=None, meta={})


def load_models() -> None:
    """(Re)load every checkpoint in backend/models/. Safe to call again after a
    retrain — the Contribute page does exactly that."""
    _reset()
    label_map = MODELS_DIR / "label_map.json"
    if not label_map.exists():
        logger.warning("%s missing -> mock predictor active", label_map)
        return
    try:
        with open(label_map) as f:
            _state["labels"] = json.load(f)
    except Exception as exc:
        logger.warning("failed to load label_map: %s", exc)
        return

    # Per-feature mean/std the models were trained with (ml/scripts/_train.py).
    # Inputs must be standardised the same way at inference: without it the
    # models get 1-2 of 261 reference recordings right instead of 256-261.
    import numpy as np
    stats = MODELS_DIR / "preproc_stats.json"
    if stats.exists():
        with open(stats) as f:
            st = json.load(f)
        _state["mean"] = np.array(st["mean"], dtype="float32")
        _state["std"] = np.array(st["std"], dtype="float32")
    else:
        logger.warning("%s missing -> predictions will be unreliable", stats)

    try:
        import torch  # noqa: F401
        use_torch = True
    except ImportError:
        use_torch = False

    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "ml" / "scripts"))
    for name in ARCHS:
        ckpt = MODELS_DIR / f"{name}.pt"
        if not ckpt.exists():
            continue
        try:
            if use_torch:
                import torch
                from models import build  # type: ignore
                state = torch.load(ckpt, map_location="cpu")
                n_cls = len(state.get("labels") or _state["labels"])
                m = build(name, num_classes=n_cls)
                m.load_state_dict(state["model"])
                m.eval()
                _state["backend"] = "torch"
            else:
                import npmodels
                m, state = npmodels.build(name, ckpt)
                _state["backend"] = "numpy"
            # The checkpoint carries the label order it was trained with; trust
            # it over label_map.json if the two ever disagree.
            mean, std = _stats_for(name, state)
            _state["meta"][name] = {"labels": list(state.get("labels") or _state["labels"]),
                                    "mean": mean if mean is not None else _state["mean"],
                                    "std": std if std is not None else _state["std"]}
            _state[name] = m
            logger.info("loaded %s via %s (val_acc=%.3f)", name, _state["backend"], state.get("val_acc", 0.0))
        except Exception as exc:  # noqa: BLE001
            logger.warning("could not load %s: %s", name, exc)


def _forward(model, x):
    import numpy as np
    if _state["backend"] == "torch":
        import torch
        with torch.no_grad():
            return torch.softmax(model(torch.from_numpy(x)), dim=-1)[0].numpy()
    import npmodels
    return npmodels.softmax(model(x))[0]


def predict(landmarks, model_name: str = DEFAULT_ARCH) -> dict:
    t0 = time.perf_counter()
    # Fall back to any loaded model rather than silently going mock just
    # because the caller asked for an architecture that was not trained.
    if _state.get(model_name) is None:
        model_name = next((a for a in ("cnn",) + ARCHS if _state.get(a) is not None), model_name)
    model = _state.get(model_name)

    if model is not None and landmarks is not None and len(landmarks):
        try:
            import numpy as np
            x = np.array(landmarks, dtype="float32")
            if x.ndim == 2:
                x = x[None, ...]
            meta = _state["meta"].get(model_name, {})
            mean, std = meta.get("mean", _state["mean"]), meta.get("std", _state["std"])
            if mean is not None:
                x = (x - mean) / (std + 1e-6)
            probs = _forward(model, x.astype("float32"))
            order = np.argsort(-probs)[:3]
            labels = meta.get("labels") or _state["labels"]
            alts = [{"label": labels[i], "confidence": float(probs[i])} for i in order]
            return {
                "label": alts[0]["label"],
                "confidence": alts[0]["confidence"],
                "alternatives": alts[1:],
                "model": model_name,
                "latency_ms": (time.perf_counter() - t0) * 1000,
                "mock": False,
            }
        except Exception as exc:
            logger.warning("real inference failed, falling through to mock: %s", exc)

    seed = len(landmarks) if landmarks else random.randint(0, 999)
    random.seed(seed)
    pick = random.sample(MOCK_VOCAB, k=3)
    conf = round(random.uniform(0.55, 0.95), 3)
    return {
        "label": pick[0],
        "confidence": conf,
        "alternatives": [
            {"label": pick[1], "confidence": round(conf - 0.1, 3)},
            {"label": pick[2], "confidence": round(conf - 0.2, 3)},
        ],
        "model": model_name,
        "latency_ms": (time.perf_counter() - t0) * 1000,
        "mock": True,
    }


def status() -> dict:
    st = {f"{a}_loaded": _state[a] is not None for a in ARCHS}
    st.update({
        # `models` is the authoritative list of servable architectures. The
        # per-arch *_loaded flags are kept for backwards compatibility, but
        # callers should prefer this — deriving the list by string-matching
        # "_loaded" also picked up labels_loaded and reported it as a model.
        "models": [a for a in ARCHS if _state[a] is not None],
        "labels_loaded": _state["labels"] is not None,
        "num_labels": len(labels_for(DEFAULT_ARCH if _state.get(DEFAULT_ARCH) else next(
            (a for a in ARCHS if _state.get(a) is not None), DEFAULT_ARCH))) if _state["labels"] else 0,
        "models_dir": str(MODELS_DIR),
        "backend": _state["backend"],
    })
    return st
