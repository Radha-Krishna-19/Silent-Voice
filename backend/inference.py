"""Model loader + predictor.

If `backend/models/bilstm.pt` and/or `backend/models/transformer.pt` exist,
they are loaded on FastAPI boot and used for real inference.

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

_state = {"bilstm": None, "transformer": None, "labels": None}


def load_models() -> None:
    try:
        import torch  # noqa: F401
    except ImportError:
        logger.info("torch not installed in web-app pod → mock predictor active")
        return

    label_map = MODELS_DIR / "label_map.json"
    if not label_map.exists():
        logger.warning("⚠ %s missing → mock predictor active", label_map)
        return

    try:
        with open(label_map) as f:
            _state["labels"] = json.load(f)
    except Exception as exc:
        logger.warning("failed to load label_map: %s", exc)
        return

    try:
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / "ml" / "scripts"))
        from models import build  # type: ignore
        import torch

        for name in ("bilstm", "transformer"):
            ckpt = MODELS_DIR / f"{name}.pt"
            if not ckpt.exists():
                logger.info("· %s.pt not found — skipping", name)
                continue
            state = torch.load(ckpt, map_location="cpu")
            m = build(name, num_classes=len(_state["labels"]))
            m.load_state_dict(state["model"])
            m.eval()
            _state[name] = m
            logger.info("✓ loaded %s (val_acc=%.3f)", name, state.get("val_acc", 0.0))
    except Exception as exc:
        logger.warning("model load failed → mock predictor active: %s", exc)


def predict(landmarks, model_name: str = "transformer") -> dict:
    t0 = time.perf_counter()
    model = _state.get(model_name)

    if model is not None and landmarks:
        try:
            import numpy as np
            import torch

            x = np.array(landmarks, dtype="float32")
            if x.ndim == 2:
                x = x[None, ...]
            with torch.no_grad():
                logits = model(torch.from_numpy(x))
                probs = torch.softmax(logits, dim=-1)[0]
                top = torch.topk(probs, k=min(3, probs.numel()))
            labels = _state["labels"]
            alts = [{"label": labels[i.item()], "confidence": float(p)} for p, i in zip(top.values, top.indices)]
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
    return {
        "bilstm_loaded": _state["bilstm"] is not None,
        "transformer_loaded": _state["transformer"] is not None,
        "labels_loaded": _state["labels"] is not None,
        "num_labels": len(_state["labels"]) if _state["labels"] else 0,
        "models_dir": str(MODELS_DIR),
    }
