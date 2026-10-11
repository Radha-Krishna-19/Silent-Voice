"""Tiny assertion helper shared by the script-style test files (same style as backend/test_*.py)."""
from __future__ import annotations

import sys

PASSED = 0
FAILED = 0
LINES: list[str] = []


def check(case_id: str, name: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    status = "PASS" if cond else "FAIL"
    if cond:
        PASSED += 1
    else:
        FAILED += 1
    line = f"  {status}  [{case_id}] {name}" + (f"  ({detail})" if detail else "")
    LINES.append(line)
    print(line, flush=True)


def finish() -> None:
    print(f"\n{PASSED} passed, {FAILED} failed")
    sys.exit(1 if FAILED else 0)
