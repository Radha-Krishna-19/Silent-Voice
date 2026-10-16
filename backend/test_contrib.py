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

# --- video contributions: accept path ------------------------------------ #
# A real recording needs a person on camera; here the extraction step is
# replaced by a stub that returns hand-bearing frames, so storage, the hand
# gate, tensor writing, manifest and summary are all exercised for real.
vroot = Path(tempfile.mkdtemp())
contrib.VIDEO_DIR = vroot / "videos"
contrib.TENSOR_DIR = vroot / "custom"
_real_extract = contrib.extract_landmarks


def _fake(frac):
    def f(video):
        n = 40
        raw = np.zeros((n, 225), np.float32)
        k = int(n * frac)
        raw[:k, 0:63] = np.random.rand(k, 63)          # left hand seen in k frames
        raw[:, 126:225] = np.random.rand(n, 99)        # pose always seen
        return raw, n, k
    return f


contrib.extract_landmarks = _fake(0.9)
sv = contrib.save_video("Thank You", b"fake-webm-bytes", "video/webm")
check("video stored under contributed_videos/<word>/", Path(sv["video"]).exists() and Path(sv["video"]).parent.name == "thank_you")
res = contrib.extract_to_training(sv)
tensors = list(contrib.TENSOR_DIR.glob("thank_you__contrib_*.npy"))
check("clip with hands -> tensor written to processed/custom", res["tensor_saved"] and len(tensors) == 1, str(res))
arr = np.load(tensors[0])
check("tensor has the training shape (60, 225) float32", arr.shape == (60, 225) and arr.dtype == np.float32)
check("tensor name follows <label>__<id> convention", tensors[0].stem.split("__")[0] == "thank_you")

contrib.extract_landmarks = _fake(0.05)
sv2 = contrib.save_video("thank you", b"another", "video/webm")
res2 = contrib.extract_to_training(sv2)
check("clip where hands are rarely visible is rejected", not res2["tensor_saved"] and "hands" in res2.get("reason", ""))
check("rejected clip's video is still kept", Path(sv2["video"]).exists())

man = [json.loads(l) for l in (contrib.VIDEO_DIR / "thank_you" / "manifest.jsonl").read_text().splitlines()]
check("manifest logs accepted and rejected clips", [e["accepted"] for e in man] == [True, False], str(man))

s = contrib.summary(["thank_you"])
check("summary counts videos and tensors", s["videos"] == 2 and s["tensors"] == 1 and s["words"]["thank_you"]["in_model"])

# ingest_pending: a video dropped in by hand gets extracted once, never twice
contrib.extract_landmarks = _fake(0.9)
(contrib.VIDEO_DIR / "water").mkdir(parents=True)
(contrib.VIDEO_DIR / "water" / "manual1.mp4").write_bytes(b"x")
first = contrib.ingest_pending()
second = contrib.ingest_pending()
check("ingest_pending extracts new videos only (and skips rejected ones)",
      len(first) == 1 and first[0]["slug"] == "water" and second == [], f"{first} / {second}")

try:
    contrib.save_video("", b"x")
    check("empty label refused", False)
except ValueError:
    check("empty label refused", True)
try:
    contrib.save_video("big", b"0" * (contrib.MAX_VIDEO_BYTES + 1))
    check("oversized upload refused", False)
except ValueError:
    check("oversized upload refused", True)
contrib.extract_landmarks = _real_extract

# --- training split: contributions never leak into val/test --------------- #
sys.path.insert(0, str(Path(__file__).parent.parent / "ml" / "scripts"))
try:
    import torch  # noqa: F401
except ImportError:
    # make_splits itself is pure Python; stub torch just enough to import _train
    import types
    _t = types.ModuleType("torch")
    _t.nn = types.ModuleType("torch.nn")
    _t.nn.Module = object
    _t.Tensor = object
    _t.utils = types.ModuleType("torch.utils")
    _t.utils.data = types.ModuleType("torch.utils.data")
    _t.utils.data.Dataset = object
    _t.utils.data.DataLoader = object
    sys.modules.update({"torch": _t, "torch.nn": _t.nn, "torch.utils": _t.utils, "torch.utils.data": _t.utils.data})
try:
    from _train import make_splits
    inc = [Path(f"data/processed/include/w{c}__{i:04d}.npy") for c in range(5) for i in range(10)]
    cus = [Path(f"data/processed/custom/w{c}__contrib_{i}.npy") for c in range(5) for i in range(3)]
    cus.append(Path("data/processed/custom/brandnew__contrib_1.npy"))
    labels = sorted({p.stem.split("__")[0] for p in inc + cus})
    tr0, va0, te0 = make_splits(inc, labels)
    tr1, va1, te1 = make_splits(inc + cus, labels)
    check("adding contributions leaves val/test identical", list(va0) == list(va1) and list(te0) == list(te1))
    check("every contribution lands in train", all(p in tr1 for p in cus))
    check("a brand-new word with one clip does not break the split", Path("data/processed/custom/brandnew__contrib_1.npy") in tr1)
except ImportError as exc:      # torch not installed: _train imports it
    print(f"  SKIP  split tests ({exc})")

print(f"\n{PASSED} passed, {FAILED} failed")
sys.exit(1 if FAILED else 0)
