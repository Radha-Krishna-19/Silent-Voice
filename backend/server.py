"""Silent Voice — local demo server (forward translation).

    cd backend
    pip install -r requirements.txt
    python server.py
    # open http://localhost:8000

Design choice that matters: MediaPipe runs on the SERVER, in Python, not in the
browser. The browser only captures webcam frames and POSTs them as JPEG.

Why:
  * the demo works with no internet — no CDN, no downloaded WASM bundles
  * the landmark extraction and normalisation are byte-for-byte the same code
    used to build the training tensors (ml/scripts/preprocess.py), so there is
    zero train/serve skew. A JS reimplementation would be a second thing to
    keep in sync and a second thing to get subtly wrong.

Cost: a round trip per frame. On localhost that is a few milliseconds, and the
client throttles itself to ~12 fps, which is plenty for a 60-frame window.
"""
from __future__ import annotations

import base64
import json
import sys
import time
from collections import deque
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT.parent / "ml" / "scripts"))

import cv2  # noqa: E402
import mediapipe as mp  # noqa: E402

from preprocess import T, _lm_arr, _normalize  # noqa: E402

import inference  # noqa: E402

app = FastAPI(title="Silent Voice", version="1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

_holistic = None
_buffer: deque = deque(maxlen=T)
_recording: list[np.ndarray] = []
_is_recording = False


def holistic():
    global _holistic
    if _holistic is None:
        _holistic = mp.solutions.holistic.Holistic(
            static_image_mode=False, model_complexity=1, smooth_landmarks=True,
            min_detection_confidence=0.5, min_tracking_confidence=0.5)
    return _holistic


@app.on_event("startup")
def _startup() -> None:
    inference.load_models()
    st = inference.status()
    loaded = st.get("models") or []   # not string-matching "_loaded" — that caught labels_loaded
    print("\n" + "=" * 60)
    print("  Silent Voice")
    print(f"  models loaded : {loaded or 'none'}")
    print(f"  classes       : {st['num_labels']}")
    if st["num_labels"] == 0:
        print("  !! MOCK MODE — no checkpoints in backend/models/.")
        print("     Run: cd ml && python run_pipeline.py --videos \"../archive (3)\"")
        print("     (it copies the files here for you), then restart this server.")
    comp = ML_LOGS / "comparison.json"
    print(f"  results page  : {'ready' if comp.exists() else 'no comparison.json yet'}")
    print("")
    print("  ->  http://localhost:8000")
    print("=" * 60 + "\n")


# --------------------------------------------------------------------------- #
class Frame(BaseModel):
    image: str                      # data URL or bare base64 JPEG
    record: bool = False
    mode: str = "capture"           # "capture" | "continuous"
    model: Optional[str] = None


def _decode(data_url: str) -> Optional[np.ndarray]:
    try:
        raw = data_url.split(",", 1)[1] if "," in data_url else data_url
        buf = np.frombuffer(base64.b64decode(raw), dtype=np.uint8)
        return cv2.imdecode(buf, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _overlay_points(res) -> dict:
    """Normalised (0-1) coords for the browser to draw. Kept tiny on purpose."""
    def pack(lms, vis=False):
        if lms is None:
            return []
        if vis:
            return [[round(p.x, 4), round(p.y, 4), round(getattr(p, "visibility", 1.0), 2)]
                    for p in lms.landmark]
        return [[round(p.x, 4), round(p.y, 4)] for p in lms.landmark]

    return {
        "left": pack(res.left_hand_landmarks),
        "right": pack(res.right_hand_landmarks),
        "pose": pack(res.pose_landmarks, vis=True),
    }


def _window(frames: list[np.ndarray]) -> np.ndarray:
    arr = np.stack(frames)
    if len(arr) >= T:
        arr = arr[np.linspace(0, len(arr) - 1, T).astype(int)]
    else:
        arr = np.tile(arr, (int(np.ceil(T / len(arr))), 1))[:T]
    return _normalize(arr)


@app.post("/api/frame")
def frame(f: Frame):
    global _is_recording, _recording

    img = _decode(f.image)
    if img is None:
        return JSONResponse({"error": "bad image"}, status_code=400)

    t0 = time.perf_counter()
    h, w = img.shape[:2]
    if w > 640:
        img = cv2.resize(img, (640, int(h * 640 / w)), interpolation=cv2.INTER_AREA)

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    rgb.flags.writeable = False
    res = holistic().process(rgb)

    feats = np.concatenate([
        _lm_arr(res.left_hand_landmarks, 21),
        _lm_arr(res.right_hand_landmarks, 21),
        _lm_arr(res.pose_landmarks, 33),
    ])
    _buffer.append(feats)

    # ---- recording state machine (capture mode)
    if f.record and not _is_recording:
        _is_recording, _recording = True, []
    if _is_recording:
        _recording.append(feats)

    prediction = None
    finished = False

    if f.mode == "capture":
        if _is_recording and not f.record:          # user released -> classify
            _is_recording = False
            if len(_recording) >= 4:
                prediction = inference.predict(_window(_recording).tolist(), f.model or "bilstm")
                finished = True
            _recording = []
    else:                                            # continuous
        if len(_buffer) >= T // 2:
            prediction = inference.predict(_window(list(_buffer)).tolist(), f.model or "bilstm")

    hands_visible = bool(res.left_hand_landmarks or res.right_hand_landmarks)

    return {
        "landmarks": _overlay_points(res),
        "prediction": prediction,
        "recording": _is_recording,
        "recorded_frames": len(_recording),
        "hands_visible": hands_visible,
        "finished": finished,
        "server_ms": round((time.perf_counter() - t0) * 1000, 1),
    }


@app.post("/api/reset")
def reset():
    global _is_recording, _recording
    _buffer.clear()
    _recording, _is_recording = [], False
    return {"ok": True}


@app.get("/api/status")
def status():
    st = inference.status()
    st["vocabulary"] = inference._state.get("labels") or []
    return st


# --------------------------------------------------------------------------- #
# Training results, read straight off disk so the Results page always reflects
# the last run. No caching — reload the browser and you see the newest numbers.
# --------------------------------------------------------------------------- #
ML_LOGS = ROOT.parent / "ml" / "logs"
ARCHS = ("bilstm", "cnn", "transformer")


@app.get("/api/comparison")
def comparison():
    comp_path = ML_LOGS / "comparison.json"
    if not comp_path.exists():
        return {
            "available": False,
            "error": f"{comp_path} not found — train the models first.",
        }

    try:
        data = json.loads(comp_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "error": f"could not parse comparison.json: {exc}"}

    histories = {}
    for arch in ARCHS:
        p = ML_LOGS / f"{arch}_history.json"
        if p.exists():
            try:
                histories[arch] = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                pass

    confusion = {}
    for arch in ARCHS:
        p = ML_LOGS / f"confusion_{arch}.png"
        if p.exists():
            confusion[arch] = base64.b64encode(p.read_bytes()).decode("ascii")

    data["available"] = bool(data.get("models"))
    data["histories"] = histories
    data["confusion"] = confusion
    return data


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
