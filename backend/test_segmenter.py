"""Tests for the live sign segmenter (backend/segmenter.py).

    cd backend && python test_segmenter.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from segmenter import SignSegmenter  # noqa: E402

P = F = 0


def check(name, cond, detail=""):
    global P, F
    if cond:
        P += 1
        print(f"  PASS  {name}")
    else:
        F += 1
        print(f"  FAIL  {name}  {detail}")


def stream(pattern):
    """pattern: string of '1' (hands) / '0' (no hands); frame value = its index."""
    return [(np.full(225, i, np.float32), c == "1") for i, c in enumerate(pattern)]


def run(pattern, **kw):
    seg = SignSegmenter(**kw)
    out = []
    for f, h in stream(pattern):
        r = seg.push(f, h)
        if r is not None:
            out.append(r)
    return out, seg


# one sign: rest, 20 hand frames, rest
out, _ = run("0" * 10 + "1" * 20 + "0" * 10)
check("one sign -> one segment", len(out) == 1, str(len(out)))
check("segment is cropped to the hand frames (first=10, last=29)",
      out and out[0][0, 0] == 10 and out[0][-1, 0] == 29 and len(out[0]) == 20,
      str(out[0][[0, -1], 0]) if out else "")

# nothing happens with no hands
out, _ = run("0" * 50)
check("no hands -> no segments", out == [])

# a short flicker is not a sign
out, _ = run("0" * 5 + "11" + "0" * 20)
check("2 frames of hands is not a sign", out == [])

# a brief detection dropout inside a sign does not split it
out, _ = run("0" * 5 + "1" * 8 + "00" + "1" * 8 + "0" * 10)
check("a 2-frame dropout inside a sign does not split it", len(out) == 1 and len(out[0]) == 18, str([len(o) for o in out]))

# two signs separated by a pause
out, _ = run("1" * 12 + "0" * 10 + "1" * 12 + "0" * 10)
check("two signs separated by a pause -> two segments", len(out) == 2, str(len(out)))

# too-short sign is dropped
out, _ = run("0" * 5 + "1" * 5 + "0" * 10, min_frames=8)
check("a segment shorter than min_frames is dropped", out == [])

# a sign that never ends is cut at max_frames
out, _ = run("1" * 200, max_frames=60)
check("a never-ending sign is cut at max_frames", len(out) >= 2 and all(len(o) <= 60 for o in out), str([len(o) for o in out]))

# state resets: a second sign after the first is clean
out, seg = run("1" * 12 + "0" * 10)
check("segmenter is idle again after a sign", not seg.active and seg.length == 0)

# pre-roll frames before confirmation are part of the segment only if they have hands
out, _ = run("0" * 6 + "1" * 15 + "0" * 10)
check("leading rest frames are cropped away", out and out[0][0, 0] == 6, str(out[0][0, 0]) if out else "")

print(f"\n{P} passed, {F} failed")
sys.exit(1 if F else 0)
