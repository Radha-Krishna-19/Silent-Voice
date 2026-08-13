"""Pre-flight check. Run this BEFORE kicking off a multi-hour preprocessing job.

    cd ml
    python scripts/verify_setup.py --videos "../archive (3)"

Verifies, in order:
  1. every dependency imports (and mediapipe is a version that still has Holistic)
  2. the three architectures build, forward, and backward on a dummy batch
  3. augmentation + normalisation produce finite, sanely-scaled tensors
  4. the video tree is discoverable and labels parse correctly
  5. MediaPipe actually extracts non-empty landmarks from one real clip

Exit code 0 means the long run is safe to start.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

PASS, FAIL = "  [ok] ", "  [FAIL] "
_failures: list[str] = []


def check(name: str, fn):
    try:
        msg = fn()
        print(f"{PASS}{name}" + (f" — {msg}" if msg else ""))
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"{FAIL}{name} — {type(exc).__name__}: {exc}")
        _failures.append(name)
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", default="data/include")
    args = ap.parse_args()

    print("\n=== 1. dependencies ===")

    def _deps():
        import numpy, torch, sklearn, cv2, matplotlib  # noqa: F401
        import mediapipe as mp
        if not hasattr(mp.solutions, "holistic"):
            raise RuntimeError(
                f"mediapipe {mp.__version__} has no solutions.holistic — "
                "pin mediapipe==0.10.14 (1.0.0 removed it)"
            )
        return f"torch {torch.__version__}, mediapipe {mp.__version__}, numpy {numpy.__version__}"

    if not check("imports", _deps):
        sys.exit("\ndependencies broken — fix these first:\n  pip install -r requirements-training.txt")

    import numpy as np
    import torch

    print("\n=== 2. architectures ===")
    from models import build, param_count

    N_CLASSES, B, T, F = 7, 4, 60, 225
    for arch in ("bilstm", "cnn", "transformer"):
        def _arch(arch=arch):
            m = build(arch, num_classes=N_CLASSES)
            x = torch.randn(B, T, F)
            out = m(x)
            assert out.shape == (B, N_CLASSES), f"bad output shape {tuple(out.shape)}"
            assert torch.isfinite(out).all(), "non-finite logits"
            out.sum().backward()
            grads = [p.grad for p in m.parameters() if p.grad is not None]
            assert grads, "no gradients flowed"
            assert all(torch.isfinite(g).all() for g in grads), "non-finite gradients"
            return f"{param_count(m):,} params"
        check(f"{arch} forward+backward", _arch)

    print("\n=== 3. dataset plumbing ===")
    from dataset import LandmarkDataset, _mirror, compute_stats

    def _mirror_check():
        x = np.random.rand(T, F).astype(np.float32)
        x[:, 0:126] = np.random.randn(T, 126).astype(np.float32) * 0.3  # hands are wrist-centred
        m = _mirror(x)
        assert m.shape == x.shape
        assert np.isfinite(m).all(), "mirror produced non-finite values"
        pose_x = m[:, 126::3]
        assert pose_x.min() >= -0.05 and pose_x.max() <= 1.05, \
            f"mirrored pose x out of [0,1]: [{pose_x.min():.2f}, {pose_x.max():.2f}]"
        assert np.allclose(_mirror(m), x, atol=1e-5), "mirror is not an involution"
        return "involutive, pose stays in image space"
    check("_mirror()", _mirror_check)

    def _stats_check():
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            paths = []
            for i in range(6):
                p = Path(d) / f"word{i % 3}__{i:04d}.npy"
                np.save(p, np.random.randn(T, F).astype(np.float32))
                paths.append(p)
            mean, std = compute_stats(paths)
            assert mean.shape == (F,) and std.shape == (F,)
            assert np.isfinite(mean).all() and np.isfinite(std).all()
            assert (std > 0).all(), "zero-variance feature would divide by ~0"

            ds = LandmarkDataset([Path(d)], augment=True, mean=mean, std=std)
            xb, yb = ds[0]
            assert xb.shape == (T, F) and torch.isfinite(xb).all()
            assert len(ds) == 6 and len(ds.labels) == 3
            return f"{len(ds)} samples, {len(ds.labels)} labels, augmented tensor finite"
    check("compute_stats + Dataset + augment", _stats_check)

    print("\n=== 4. video tree ===")
    from preprocess import VIDEO_EXTS, infer_label

    def _label_check():
        cases = {
            "1. loud": "loud", "12. Good Morning": "good_morning",
            "3. Teacher": "teacher", "hello": "hello",
        }
        for folder, want in cases.items():
            got = infer_label(Path("root") / folder / "MVI_0001.MOV")
            assert got == want, f"{folder!r} -> {got!r}, expected {want!r}"
        return "INCLUDE folder names parse correctly"
    check("infer_label()", _label_check)

    root = Path(args.videos)
    sample: list[Path] = []

    def _tree():
        if not root.exists():
            raise FileNotFoundError(f"{root.resolve()} does not exist")
        for p in root.rglob("*"):
            if p.suffix.lower() in VIDEO_EXTS:
                sample.append(p)
            if len(sample) >= 400:
                break
        if not sample:
            raise FileNotFoundError(f"no videos under {root.resolve()}")
        labels = {infer_label(p) for p in sample}
        return f"{len(sample)}+ videos, e.g. labels {sorted(labels)[:5]}"
    tree_ok = check(f"scan {root}", _tree)

    print("\n=== 5. real landmark extraction ===")
    if not tree_ok:
        print("  [skip] no videos to test on")
    else:
        def _extract():
            from preprocess import extract_video
            v = sample[0]
            t0 = time.time()
            arr = extract_video(v, sample_frames=20)
            dt = time.time() - t0
            if arr is None:
                raise RuntimeError(f"could not decode {v}")
            assert arr.shape == (T, F), f"bad shape {arr.shape}"
            assert np.isfinite(arr).all(), "non-finite landmarks"
            hands = arr[:, 0:126]
            frames_with_hands = int((np.abs(hands).sum(axis=1) > 1e-6).sum())
            if frames_with_hands == 0:
                raise RuntimeError("MediaPipe found no hands in any frame — check the video")
            est = dt * len(sample) / 60
            return (f"{v.name}: hands in {frames_with_hands}/{T} frames, "
                    f"{dt:.1f}s/clip (~{est:.0f} min per 400 clips, 1 worker)")
        check("MediaPipe Holistic on a real clip", _extract)

    print()
    if _failures:
        print(f"{len(_failures)} check(s) failed: {', '.join(_failures)}")
        sys.exit(1)
    print("all checks passed — safe to run: python run_pipeline.py --videos \"%s\"\n" % args.videos)


if __name__ == "__main__":
    main()
