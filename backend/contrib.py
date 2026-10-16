"""Dataset contributions: recorded videos -> skeleton tensors -> training set.

Flow (the /contribute page):

  1. The browser records a short webcam clip (MediaRecorder) and uploads the
     VIDEO itself.
  2. save_video() stores it, untouched, under
         ml/data/contributed_videos/<word>/<timestamp>.webm
     with a manifest.jsonl line — the raw recording is kept so it can be
     re-extracted later if preprocessing ever changes.
  3. extract_to_training() runs the SAME MediaPipe Holistic extraction used for
     INCLUDE (ml/scripts/preprocess.extract_video) and, if hands were actually
     seen, writes the (60, 225) tensor to
         ml/data/processed/custom/<word>__contrib_<timestamp>.npy
     which is where ml/scripts/_train.py already looks for extra training data.
  4. ml/scripts/retrain_with_contributions.py (or the "Retrain" button) trains
     on INCLUDE + contributions. Contributed clips only ever go into the TRAIN
     split, so the 642-clip INCLUDE test set — and every reported number — stays
     comparable.

save_contribution() (landmark-only, from the WebSocket) is kept for backwards
compatibility and its tests.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from pathlib import Path

import numpy as np

ML = Path(__file__).resolve().parent.parent / "ml"
_ROOT_OVERRIDE = os.environ.get("SV_CONTRIB_ROOT")       # tests write to a temp dir

VIDEO_DIR = Path(_ROOT_OVERRIDE) / "videos" if _ROOT_OVERRIDE else ML / "data" / "contributed_videos"
TENSOR_DIR = Path(_ROOT_OVERRIDE) / "custom" if _ROOT_OVERRIDE else ML / "data" / "processed" / "custom"

MAX_VIDEO_BYTES = 40 * 1024 * 1024
MIN_HAND_FRACTION = 0.25        # a clip where hands are seen in <25% of frames is not a sign
_EXT = {"video/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov", "video/x-matroska": "mkv"}

_extract_lock = threading.Lock()    # preprocess.py keeps ONE Holistic graph; not thread-safe


def slug(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (label or "").strip().lower()).strip("_")
    return s or "unlabeled"


# --------------------------------------------------------------------------- #
# legacy: landmark-only clip from the WebSocket
# --------------------------------------------------------------------------- #
def save_contribution(contrib_dir: Path, label: str, frames: list) -> dict:
    """Persist one raw (unnormalised) recording; never overwrites an earlier clip."""
    sl = slug(label)
    out_dir = Path(contrib_dir) / sl
    out_dir.mkdir(parents=True, exist_ok=True)

    arr = np.stack(frames)   # (n_frames, 225) — same per-frame layout as preprocess.py
    stamp = time.strftime("%Y%m%dT%H%M%S")
    fname = f"{stamp}_{len(frames)}f.npy"
    n = 1
    while (out_dir / fname).exists():          # two clips in the same second
        n += 1
        fname = f"{stamp}_{len(frames)}f_{n}.npy"
    np.save(out_dir / fname, arr)

    with (out_dir / "manifest.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({
            "file": fname, "label": label, "slug": sl,
            "frame_count": len(frames), "collected_at": stamp,
        }) + "\n")

    return {"saved": True, "slug": sl, "file": fname, "frame_count": len(frames)}


# --------------------------------------------------------------------------- #
# video contributions
# --------------------------------------------------------------------------- #
def _unique_stamp(folder: Path, ext: str) -> str:
    stamp = time.strftime("%Y%m%dT%H%M%S")
    name, n = stamp, 1
    while (folder / f"{name}.{ext}").exists():
        n += 1
        name = f"{stamp}_{n}"
    return name


def save_video(label: str, data: bytes, content_type: str = "video/webm") -> dict:
    sl = slug(label)
    if not (label or "").strip():
        raise ValueError("no word label given")
    if not data:
        raise ValueError("empty upload")
    if len(data) > MAX_VIDEO_BYTES:
        raise ValueError(f"video too large ({len(data) // 1_048_576} MB > {MAX_VIDEO_BYTES // 1_048_576} MB)")
    ext = _EXT.get((content_type or "").split(";")[0].strip().lower(), "webm")
    folder = VIDEO_DIR / sl
    folder.mkdir(parents=True, exist_ok=True)
    stem = _unique_stamp(folder, ext)
    path = folder / f"{stem}.{ext}"
    path.write_bytes(data)
    return {"slug": sl, "label": label, "video": str(path), "stem": stem, "bytes": len(data)}


def _preprocess():
    if str(ML / "scripts") not in sys.path:
        sys.path.insert(0, str(ML / "scripts"))
    import preprocess  # noqa: WPS433
    return preprocess


def extract_landmarks(video: Path) -> tuple[np.ndarray | None, int, int]:
    """Raw per-frame features for EVERY frame (browser WebM often reports a
    bogus frame count, so don't sample by index). Returns (frames, n, n_hands)."""
    import cv2
    pp = _preprocess()
    with _extract_lock:
        cap = cv2.VideoCapture(str(video))
        if not cap.isOpened():
            return None, 0, 0
        holistic = pp._get_holistic(1)
        frames, hands = [], 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            h, w = frame.shape[:2]
            if w > 640:
                frame = cv2.resize(frame, (640, int(h * 640 / w)), interpolation=cv2.INTER_AREA)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            res = holistic.process(rgb)
            hands += bool(res.left_hand_landmarks or res.right_hand_landmarks)
            frames.append(np.concatenate([
                pp._lm_arr(res.left_hand_landmarks, 21),
                pp._lm_arr(res.right_hand_landmarks, 21),
                pp._lm_arr(res.pose_landmarks, 33),
            ]))
        cap.release()
    if not frames:
        return None, 0, 0
    return np.stack(frames), len(frames), hands


def to_window(raw: np.ndarray) -> np.ndarray:
    """Same resample + normalisation as preprocess.extract_video."""
    pp = _preprocess()
    T = pp.T
    arr = raw
    if len(arr) >= T:
        arr = arr[np.linspace(0, len(arr) - 1, T).astype(int)]
    else:
        arr = np.tile(arr, (int(np.ceil(T / len(arr))), 1))[:T]
    return pp._normalize(arr)


def extract_to_training(saved: dict) -> dict:
    """Skeleton extraction for one stored video; writes the training tensor if usable."""
    video = Path(saved["video"])
    raw, n, n_hands = extract_landmarks(video)
    out = {"video_saved": True, "slug": saved["slug"], "video_file": video.name,
           "frames": n, "hand_frames": n_hands, "tensor_saved": False}

    if raw is None:
        out["reason"] = "could not decode the video"
    elif n_hands / max(n, 1) < MIN_HAND_FRACTION:
        out["reason"] = (f"hands were visible in only {n_hands} of {n} frames — "
                         "keep both hands in view and try again")
    else:
        win = to_window(raw)
        if not np.isfinite(win).all():
            out["reason"] = "extraction produced invalid values"
        else:
            TENSOR_DIR.mkdir(parents=True, exist_ok=True)
            tname = f"{saved['slug']}__contrib_{saved['stem']}.npy"
            tmp = TENSOR_DIR / (tname + ".tmp")
            with open(tmp, "wb") as fh:
                np.save(fh, win.astype(np.float32))
            os.replace(tmp, TENSOR_DIR / tname)
            out.update(tensor_saved=True, tensor_file=tname)
            out["window"] = win            # caller may use it (e.g. instant prediction)

    with (video.parent / "manifest.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({
            "video": video.name, "label": saved["label"], "slug": saved["slug"],
            "bytes": saved.get("bytes"), "frames": n, "hand_frames": n_hands,
            "tensor": out.get("tensor_file"), "accepted": out["tensor_saved"],
            "reason": out.get("reason"), "collected_at": saved["stem"],
        }) + "\n")
    return out


def ingest_pending() -> list[dict]:
    """Extract any stored video that has no tensor yet (e.g. dropped in by hand)."""
    done = {p.stem.split("__contrib_", 1)[1] for p in TENSOR_DIR.glob("*__contrib_*.npy")} if TENSOR_DIR.exists() else set()
    results = []
    if not VIDEO_DIR.exists():
        return results
    for word_dir in sorted(d for d in VIDEO_DIR.iterdir() if d.is_dir()):
        rejected = set()
        man = word_dir / "manifest.jsonl"
        if man.exists():
            for line in man.read_text(encoding="utf-8").splitlines():
                try:
                    e = json.loads(line)
                    if not e.get("accepted"):
                        rejected.add(Path(e["video"]).stem)
                except Exception:
                    pass
        for v in sorted(word_dir.iterdir()):
            if v.suffix.lower().lstrip(".") not in _EXT.values() or v.stem in done or v.stem in rejected:
                continue
            saved = {"slug": word_dir.name, "label": word_dir.name, "video": str(v), "stem": v.stem,
                     "bytes": v.stat().st_size}
            r = extract_to_training(saved)
            r.pop("window", None)
            results.append(r)
    return results


def summary(known_labels: list[str] | None = None) -> dict:
    """Per-word counts of stored videos and accepted training tensors."""
    words: dict[str, dict] = {}
    if VIDEO_DIR.exists():
        for d in VIDEO_DIR.iterdir():
            if d.is_dir():
                n = sum(1 for v in d.iterdir() if v.suffix.lower().lstrip(".") in _EXT.values())
                if n:
                    words.setdefault(d.name, {"videos": 0, "tensors": 0})["videos"] = n
    if TENSOR_DIR.exists():
        for p in TENSOR_DIR.glob("*__contrib_*.npy"):
            w = p.stem.split("__", 1)[0]
            words.setdefault(w, {"videos": 0, "tensors": 0})["tensors"] += 1
    known = set(known_labels or [])
    for w, e in words.items():
        e["in_model"] = w in known
    return {
        "videos": sum(e["videos"] for e in words.values()),
        "tensors": sum(e["tensors"] for e in words.values()),
        "total": sum(e["videos"] for e in words.values()),
        "words": dict(sorted(words.items())),
        "video_dir": str(VIDEO_DIR),
        "tensor_dir": str(TENSOR_DIR),
    }
