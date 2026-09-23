"""Silent Voice — local demo server (forward translation).

    cd backend
    pip install -r requirements.txt
    python server.py
    # open http://localhost:8000

Design choice that matters: MediaPipe runs on the SERVER, in Python, not in the
browser. The browser only captures webcam frames and streams them over a
WebSocket.

Why:
  * the demo works with no internet — no CDN, no downloaded WASM bundles
  * the landmark extraction and normalisation are byte-for-byte the same code
    used to build the training tensors (ml/scripts/preprocess.py), so there is
    zero train/serve skew. A JS reimplementation would be a second thing to
    keep in sync and a second thing to get subtly wrong.

Transport: a persistent WebSocket (/ws/frame), not HTTP polling. Recognition
state (rolling landmark buffer, in-progress recording) lives per-connection,
not in a module global — two people using the live demo at once used to
silently corrupt each other's buffer.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
from collections import deque
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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
import gloss  # noqa: E402
import nlg  # noqa: E402
import practice  # noqa: E402
import auth  # noqa: E402

app = FastAPI(title="Silent Voice", version="1.2")

# CORS_ORIGINS is a comma-separated allowlist. Previously this env var was
# declared in .env but never actually read — the middleware below was
# hardcoded to "*" regardless. Wired up for real now.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware, allow_origins=_cors_origins, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(auth.router)

_holistic = None


def holistic():
    # Shared singleton is safe here: uvicorn runs a single async event loop,
    # and holistic().process() is a synchronous call, so two connections can
    # never actually be inside it at once — no need to pay for a model per
    # connection.
    global _holistic
    if _holistic is None:
        _holistic = mp.solutions.holistic.Holistic(
            static_image_mode=False, model_complexity=1, smooth_landmarks=True,
            min_detection_confidence=0.5, min_tracking_confidence=0.5)
    return _holistic


@app.on_event("startup")
def _startup() -> None:
    auth.init_db()
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
    with auth.db() as _con:
        n_users = _con.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    print(f"  accounts      : {n_users} registered  (guests store nothing)")
    print(f"  cors origins  : {_cors_origins}")
    print(f"  sentence NLG  : {'gemini + rule-based fallback' if os.environ.get('GEMINI_API_KEY') else 'rule-based only (no GEMINI_API_KEY set)'}")
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


# --------------------------------------------------------------------------- #
# WebSocket connection rate limiting — same in-memory sliding-window pattern
# already proven in auth.py, rather than pulling in a new dependency.
# --------------------------------------------------------------------------- #
MAX_WS_CONNECTS = 20
WS_WINDOW = 60.0
_ws_connects: dict[str, list[float]] = {}


def _ws_rate_limited(client_ip: str) -> bool:
    now = time.time()
    hits = [t for t in _ws_connects.get(client_ip, []) if now - t < WS_WINDOW]
    hits.append(now)
    _ws_connects[client_ip] = hits
    return len(hits) > MAX_WS_CONNECTS


# "Step 1" smoothing from ml/ROADMAP.md: drop low-confidence continuous-mode
# predictions server-side rather than passing every noisy guess to the client
# — gives the sentence-formation step a cleaner gloss stream to work with.
CONTINUOUS_CONFIDENCE_FLOOR = 0.5


@app.websocket("/ws/frame")
async def ws_frame(websocket: WebSocket) -> None:
    client_ip = websocket.client.host if websocket.client else "unknown"
    if _ws_rate_limited(client_ip):
        await websocket.close(code=1013)  # 1013 = try again later
        return
    await websocket.accept()

    # Per-connection state. This used to be module-level globals shared by
    # every client — two people signing at once would corrupt each other's
    # rolling buffer and in-progress recording.
    buffer: deque = deque(maxlen=T)
    recording: list[np.ndarray] = []
    is_recording = False

    try:
        while True:
            try:
                msg = await websocket.receive_json()
            except (json.JSONDecodeError, ValueError):
                await websocket.send_json({"error": "bad message"})
                continue

            try:
                f = Frame(**msg)
            except Exception:
                await websocket.send_json({"error": "bad message"})
                continue

            img = _decode(f.image)
            if img is None:
                await websocket.send_json({"error": "bad image"})
                continue

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
            buffer.append(feats)

            if f.record and not is_recording:
                is_recording, recording = True, []
            if is_recording:
                recording.append(feats)

            prediction = None
            finished = False

            if f.mode == "capture":
                if is_recording and not f.record:          # user released -> classify
                    is_recording = False
                    if len(recording) >= 4:
                        win = _window(recording)
                        prediction = inference.predict(win.tolist(), f.model or "bilstm")
                        # Keep the window (module-level, matches practice.py's
                        # existing single-session contract) so Practice mode
                        # can score this exact attempt without the client
                        # re-sending every frame.
                        globals()["_last_window"] = win
                        finished = True
                    recording = []
            else:                                            # continuous
                if len(buffer) >= T // 2:
                    prediction = inference.predict(_window(list(buffer)).tolist(), f.model or "bilstm")
                    if prediction and prediction.get("confidence", 0) < CONTINUOUS_CONFIDENCE_FLOOR:
                        prediction = None

            hands_visible = bool(res.left_hand_landmarks or res.right_hand_landmarks)

            await websocket.send_json({
                "landmarks": _overlay_points(res),
                "prediction": prediction,
                "recording": is_recording,
                "recorded_frames": len(recording),
                "hands_visible": hands_visible,
                "finished": finished,
                "server_ms": round((time.perf_counter() - t0) * 1000, 1),
            })
    except WebSocketDisconnect:
        pass


@app.get("/api/status")
def status():
    st = inference.status()
    st["vocabulary"] = inference._state.get("labels") or []
    return st


# --------------------------------------------------------------------------- #
# Sentence formation: recognized gloss stream -> fluent English.
# Stateless by design — the client already maintains the transcript, so the
# server doesn't need to track per-session gloss history separately from the
# per-connection recognition buffer above.
# --------------------------------------------------------------------------- #
class WordsIn(BaseModel):
    words: list[str]


@app.post("/api/sentence")
def sentence(body: WordsIn):
    return nlg.glosses_to_sentence(body.words)


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


# --------------------------------------------------------------------------- #
# Reverse translation: English -> ISL gloss -> playable skeleton animation.
#
# The animations are replayed from the SAME landmark tensors the recogniser was
# trained on, so the app shows exactly what the model understands a sign to be.
# No avatar, no motion capture, no video files.
# --------------------------------------------------------------------------- #
class TextIn(BaseModel):
    text: str


@app.post("/api/text-to-sign")
def text_to_sign(body: TextIn):
    """Full payload: gloss ordering plus the frames needed to render it."""
    return gloss.build_sequence(body.text)


@app.post("/api/text-to-gloss")
def text_to_gloss(body: TextIn):
    """Gloss only — no animation frames. Cheap, for previewing word order."""
    return gloss.text_to_gloss(body.text)


# --------------------------------------------------------------------------- #
# Practice mode — real scoring against the reference recording for a word.
# --------------------------------------------------------------------------- #
class PracticeIn(BaseModel):
    label: str
    window: list | None = None      # (T, 225); omit to score the last capture
    mirror: bool = False


@app.post("/api/practice/score")
def practice_score(body: PracticeIn):
    win = body.window
    if win is None:
        win = globals().get("_last_window")
        if win is None:
            return {"available": False,
                    "error": "no attempt recorded yet — hold the record button, then release"}
        win = win.tolist()
    return practice.score(win, body.label, mirror=body.mirror)


@app.get("/api/practice/words")
def practice_words():
    """Words that can be practised — those with a reference recording."""
    v = practice.vocabulary()
    return {"available": practice.available(), "count": len(v), "words": v}


@app.get("/api/vocabulary")
def vocabulary():
    """Every word the system can actually sign back."""
    v = gloss.vocabulary()
    return {"count": len(v), "words": v}


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
