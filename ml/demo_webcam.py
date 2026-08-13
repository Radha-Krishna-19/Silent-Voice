"""Live webcam demo: sign in front of the camera, get the predicted word.

    cd ml
    python demo_webcam.py                 # capture mode (recommended for a live demo)
    python demo_webcam.py --model cnn     # show the baseline instead
    python demo_webcam.py --continuous    # rolling-window mode, always predicting
    python demo_webcam.py --clip "../archive (3)/.../MVI_1234.MOV"   # no webcam needed

Controls
    SPACE   start / stop recording a sign   (capture mode)
    C       toggle capture <-> continuous
    M       cycle model: bilstm -> cnn -> transformer
    S       toggle skeleton overlay
    Q / ESC quit

Pure OpenCV — no browser, no server, no build step. Nothing to fail on stage.

WHY CAPTURE MODE IS THE DEFAULT
The model was trained on clips that contain exactly one complete sign filling the
whole window. Capture mode reproduces that: you press SPACE, sign, press SPACE, and
the recorded frames are resampled to the 60-frame window the model expects.
Continuous mode slides a window over an endless stream, so most windows contain
half a sign plus some hand-moving-to-position — a genuinely harder problem the
model was never trained for. Continuous looks more impressive and performs worse;
it is honest to show both and say why they differ.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent / "scripts"))

from dataset import load_stats            # noqa: E402
from models import build                  # noqa: E402
from preprocess import T, FEAT_DIM, _lm_arr, _normalize  # noqa: E402

import mediapipe as mp                    # noqa: E402

MODEL_DIR = Path(__file__).parent / "models"
ARCHS = ["bilstm", "cnn", "transformer"]

INK = (13, 11, 11)
CREAM = (224, 236, 242)
CYAN = (242, 231, 110)      # BGR
COPPER = (74, 123, 201)
DIM = (147, 139, 139)

HAND_EDGES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
              (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15), (15, 16),
              (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]
POSE_EDGES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24)]


# --------------------------------------------------------------------------- #
def load_everything(arch: str):
    label_path = MODEL_DIR / "label_map.json"
    stats_path = MODEL_DIR / "preproc_stats.json"
    for p in (label_path, stats_path):
        if not p.exists():
            sys.exit(f"missing {p}\nTrain first:  python run_pipeline.py --videos \"../archive (3)\"")

    labels = json.loads(label_path.read_text())
    mean, std = load_stats(stats_path)

    models = {}
    for a in ARCHS:
        ck = MODEL_DIR / f"{a}.pt"
        if not ck.exists():
            continue
        state = torch.load(ck, map_location="cpu", weights_only=False)
        m = build(a, num_classes=len(labels))
        m.load_state_dict(state["model"])
        m.eval()
        models[a] = (m, float(state.get("val_acc", 0.0)))

    if not models:
        sys.exit(f"no trained checkpoints in {MODEL_DIR}")
    if arch not in models:
        arch = next(iter(models))
        print(f"requested model unavailable, using {arch}")
    return labels, mean, std, models, arch


def predict(buf: list[np.ndarray], model, mean, std, labels, k=3):
    """buf = list of raw 225-dim frames -> [(word, prob), ...] top-k."""
    if len(buf) < 4:
        return []
    arr = np.stack(buf)
    if len(arr) >= T:
        arr = arr[np.linspace(0, len(arr) - 1, T).astype(int)]
    else:
        arr = np.tile(arr, (int(np.ceil(T / len(arr))), 1))[:T]

    x = (_normalize(arr) - mean) / (std + 1e-6)
    with torch.no_grad():
        probs = torch.softmax(model(torch.from_numpy(x[None].astype("float32"))), -1)[0]
    top = torch.topk(probs, k=min(k, len(labels)))
    return [(labels[i], float(p)) for p, i in zip(top.values, top.indices)]


# --------------------------------------------------------------------------- #
def draw_skeleton(img, res):
    h, w = img.shape[:2]

    def px(lm):
        return int(lm.x * w), int(lm.y * h)

    if res.pose_landmarks:
        pl = res.pose_landmarks.landmark
        for a, b in POSE_EDGES:
            if pl[a].visibility > 0.4 and pl[b].visibility > 0.4:
                cv2.line(img, px(pl[a]), px(pl[b]), DIM, 2, cv2.LINE_AA)

    for hand in (res.left_hand_landmarks, res.right_hand_landmarks):
        if not hand:
            continue
        hl = hand.landmark
        for a, b in HAND_EDGES:
            cv2.line(img, px(hl[a]), px(hl[b]), CYAN, 2, cv2.LINE_AA)
        for lm in hl:
            cv2.circle(img, px(lm), 3, CREAM, -1, cv2.LINE_AA)


def panel(img, x, y, w, h, alpha=0.75):
    sub = img[y:y + h, x:x + w]
    if sub.size:
        img[y:y + h, x:x + w] = cv2.addWeighted(sub, 1 - alpha, np.full_like(sub, INK), alpha, 0)


def draw_hud(img, state):
    h, w = img.shape[:2]

    panel(img, 0, 0, w, 46)
    cv2.putText(img, "SILENT VOICE", (16, 30), cv2.FONT_HERSHEY_DUPLEX, 0.7, CREAM, 1, cv2.LINE_AA)
    meta = f"{state['arch'].upper()}  val {state['val_acc']*100:.1f}%   {state['mode']}   {state['fps']:.0f} fps"
    cv2.putText(img, meta, (w - 8 - 9 * len(meta), 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, DIM, 1, cv2.LINE_AA)

    if state["recording"]:
        cv2.circle(img, (w // 2, 70), 9, (60, 60, 240), -1, cv2.LINE_AA)
        txt = f"RECORDING  {len(state['buf'])} frames"
        cv2.putText(img, txt, (w // 2 + 20, 76), cv2.FONT_HERSHEY_DUPLEX, 0.6, CREAM, 1, cv2.LINE_AA)

    top = state["top"]
    if top:
        ph = 46 + 34 * len(top)
        panel(img, 0, h - ph, w, ph)
        word, conf = top[0]
        col = CYAN if conf > 0.7 else (COPPER if conf > 0.4 else DIM)
        cv2.putText(img, word.replace("_", " ").upper(), (16, h - ph + 34),
                    cv2.FONT_HERSHEY_DUPLEX, 1.0, col, 2, cv2.LINE_AA)
        cv2.putText(img, f"{conf*100:.0f}%", (w - 110, h - ph + 34),
                    cv2.FONT_HERSHEY_DUPLEX, 0.9, col, 2, cv2.LINE_AA)
        for i, (word2, c2) in enumerate(top[1:], 1):
            yy = h - ph + 34 + 30 * i
            cv2.putText(img, f"{word2.replace('_',' ')}", (28, yy),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, DIM, 1, cv2.LINE_AA)
            bw = int(240 * c2)
            cv2.rectangle(img, (200, yy - 11), (200 + bw, yy - 2), DIM, -1)
            cv2.putText(img, f"{c2*100:.0f}%", (460, yy),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, DIM, 1, cv2.LINE_AA)
    else:
        panel(img, 0, h - 44, w, 44)
        hint = "SPACE to record a sign" if state["mode"] == "capture" else "signing..."
        cv2.putText(img, hint, (16, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.6, DIM, 1, cv2.LINE_AA)

    keys = "SPACE record | C mode | M model | S skeleton | Q quit"
    cv2.putText(img, keys, (16, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.45, DIM, 1, cv2.LINE_AA)


# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="bilstm", choices=ARCHS)
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--clip", default=None, help="Play a video file instead of the webcam")
    ap.add_argument("--continuous", action="store_true")
    ap.add_argument("--every", type=int, default=6, help="Predict every N frames in continuous mode")
    ap.add_argument("--min-conf", type=float, default=0.0, help="Hide predictions below this")
    ap.add_argument("--mirror", action="store_true", default=True)
    args = ap.parse_args()

    labels, mean, std, models, arch = load_everything(args.model)
    print(f"loaded: {', '.join(models)}   |   {len(labels)} classes")
    print("vocabulary:", ", ".join(labels))

    src = args.clip if args.clip else args.camera
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        sys.exit(f"could not open {'clip ' + args.clip if args.clip else f'camera {args.camera}'}")

    holistic = mp.solutions.holistic.Holistic(
        static_image_mode=False, model_complexity=1, smooth_landmarks=True,
        min_detection_confidence=0.5, min_tracking_confidence=0.5)

    state = {
        "arch": arch, "val_acc": models[arch][1],
        "mode": "continuous" if args.continuous else "capture",
        "recording": False, "buf": [], "top": [], "fps": 0.0, "skeleton": True,
    }
    rolling: deque[np.ndarray] = deque(maxlen=T)
    frame_i, t_last = 0, time.time()

    win = "Silent Voice - live"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 1000, 720)

    while True:
        ok, frame = cap.read()
        if not ok:
            if args.clip:                       # loop the clip
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            break

        if args.mirror and not args.clip:
            frame = cv2.flip(frame, 1)          # act like a mirror for the signer

        h, w = frame.shape[:2]
        if w > 960:
            frame = cv2.resize(frame, (960, int(h * 960 / w)))

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        res = holistic.process(rgb)

        feats = np.concatenate([
            _lm_arr(res.left_hand_landmarks, 21),
            _lm_arr(res.right_hand_landmarks, 21),
            _lm_arr(res.pose_landmarks, 33),
        ])
        rolling.append(feats)
        if state["recording"]:
            state["buf"].append(feats)

        model = models[state["arch"]][0]
        frame_i += 1
        if state["mode"] == "continuous" and frame_i % args.every == 0 and len(rolling) >= T // 2:
            top = predict(list(rolling), model, mean, std, labels)
            state["top"] = [t for t in top if t[1] >= args.min_conf] or top[:1]

        now = time.time()
        state["fps"] = 0.85 * state["fps"] + 0.15 / max(now - t_last, 1e-6)
        t_last = now

        if state["skeleton"]:
            draw_skeleton(frame, res)
        draw_hud(frame, state)
        cv2.imshow(win, frame)

        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break
        elif key == ord(" "):
            if state["mode"] != "capture":
                state["mode"] = "capture"
            if state["recording"]:
                state["recording"] = False
                state["top"] = predict(state["buf"], model, mean, std, labels)
                n = len(state["buf"])
                if state["top"]:
                    print(f"[{n} frames] " + "  ".join(f"{wd} {p*100:.0f}%" for wd, p in state["top"]))
            else:
                state["recording"] = True
                state["buf"] = []
                state["top"] = []
        elif key == ord("c"):
            state["mode"] = "capture" if state["mode"] == "continuous" else "continuous"
            state["recording"] = False
            state["top"] = []
        elif key == ord("m"):
            avail = list(models)
            state["arch"] = avail[(avail.index(state["arch"]) + 1) % len(avail)]
            state["val_acc"] = models[state["arch"]][1]
            state["top"] = []
        elif key == ord("s"):
            state["skeleton"] = not state["skeleton"]

    cap.release()
    holistic.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
