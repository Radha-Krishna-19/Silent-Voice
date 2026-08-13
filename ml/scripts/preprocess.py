"""Skeleton (landmark) extraction: video tree -> (T, 225) .npy tensors.

MediaPipe Holistic gives us 21 left-hand + 21 right-hand + 33 pose landmarks per
frame. We keep xyz for each, giving 225 features/frame, and resample every clip
to a fixed T=60 frame window so a plain classifier can consume it.

Why landmarks instead of raw pixels:
  * 60x225 floats per clip (~54 KB) vs ~12 MB of video — 200x smaller
  * signer identity, skin tone, clothing and background all vanish
  * the model can't cheat on backgrounds, which INCLUDE has plenty of

Usage (run from the `ml/` directory):
    python scripts/preprocess.py \
        --videos "data/include" \
        --out    "data/processed/include" \
        --classes scripts/classes_locked.txt \
        --max-per-class 10 \
        --sample-frames 40 \
        --workers 2

Output layout:
    <out>/<label>__<take>.npy        shape (60, 225) float32
    <out>/label_index.json           label list + per-class counts + manifest

Feature layout per frame (225 dims):
    [  0: 63]  left hand   21 pts * (x, y, z)   wrist-origin, shoulder-scaled
    [ 63:126]  right hand  21 pts * (x, y, z)   wrist-origin, shoulder-scaled
    [126:225]  pose        33 pts * (x, y, z)   raw normalised image coords
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "mediapipe not installed. Run: pip install -r requirements-training.txt\n"
        "(mediapipe must be <1.0 — the Holistic solution was removed in 1.0.0)"
    ) from exc

T = 60                 # frames in the fixed temporal window
FEAT_DIM = 225         # 21*3 + 21*3 + 33*3
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

_HOLISTIC = None       # per-process MediaPipe graph, lazily built


# --------------------------------------------------------------------------- #
# landmark extraction
# --------------------------------------------------------------------------- #
def _get_holistic(model_complexity: int = 1):
    """One Holistic graph per worker process. Building it is expensive (~2 s),
    so it is cached and reused for every video that worker handles."""
    global _HOLISTIC
    if _HOLISTIC is None:
        _HOLISTIC = mp.solutions.holistic.Holistic(
            static_image_mode=False,
            model_complexity=model_complexity,
            smooth_landmarks=True,
            refine_face_landmarks=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
    return _HOLISTIC


def _lm_arr(landmarks, n_points: int) -> np.ndarray:
    if landmarks is None:
        return np.zeros(n_points * 3, dtype=np.float32)
    return np.array([[p.x, p.y, p.z] for p in landmarks.landmark], dtype=np.float32).ravel()


def _frame_indices(n_total: int, sample_frames: int) -> np.ndarray:
    """Which frames to actually push through MediaPipe.

    Decoding is cheap, MediaPipe is not. INCLUDE clips run ~2-4 s at 30-60 fps
    (60-240 frames); uniformly sampling ~40 of them keeps every phase of the sign
    while cutting inference cost 2-6x with no measurable accuracy loss.
    """
    if n_total <= 0:
        return np.array([], dtype=int)
    if sample_frames <= 0 or n_total <= sample_frames:
        return np.arange(n_total)
    return np.unique(np.linspace(0, n_total - 1, sample_frames).astype(int))


def extract_video(path: Path, sample_frames: int = 40, model_complexity: int = 1) -> np.ndarray | None:
    """Returns (T, 225) float32, or None if the clip could not be read."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return None

    n_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    wanted = set(_frame_indices(n_total, sample_frames).tolist()) if n_total > 0 else None

    holistic = _get_holistic(model_complexity)
    frames: list[np.ndarray] = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        take = True if wanted is None else (idx in wanted)
        idx += 1
        if not take:
            continue

        # Downscale before inference — MediaPipe's internal input is small anyway,
        # and INCLUDE ships 1080p, so this is a straight 3-4x speedup.
        h, w = frame.shape[:2]
        if w > 640:
            frame = cv2.resize(frame, (640, int(h * 640 / w)), interpolation=cv2.INTER_AREA)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        res = holistic.process(rgb)
        frames.append(np.concatenate([
            _lm_arr(res.left_hand_landmarks, 21),
            _lm_arr(res.right_hand_landmarks, 21),
            _lm_arr(res.pose_landmarks, 33),
        ]))
    cap.release()

    if not frames:
        return None

    arr = np.stack(frames)
    if len(arr) >= T:
        arr = arr[np.linspace(0, len(arr) - 1, T).astype(int)]
    else:
        # loop-pad rather than zero-pad: a short clip repeated reads as a slower
        # sign, whereas trailing zeros read as "hands vanished" and confuse the model
        reps = int(np.ceil(T / len(arr)))
        arr = np.tile(arr, (reps, 1))[:T]

    return _normalize(arr)


def _normalize(seq: np.ndarray) -> np.ndarray:
    """Make the features invariant to where the signer stands and how tall they are.

    Each hand is re-expressed relative to its own wrist, then divided by the
    signer's shoulder width. After this a "thumbs up" looks identical whether the
    signer is 1 m or 3 m from the camera. Pose is left in image space because its
    absolute position carries meaning (signing space is anchored to the torso).
    """
    out = seq.copy()
    for t in range(len(out)):
        left = out[t, 0:63].reshape(21, 3)
        right = out[t, 63:126].reshape(21, 3)
        pose = out[t, 126:225].reshape(33, 3)

        if left.any():
            left = left - left[0]
        if right.any():
            right = right - right[0]

        shoulder_w = float(np.linalg.norm(pose[11, :2] - pose[12, :2])) if pose.any() else 0.0
        if shoulder_w > 1e-3:
            left = left / shoulder_w
            right = right / shoulder_w

        out[t, 0:63] = left.ravel()
        out[t, 63:126] = right.ravel()
        out[t, 126:225] = pose.ravel()
    return out.astype(np.float32)


# --------------------------------------------------------------------------- #
# labelling
# --------------------------------------------------------------------------- #
def infer_label(video_path: Path) -> str:
    """Label = immediate parent folder, snake-cased.

    INCLUDE folders look like `Adjectives_1of8/Adjectives/1. loud/MVI_5177.MOV`,
    so the parent is `1. loud` -> `loud`.
    """
    raw = video_path.parent.name
    if ". " in raw:
        raw = raw.split(". ", 1)[1]
    else:
        raw = raw.lstrip("0123456789. ")
    return raw.strip().lower().replace(" ", "_").replace("-", "_")


def _job(args: tuple) -> tuple[str, str, bool]:
    """Worker entry point. Returns (label, video_path, ok)."""
    video, out_file, sample_frames, model_complexity, delete_after = args
    video, out_file = Path(video), Path(out_file)
    try:
        tensor = extract_video(video, sample_frames, model_complexity)
        if tensor is None or not np.isfinite(tensor).all():
            return (out_file.stem, str(video), False)
        tmp = out_file.with_suffix(".npy.tmp")
        # np.save() appends ".npy" unless the *filename* already ends in it, which
        # would turn "x.npy.tmp" into "x.npy.tmp.npy" and break the rename below.
        # Writing through an open handle suppresses that behaviour entirely.
        with open(tmp, "wb") as fh:
            np.save(fh, tensor)
        os.replace(tmp, out_file)          # atomic: a .npy on disk is always complete
        if delete_after:
            try:
                video.unlink()
            except OSError:
                pass
        return (out_file.stem, str(video), True)
    except Exception as exc:  # noqa: BLE001 - one bad clip must not kill the run
        print(f"  ! {video.name}: {exc}", file=sys.stderr)
        return (out_file.stem, str(video), False)


# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(description="MediaPipe Holistic landmark extraction")
    ap.add_argument("--videos", required=True, help="Root folder containing labelled video subfolders")
    ap.add_argument("--out", required=True, help="Where to write .npy tensors")
    ap.add_argument("--classes", type=str, default=None,
                    help="Path to a .txt of whitelisted class names, one per line (# = comment)")
    ap.add_argument("--max-per-class", type=int, default=None,
                    help="Cap videos processed per class. Balances the set and cuts runtime.")
    ap.add_argument("--sample-frames", type=int, default=40,
                    help="Frames per clip pushed through MediaPipe (0 = every frame)")
    ap.add_argument("--model-complexity", type=int, default=1, choices=[0, 1, 2],
                    help="MediaPipe Holistic complexity. 0 is ~2x faster, slightly less accurate.")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--delete-after", action="store_true",
                    help="Delete each source video AFTER its tensor is safely written")
    ap.add_argument("--resume", action="store_true", default=True,
                    help="Skip videos whose .npy already exists (default on)")
    ap.add_argument("--limit", type=int, default=None, help="Debug: stop after N videos")
    args = ap.parse_args()

    root, out = Path(args.videos), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    whitelist = None
    if args.classes:
        with open(args.classes) as f:
            whitelist = {
                line.strip().lower().replace(" ", "_")
                for line in f
                if line.strip() and not line.lstrip().startswith("#")
            }
        print(f"-> whitelist active: {len(whitelist)} classes")

    videos = sorted(p for p in root.rglob("*") if p.suffix.lower() in VIDEO_EXTS)
    if not videos:
        raise SystemExit(f"No videos found under {root}")
    print(f"-> found {len(videos)} videos under {root}")

    # ---- build the work list (label balancing happens here, before any decode)
    jobs, label_counts, skipped = [], {}, 0
    for v in videos:
        label = infer_label(v)
        if whitelist is not None and label not in whitelist:
            skipped += 1
            continue
        idx = label_counts.get(label, 0)
        if args.max_per_class and idx >= args.max_per_class:
            skipped += 1
            continue
        label_counts[label] = idx + 1
        out_file = out / f"{label}__{idx:04d}.npy"
        if args.resume and out_file.exists():
            continue
        jobs.append((str(v), str(out_file), args.sample_frames, args.model_complexity, args.delete_after))
        if args.limit and len(jobs) >= args.limit:
            break

    print(f"-> {len(jobs)} videos to process across {len(label_counts)} classes ({skipped} skipped)")
    if not jobs:
        print("-> nothing to do (already preprocessed?)")

    ok = fail = 0
    if args.workers <= 1:
        for i, j in enumerate(jobs, 1):
            _, _, good = _job(j)
            ok, fail = ok + good, fail + (not good)
            if i % 10 == 0 or i == len(jobs):
                print(f"   [{i}/{len(jobs)}] ok={ok} fail={fail}", flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as ex:
            futs = [ex.submit(_job, j) for j in jobs]
            for i, fut in enumerate(as_completed(futs), 1):
                _, _, good = fut.result()
                ok, fail = ok + good, fail + (not good)
                if i % 10 == 0 or i == len(jobs):
                    print(f"   [{i}/{len(jobs)}] ok={ok} fail={fail}", flush=True)

    # ---- manifest reflects what is actually on disk, not what we planned
    written = sorted(out.glob("*.npy"))
    final_counts: dict[str, int] = {}
    for p in written:
        final_counts[p.stem.split("__")[0]] = final_counts.get(p.stem.split("__")[0], 0) + 1

    with open(out / "label_index.json", "w") as f:
        json.dump({
            "labels": sorted(final_counts),
            "counts": final_counts,
            "T": T,
            "feat_dim": FEAT_DIM,
            "sample_frames": args.sample_frames,
            "model_complexity": args.model_complexity,
        }, f, indent=2)

    print(f"OK {len(written)} tensors across {len(final_counts)} labels "
          f"(this run: {ok} written, {fail} failed)")


if __name__ == "__main__":
    main()
