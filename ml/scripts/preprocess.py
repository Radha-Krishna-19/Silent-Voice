"""Extract MediaPipe Holistic landmarks from every video in a folder tree.

Usage:
    python preprocess.py --videos data/include  --out data/processed/include
    python preprocess.py --videos data/custom   --out data/processed/custom

Output layout:
    <out>/<label>__<take>.npy   shape (T=60, 225) float32

Feature layout per frame (225 dims):
    [0  :63]  left hand   21 pts * (x, y, z)
    [63 :126] right hand  21 pts * (x, y, z)
    [126:225] pose        33 pts * (x, y, z)

Missing hands are zero-filled. Landmarks are wrist-origin normalized and
scaled to shoulder width so signer distance from camera cancels out.
"""
import argparse
import json
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from tqdm import tqdm

try:
    import mediapipe as mp
except ImportError as exc:  # pragma: no cover
    raise SystemExit("mediapipe not installed — run: pip install -r requirements.txt") from exc

T = 60          # temporal window (frames)
FEAT_DIM = 225  # 21*3 + 21*3 + 33*3


def _hand_arr(landmarks) -> np.ndarray:
    if landmarks is None:
        return np.zeros(63, dtype=np.float32)
    return np.array([[lm.x, lm.y, lm.z] for lm in landmarks.landmark], dtype=np.float32).ravel()


def _pose_arr(landmarks) -> np.ndarray:
    if landmarks is None:
        return np.zeros(99, dtype=np.float32)
    return np.array([[lm.x, lm.y, lm.z] for lm in landmarks.landmark], dtype=np.float32).ravel()


def extract_video(path: Path, holistic) -> np.ndarray:
    """Returns (T, 225) array. Uniformly samples/loops to hit T frames."""
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = holistic.process(rgb)
        feats = np.concatenate([
            _hand_arr(res.left_hand_landmarks),
            _hand_arr(res.right_hand_landmarks),
            _pose_arr(res.pose_landmarks),
        ])
        frames.append(feats)
    cap.release()

    if not frames:
        return np.zeros((T, FEAT_DIM), dtype=np.float32)

    arr = np.stack(frames)
    # uniform-sample or pad to T
    if len(arr) >= T:
        idx = np.linspace(0, len(arr) - 1, T).astype(int)
        arr = arr[idx]
    else:
        pad = np.zeros((T - len(arr), FEAT_DIM), dtype=np.float32)
        arr = np.concatenate([arr, pad], axis=0)

    return _normalize(arr)


def _normalize(seq: np.ndarray) -> np.ndarray:
    """Wrist-origin normalize each hand + scale to shoulder distance."""
    out = seq.copy()
    for t in range(len(out)):
        left = out[t, 0:63].reshape(21, 3)
        right = out[t, 63:126].reshape(21, 3)
        pose = out[t, 126:225].reshape(33, 3)

        if left.any():
            left = left - left[0]  # wrist as origin
        if right.any():
            right = right - right[0]

        # shoulder width (pose landmarks 11 = left shoulder, 12 = right shoulder)
        shoulder_w = np.linalg.norm(pose[11, :2] - pose[12, :2]) if pose.any() else 0.0
        if shoulder_w > 1e-3:
            left /= shoulder_w
            right /= shoulder_w

        out[t, 0:63] = left.ravel()
        out[t, 63:126] = right.ravel()
        out[t, 126:225] = pose.ravel()
    return out.astype(np.float32)


def infer_label(video_path: Path, root: Path) -> str:
    """Label = immediate parent folder name, snake-cased."""
    rel = video_path.relative_to(root)
    label_raw = rel.parts[-2] if len(rel.parts) >= 2 else rel.parts[0]
    # INCLUDE folders look like "1. above" — strip the leading number
    label = label_raw.split(". ", 1)[-1] if ". " in label_raw else label_raw
    return label.strip().lower().replace(" ", "_")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", required=True, help="Root folder containing labeled video subfolders")
    ap.add_argument("--out", required=True, help="Where to write .npy tensors")
    ap.add_argument("--classes", type=str, default=None,
                    help="Optional path to a .txt file with one whitelisted class name per line "
                         "(labels as they appear after infer_label). Reduces footprint drastically.")
    ap.add_argument("--max-per-class", type=int, default=None,
                    help="Cap number of videos processed per class (further shrinks the workload).")
    ap.add_argument("--delete-after", action="store_true",
                    help="Delete each source video AFTER its tensor is successfully written. "
                         "Trims peak-disk requirement to landmark tensors only.")
    args = ap.parse_args()

    root = Path(args.videos)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    whitelist: Optional[set[str]] = None
    if args.classes:
        with open(args.classes) as f:
            whitelist = {line.strip().lower().replace(" ", "_") for line in f if line.strip()}
        print(f"→ whitelist active: {len(whitelist)} classes")

    videos = [p for p in root.rglob("*") if p.suffix.lower() in {".mp4", ".mov", ".avi", ".mkv"}]
    if not videos:
        raise SystemExit(f"No videos found under {root}")

    mp_h = mp.solutions.holistic
    label_counts: dict[str, int] = {}
    skipped = 0

    with mp_h.Holistic(static_image_mode=False, model_complexity=1) as holistic:
        for v in tqdm(videos, desc="preprocess"):
            label = infer_label(v, root)
            if whitelist is not None and label not in whitelist:
                skipped += 1
                continue
            if args.max_per_class and label_counts.get(label, 0) >= args.max_per_class:
                skipped += 1
                continue
            idx = label_counts.get(label, 0)
            label_counts[label] = idx + 1
            tensor = extract_video(v, holistic)
            np.save(out / f"{label}__{idx:04d}.npy", tensor)
            if args.delete_after:
                try:
                    v.unlink()
                except OSError:
                    pass

    with open(out / "label_index.json", "w") as f:
        json.dump({"labels": sorted(label_counts), "counts": label_counts, "T": T, "feat_dim": FEAT_DIM}, f, indent=2)

    print(f"✓ {sum(label_counts.values())} tensors written across {len(label_counts)} labels  ({skipped} skipped)")


if __name__ == "__main__":
    main()
