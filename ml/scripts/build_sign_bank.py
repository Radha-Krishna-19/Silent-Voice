"""Turn the training tensors into a playable sign-animation bank.

The key realisation behind reverse translation in this project: the preprocessed
tensors are not abstract features, they are *recordings of real people signing*.
Each (60, 225) tensor is 60 frames of one signer's hands and body performing one
word. If we can put those coordinates back into image space, we can replay them —
so English → ISL needs no 3D avatar, no motion-capture suit, and no video files.
The animation data is already on disk, and it is the same data the recogniser was
trained on, which means what the app shows is exactly what the model considers
that sign to be.

Reconstruction
--------------
preprocess.py stores hands wrist-relative and shoulder-scaled, and pose in raw
normalised image coordinates. To invert that (MediaPipe Pose indices):

    shoulder_width = |pose[11].xy - pose[12].xy|
    left_hand_abs  = pose[15].xy + left_hand_rel.xy  * shoulder_width
    right_hand_abs = pose[16].xy + right_hand_rel.xy * shoulder_width

Choosing an exemplar
--------------------
Each class has ~8-27 takes of varying quality. We pick the **medoid** — the take
with the smallest mean distance to the class average — because it is the most
typical rendition, and unlike the mean of all takes it is a real recording rather
than a blurred average of several.

Output: backend/models/sign_bank.json
    { "fps": 12, "words": { "<label>": { "frames": [...], "n": <takes> } } }
Coordinates are integers in 0..1000 to keep the file small; the client divides
by 1000. A missing hand in a frame is null, so the renderer can skip it rather
than draw a hand collapsed onto the wrist.

    python scripts/build_sign_bank.py
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

# MediaPipe Pose landmark indices we keep for drawing the body.
POSE_KEEP = [0, 11, 12, 13, 14, 15, 16]      # nose, shoulders, elbows, wrists
L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST = 11, 12, 15, 16

DATA = Path("data/processed/include")
OUT = Path("../backend/models/sign_bank.json")
OUT_FRAMES = 20          # frames kept per word (source is 60)
Q = 1000                 # quantisation: coords stored as ints 0..Q


def to_absolute(t: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(60,225) tensor -> (left(60,21,2), right(60,21,2), pose(60,7,2)) in image space."""
    T = len(t)
    left = t[:, 0:63].reshape(T, 21, 3)[:, :, :2]
    right = t[:, 63:126].reshape(T, 21, 3)[:, :, :2]
    pose = t[:, 126:225].reshape(T, 33, 3)[:, :, :2]

    sw = np.linalg.norm(pose[:, L_SHOULDER] - pose[:, R_SHOULDER], axis=1)
    sw = np.where(sw > 1e-3, sw, np.nan)[:, None, None]

    left_abs = pose[:, L_WRIST][:, None, :] + left * sw
    right_abs = pose[:, R_WRIST][:, None, :] + right * sw
    return left_abs, right_abs, pose[:, POSE_KEEP]


def hand_present(t: np.ndarray, side: str) -> np.ndarray:
    """Per-frame mask: was this hand actually detected?"""
    block = t[:, 0:63] if side == "left" else t[:, 63:126]
    return (np.abs(block) > 1e-9).any(axis=1)


def medoid(tensors: list[np.ndarray], candidates: list[int] | None = None) -> int:
    """Index of the take closest to the class average — the most typical rendition."""
    if len(tensors) == 1:
        return 0
    stack = np.stack(tensors)
    mean = stack.mean(axis=0)
    d = ((stack - mean) ** 2).reshape(len(stack), -1).mean(axis=1)
    if candidates:
        best = min(candidates, key=lambda i: d[i])
        return int(best)
    return int(np.argmin(d))


def coverage(t: np.ndarray) -> float:
    """Fraction of frames in which at least one hand was detected."""
    return float((hand_present(t, "left") | hand_present(t, "right")).mean())


def detect_period(t: np.ndarray) -> int:
    """Length of ONE performance of the sign inside a tensor.

    preprocess.py resamples each clip to exactly T=60 frames, and when the clip
    yields fewer than 60 sampled frames it *loop-pads*:

        reps = ceil(T / len(arr));  arr = tile(arr, reps)[:T]

    With --sample-frames 32 that means essentially every tensor contains the
    sign performed about twice. Replaying all 60 frames therefore shows the sign
    twice with a long dead stretch between, and any activity detector sees
    motion across the whole window.

    We recover the true period by finding the smallest p where frame i and
    frame i+p agree. Returns 60 when there is no repetition.
    """
    T = len(t)
    # The period can exceed T//2 — with 32 sampled frames tiled into 60, only
    # 28 frames of the second copy survive. Searching to T//2 misses it.
    for p in range(12, T - 8):
        n = T - p
        if n < 8:
            break
        if np.abs(t[:n] - t[p:p + n]).max() < 1e-5:
            return p
    return T


def active_window(t: np.ndarray, min_len: int = 18) -> tuple[int, int]:
    """Find the frames where the sign is actually being performed.

    INCLUDE clips start and end with the signer standing still, hands at rest.
    Sampling 20 frames uniformly across all 60 therefore yields mostly a person
    doing nothing — the sign is unreadable. We locate the active segment from
    per-frame motion energy of the hands and keep only that.

    Returns an inclusive-exclusive (start, end) slice covering the motion.
    """
    T = detect_period(t)
    pose = t[:T, 126:225].reshape(T, 33, 3)[:, :, :2]

    # IMPORTANT: measure motion on the POSE wrists, not on the hand blocks.
    # The hand blocks are wrist-relative, so raising your arm from waist to head
    # barely changes them — they encode finger shape, not arm trajectory. An
    # earlier version used them and detected no motion at all, trimming nothing.
    wrists = pose[:, [L_WRIST, R_WRIST]]                   # (T, 2, 2)
    shoulder_y = pose[:, [L_SHOULDER, R_SHOULDER], 1].mean(axis=1)
    sw = np.linalg.norm(pose[:, L_SHOULDER] - pose[:, R_SHOULDER], axis=1)
    sw = np.where(sw > 1e-3, sw, 1.0)

    speed = np.zeros(T)
    speed[1:] = np.linalg.norm(np.diff(wrists, axis=0), axis=2).mean(axis=1) / sw[1:]

    # Hands raised toward the signing space score higher (y grows downward).
    elevation = (shoulder_y - wrists[:, :, 1].min(axis=1)) / sw

    score = speed / (speed.max() + 1e-9) + 0.7 * np.clip(elevation, 0, None) / (
        np.clip(elevation, 0, None).max() + 1e-9)
    if score.max() <= 1e-9:
        return 0, T

    thresh = score.max() * 0.35
    idx = np.flatnonzero(score >= thresh)
    if idx.size == 0:
        return 0, T
    start, end = int(idx[0]), int(idx[-1]) + 1

    # Pad a little so the sign has a run-up and follow-through.
    pad = max(2, (end - start) // 6)
    start, end = max(0, start - pad), min(T, end + pad)

    # Never return a sliver — some signs are genuinely brief.
    if end - start < min_len:
        centre = (start + end) // 2
        half = min_len // 2
        start, end = max(0, centre - half), min(T, centre + half)
        if end - start < min_len:
            start = max(0, end - min_len)
    return start, end


def quantise(arr: np.ndarray) -> list | None:
    """(P,2) float -> flat int list, or None if the points are unusable."""
    if not np.isfinite(arr).all():
        return None
    a = np.clip(arr, -0.2, 1.2)
    return [int(round(v * Q)) for v in a.reshape(-1)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(DATA))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--frames", type=int, default=OUT_FRAMES)
    args = ap.parse_args()

    root = Path(args.data)
    files = sorted(root.glob("*.npy"))
    if not files:
        raise SystemExit(f"no tensors under {root} — run preprocess.py first")

    by_label: dict[str, list[Path]] = defaultdict(list)
    for f in files:
        by_label[f.stem.split("__")[0]].append(f)
    print(f"-> {len(files)} tensors across {len(by_label)} labels")

    words: dict[str, dict] = {}
    skipped: list[str] = []

    poor_coverage = 0
    for label in sorted(by_label):
        tensors = [np.load(p) for p in by_label[label]]

        # Prefer takes where MediaPipe actually saw the hands. A take that is
        # typical of the class but has the hands missing half the time makes a
        # useless animation, so coverage gates the medoid rather than the other
        # way round.
        cov = [coverage(t) for t in tensors]
        good = [i for i, c in enumerate(cov) if c >= 0.75]
        if not good:
            good = [i for i, c in enumerate(cov) if c >= 0.5]
        if not good:
            good = [int(np.argmax(cov))]
            poor_coverage += 1
        pick = medoid(tensors, candidates=good)
        t = tensors[pick]

        left_abs, right_abs, pose = to_absolute(t)
        lmask, rmask = hand_present(t, "left"), hand_present(t, "right")

        # Sample only from the segment where the sign is actually performed.
        s, e = active_window(t)
        idx = np.linspace(s, e - 1, args.frames).astype(int)
        frames = []
        for i in idx:
            frames.append({
                "l": quantise(left_abs[i]) if lmask[i] else None,
                "r": quantise(right_abs[i]) if rmask[i] else None,
                "p": quantise(pose[i]),
            })

        # A word with no hand visible in any frame cannot be shown as a sign.
        if not any(f["l"] or f["r"] for f in frames):
            skipped.append(label)
            continue

        words[label] = {
            "frames": frames,
            "takes": len(tensors),
            "coverage": round(cov[pick], 3),
            "window": [int(s), int(e)],
            "source": by_label[label][pick].name,
            "hands": ("both" if lmask.mean() > 0.3 and rmask.mean() > 0.3
                      else "left" if lmask.mean() > rmask.mean() else "right"),
        }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fps": 12,
        "quant": Q,
        "frames_per_word": args.frames,
        "pose_indices": POSE_KEEP,
        "note": "Coordinates are image-space, x/y interleaved, integers 0..quant. "
                "Divide by quant. null hand = not detected in that frame.",
        "words": words,
    }
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    mb = out.stat().st_size / 1024 / 1024
    print(f"OK {len(words)} words -> {out}  ({mb:.2f} MB)")
    if poor_coverage:
        print(f"   {poor_coverage} word(s) had no take with >=50% hand detection")
    if skipped:
        print(f"   {len(skipped)} skipped (no hand detected in any frame): "
              f"{', '.join(skipped[:10])}{' …' if len(skipped) > 10 else ''}")


if __name__ == "__main__":
    main()
