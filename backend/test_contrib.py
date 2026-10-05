"""Tests for contribution storage (backend/contrib.py).

Run:  cd backend && python test_contrib.py
Writes only to a throwaway directory.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import contrib  # noqa: E402

PASSED = FAILED = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name}  {detail}")


root = Path(tempfile.mkdtemp())
frames = [np.random.rand(225).astype("float32") for _ in range(30)]

# --- slug ---------------------------------------------------------------- #
check("slug lowercases and joins words", contrib.slug("Thank You") == "thank_you")
check("slug strips punctuation", contrib.slug("  hello!! ") == "hello")
check("slug blocks path traversal", "/" not in contrib.slug("../../etc/passwd") and ".." not in contrib.slug("../../etc/passwd"))
check("slug of empty/symbols is 'unlabeled'", contrib.slug("") == "unlabeled" and contrib.slug("###") == "unlabeled")

# --- save ---------------------------------------------------------------- #
r = contrib.save_contribution(root, "Thank You", frames)
f = root / "thank_you" / r["file"]
check("returns saved=True with slug and frame count", r["saved"] and r["slug"] == "thank_you" and r["frame_count"] == 30)
check("clip file exists on disk", f.exists())
arr = np.load(f)
check("clip has shape (30, 225)", arr.shape == (30, 225), str(arr.shape))
check("clip data round-trips exactly", np.array_equal(arr, np.stack(frames)))

lines = (root / "thank_you" / "manifest.jsonl").read_text().strip().splitlines()
m = json.loads(lines[0])
check("manifest has one line with label/file/frame_count",
      len(lines) == 1 and m["label"] == "Thank You" and m["file"] == r["file"] and m["frame_count"] == 30)

# --- no overwrite -------------------------------------------------------- #
r2 = contrib.save_contribution(root, "Thank You", frames)
r3 = contrib.save_contribution(root, "thank you", frames)
files = sorted(p.name for p in (root / "thank_you").glob("*.npy"))
check("three saves in one second give three distinct files",
      len({r["file"], r2["file"], r3["file"]}) == 3 and len(files) == 3, str(files))
check("manifest records every save",
      len((root / "thank_you" / "manifest.jsonl").read_text().strip().splitlines()) == 3)

# --- separate words stay separate --------------------------------------- #
contrib.save_contribution(root, "water", frames[:10])
check("different word goes to its own folder", (root / "water").is_dir() and len(list((root / "water").glob("*.npy"))) == 1)

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
