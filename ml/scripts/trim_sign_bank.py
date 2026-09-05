"""Trim every sign in the bank to the frames that actually carry the sign.

The problem this fixes
----------------------
INCLUDE clips start and end with the signer's arms at rest. Measured on the
bank: for `hello` the wrist sits at y=760 (hanging), rises to y=325 (signing
space) and returns to y=762. So roughly the first and last thirds of every clip
are the arm travelling to and from rest — not the sign.

That one fact caused three separate visible problems:

  * the reference player auto-fits its camera to the whole rest→sign→rest
    sweep, so the hands render at ~8% of the frame and the handshape is
    unreadable — which is exactly what Practice looked like;
  * the replayed animation is mostly an arm flapping up and down;
  * motion-trail renderings are dominated by one huge vertical streak.

What it does
------------
For each word it finds the contiguous window that maximises FINGER-SHAPE change
weighted by wrist height. Shape change is measured wrist-relative, so the
arm-raise (during which the handshape is frozen) scores near zero while the
sign itself scores high. Height weighting breaks ties toward signing space.

It also records which hands actually carry the sign, by motion share, so
viewers can crop to the working hand instead of having to contain a hand
resting at the signer's hip.

Nothing is invented or smoothed — frames are only selected, never modified.

    cd ml && python scripts/trim_sign_bank.py [--keep 0.45] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BANK = ROOT / "backend" / "models" / "sign_bank.json"

TIPS = [4, 8, 12, 16, 20]
MIN_FRAMES = 6


def _wrist_y(frame: dict) -> float | None:
    ys = [frame[h][1] for h in ("l", "r") if frame.get(h)]
    return min(ys) if ys else None


def _shape_change(prev: dict, cur: dict, hand: str) -> float:
    """Fingertip movement measured RELATIVE TO THE WRIST.

    This is the key trick. During the arm-raise the whole hand translates but
    its shape is frozen, so wrist-relative movement is ~0. During the sign the
    fingers reconfigure, so it spikes.
    """
    a, p = cur.get(hand), prev.get(hand)
    if not a or not p:
        return 0.0
    return sum(
        math.hypot(
            (a[i * 2] - a[0]) - (p[i * 2] - p[0]),
            (a[i * 2 + 1] - a[1]) - (p[i * 2 + 1] - p[1]),
        )
        for i in TIPS
    )


def active_window(frames: list[dict], keep: float = 0.45) -> tuple[int, int]:
    n = len(frames)
    if n <= MIN_FRAMES:
        return 0, n

    ys = [_wrist_y(f) for f in frames]
    known = [y for y in ys if y is not None]
    if not known:
        return 0, n
    lo, hi = min(known), max(known)
    rng = max(hi - lo, 1)

    score = [0.0] * n
    for i in range(1, n):
        change = _shape_change(frames[i - 1], frames[i], "l") + _shape_change(
            frames[i - 1], frames[i], "r"
        )
        y = ys[i]
        height = 1.0 if y is None else 1.0 - (y - lo) / rng   # 1 = signing space
        score[i] = change * (0.25 + 0.75 * height)

    win = max(MIN_FRAMES, int(round(n * keep)))
    win = min(win, n)
    best_i, best_s = 0, -1.0
    for i in range(0, n - win + 1):
        s = sum(score[i : i + win])
        if s > best_s:
            best_s, best_i = s, i
    return best_i, best_i + win


def _hand_travel(frames: list[dict], hand: str) -> float:
    pts = [(f[hand][0], f[hand][1]) for f in frames if f.get(hand)]
    if len(pts) < 2:
        return 0.0
    return sum(
        math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        for i in range(1, len(pts))
    )


def active_hands(frames: list[dict], share: float = 0.25) -> list[str]:
    """Hands carrying at least `share` of the total wrist travel."""
    ml, mr = _hand_travel(frames, "l"), _hand_travel(frames, "r")
    total = ml + mr
    if total < 1:
        return ["l", "r"]
    out = [h for h, m in (("l", ml), ("r", mr)) if m / total >= share]
    return out or [max((("l", ml), ("r", mr)), key=lambda t: t[1])[0]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", type=float, default=0.45,
                    help="fraction of frames to retain (default 0.45)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not BANK.exists():
        raise SystemExit(f"{BANK} not found — build it first.")

    bank = json.loads(BANK.read_text(encoding="utf-8"))
    words = bank["words"]

    if bank.get("trimmed"):
        print("  bank is already trimmed — nothing to do")
        print("  (delete the 'trimmed' flag or rebuild the bank to re-run)")
        return

    stats = {"one": 0, "two": 0}
    before_frames = after_frames = 0

    for name, entry in words.items():
        frames = entry["frames"]
        before_frames += len(frames)

        a, z = active_window(frames, args.keep)
        trimmed = frames[a:z]
        hands = active_hands(trimmed)

        entry["frames"] = trimmed
        entry["activeHands"] = hands
        entry["trimmedFrom"] = [a, z, len(frames)]
        after_frames += len(trimmed)
        stats["one" if len(hands) == 1 else "two"] += 1

    bank["trimmed"] = True
    bank["trimNote"] = (
        "Frames outside the signing window were dropped: INCLUDE clips begin and "
        "end with the arms at rest, and those frames carry no sign. Selection "
        "only — no frame was modified. activeHands lists the hands carrying at "
        "least 25% of wrist travel, so viewers can crop to the working hand."
    )

    print(f"  {len(words)} words")
    print(f"  frames {before_frames} -> {after_frames} "
          f"({after_frames / before_frames * 100:.0f}% retained)")
    print(f"  one-handed {stats['one']}   two-handed {stats['two']}")

    if args.dry_run:
        print("  dry run — nothing written")
        return

    backup = BANK.with_suffix(".json.pretrim")
    if not backup.exists():
        shutil.copy2(BANK, backup)
        print(f"  backup -> {backup.name}")

    BANK.write_text(json.dumps(bank, separators=(",", ":")), encoding="utf-8")
    kb = BANK.stat().st_size / 1024
    print(f"  wrote {BANK.relative_to(ROOT)}  ({kb:.0f} KB)")


if __name__ == "__main__":
    main()
