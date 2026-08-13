"""Forward translation on a single clip — the end-to-end smoke test.

    python scripts/predict.py --video "path/to/some.MOV"
    python scripts/predict.py --video clip.mp4 --model cnn --topk 5

Runs the exact same path the live app will: decode -> MediaPipe Holistic ->
normalise -> load preproc stats -> model -> softmax. If this prints the right
word for a held-out clip, the whole forward pipeline is wired correctly.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch

from dataset import load_stats
from models import build
from preprocess import extract_video, infer_label

MODEL_DIR = Path("models")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--model", default="bilstm", choices=["bilstm", "cnn", "transformer"])
    ap.add_argument("--topk", type=int, default=3)
    ap.add_argument("--sample-frames", type=int, default=40)
    args = ap.parse_args()

    video = Path(args.video)
    with open(MODEL_DIR / "label_map.json") as f:
        labels = json.load(f)
    mean, std = load_stats(MODEL_DIR / "preproc_stats.json")

    ckpt = torch.load(MODEL_DIR / f"{args.model}.pt", map_location="cpu", weights_only=False)
    model = build(args.model, num_classes=len(labels))
    model.load_state_dict(ckpt["model"])
    model.eval()

    t0 = time.perf_counter()
    x = extract_video(video, sample_frames=args.sample_frames)
    if x is None:
        raise SystemExit(f"could not read {video}")
    extract_ms = (time.perf_counter() - t0) * 1000

    x = (x - mean) / (std + 1e-6)
    t1 = time.perf_counter()
    with torch.no_grad():
        probs = torch.softmax(model(torch.from_numpy(x[None, ...].astype("float32"))), -1)[0]
    infer_ms = (time.perf_counter() - t1) * 1000

    top = torch.topk(probs, k=min(args.topk, len(labels)))
    truth = infer_label(video)

    print(f"\nfile      : {video.name}")
    print(f"folder says: {truth}{'  (not in the trained vocab)' if truth not in labels else ''}")
    print(f"model      : {args.model}  (val_acc {ckpt.get('val_acc', 0):.3f})")
    print(f"timing     : landmarks {extract_ms:.0f} ms | inference {infer_ms:.1f} ms\n")
    for rank, (p, i) in enumerate(zip(top.values, top.indices), 1):
        mark = " <-- correct" if labels[i] == truth else ""
        print(f"  {rank}. {labels[i]:<16s} {float(p)*100:5.1f}%{mark}")
    print()


if __name__ == "__main__":
    main()
