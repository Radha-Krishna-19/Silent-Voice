"""Run the whole T&E suite and keep a timestamped log as evidence.

    cd ml
    python scripts/tne/run_all.py            # everything except cross-validation
    python scripts/tne/run_all.py --with-cv  # also retrain for k-fold CV (slow)

Writes logs/tne/<name>.json, logs/tne/*.png and logs/tne/run_<timestamp>.log.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import importlib
import io
import platform
import sys
import time
import traceback

import torch

from common import OUT, setup

SUITE = ["robustness", "explainability", "clustering", "calibration", "adversarial",
         "metamorphic", "bias", "drift", "resilience", "qualitative"]


class Tee(io.TextIOBase):
    def __init__(self, *s):
        self.s = s

    def write(self, x):
        for s in self.s:
            s.write(x)
            s.flush()
        return len(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-cv", action="store_true")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    setup()
    names = a.only or SUITE + (["crossval"] if a.with_cv else [])
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    log = open(OUT / f"run_{stamp}.log", "w")
    with contextlib.redirect_stdout(Tee(sys.stdout, log)):
        print(f"T&E run started {dt.datetime.now().astimezone().isoformat(timespec='seconds')}")
        print(f"python {platform.python_version()} | torch {torch.__version__} | {platform.platform()}")
        status = {}
        for n in names:
            print(f"\n=== {n} ===")
            t0 = time.time()
            try:
                importlib.import_module(n).main()
                status[n] = f"OK ({time.time() - t0:.0f}s)"
            except Exception:
                traceback.print_exc()
                status[n] = "FAILED"
        print("\nSummary:")
        for n, s in status.items():
            print(f"  {n:15s} {s}")
        print(f"T&E run finished {dt.datetime.now().astimezone().isoformat(timespec='seconds')}")
    return 0 if all(s.startswith("OK") for s in status.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
