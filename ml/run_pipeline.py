"""One-command forward-translation pipeline: videos -> landmarks -> models -> report.

    cd ml
    python run_pipeline.py --videos "../archive (3)"

Everything is resumable. If preprocessing dies halfway, rerun the same command —
already-written .npy tensors are skipped.

Flags worth knowing:
    --classes scripts/classes_isl20.txt   which words to train on (default: ISL-20)
    --max-per-class 10                    takes per word; more = better, slower
    --epochs 60                           training epochs per model
    --models bilstm cnn                   skip the transformer if a teammate owns it
    --skip-preprocess                     go straight to training on existing tensors
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent.resolve()
SCRIPTS = HERE / "scripts"


def sh(cmd: list[str]) -> None:
    print(f"\n$ {' '.join(cmd)}\n", flush=True)
    t0 = time.time()
    r = subprocess.run(cmd, cwd=HERE)
    if r.returncode != 0:
        sys.exit(f"\nstep failed ({r.returncode}): {' '.join(cmd)}")
    print(f"\n[done in {time.time() - t0:.0f}s]", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--videos", default="data/include", help="Root of the labelled video tree")
    ap.add_argument("--classes", default="scripts/classes_isl20.txt",
                    help='Whitelist file, or "all" to use every class in the archive')
    ap.add_argument("--max-per-class", type=int, default=10,
                    help="0 = no cap (use every clip of every class)")
    ap.add_argument("--min-per-class", type=int, default=6,
                    help="Drop classes with fewer clips than this. Below ~6 a "
                         "stratified 70/15/15 split cannot give the class a "
                         "member in every split and sklearn raises.")
    ap.add_argument("--sample-frames", type=int, default=40)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--models", nargs="+", default=["bilstm", "cnn"],
                    choices=["bilstm", "cnn", "transformer"])
    ap.add_argument("--skip-preprocess", action="store_true")
    ap.add_argument("--delete-after", action="store_true")
    args = ap.parse_args()

    py = sys.executable

    if not args.skip_preprocess:
        cmd = [py, "scripts/preprocess.py",
               "--videos", args.videos,
               "--out", "data/processed/include",
               "--sample-frames", str(args.sample_frames),
               "--min-per-class", str(args.min_per_class),
               "--workers", str(args.workers)]
        if args.classes.lower() not in ("all", "none", ""):
            cmd += ["--classes", args.classes]
        if args.max_per_class:
            cmd += ["--max-per-class", str(args.max_per_class)]
        if args.delete_after:
            cmd.append("--delete-after")
        sh(cmd)

        custom = HERE / "data" / "custom"
        if custom.exists() and any(custom.rglob("*.mp4")):
            sh([py, "scripts/preprocess.py", "--videos", "data/custom",
                "--out", "data/processed/custom",
                "--sample-frames", str(args.sample_frames),
                "--workers", str(args.workers)])

    for m in args.models:
        sh([py, f"scripts/train_{m}.py", "--epochs", str(args.epochs), "--batch", str(args.batch)])

    sh([py, "scripts/evaluate.py"])
    sh([py, "scripts/make_report.py"])

    # Stage the artifacts the demo server needs, so there is one less manual step.
    dest = HERE.parent / "backend" / "models"
    dest.mkdir(parents=True, exist_ok=True)
    staged = []
    for f in ["label_map.json", "preproc_stats.json"] + [f"{m}.pt" for m in args.models]:
        src = HERE / "models" / f
        if src.exists():
            shutil.copy2(src, dest / f)
            staged.append(f)

    print("\n" + "=" * 62)
    print("pipeline complete")
    print("  logs/report.html        <- OPEN THIS. self-contained results page")
    print("  logs/comparison.md      <- the table, as markdown")
    print("  logs/confusion_*.png    <- per-model confusion matrices")
    print(f"  copied into backend/models/: {', '.join(staged) or 'nothing'}")
    print("")
    print("  live demo:   cd ml && python demo_webcam.py")
    print("  web demo:    cd backend && python server.py   -> http://localhost:8000")
    print("=" * 62)


if __name__ == "__main__":
    main()
