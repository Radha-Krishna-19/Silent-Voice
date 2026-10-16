"""Does recognition survive webcam conditions? Measured on the real held-out clips.

    cd backend && python test_live_conditions.py

INCLUDE signers stand far from the camera; webcam users sit close. This test
simulates that (shifting / zooming the pose block, which is in raw image
coordinates) and a live 5-second buffer around a sign, then checks that the
serving path — canonicalize_pose + sign segmentation — keeps accuracy up.

Writes ml/logs/tne/camera_position.json (the numbers quoted in the README and the
test-and-evaluation report). Skips if the processed tensors are not present.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "ml" / "scripts"))
import npmodels  # noqa: E402
from preprocess import canonicalize_pose  # noqa: E402

DATA = ROOT.parent / "ml" / "data" / "processed" / "include"
paths = sorted(DATA.glob("*.npy"))
if not paths:
    print("SKIP: no processed tensors")
    sys.exit(0)

labels = json.loads((ROOT / "models" / "label_map.json").read_text())
y = [labels.index(p.stem.split("__")[0]) for p in paths]
_, tmp, _, ty = train_test_split(paths, y, test_size=0.30, stratify=y, random_state=42)
_, test, _, _ = train_test_split(tmp, ty, test_size=0.50, stratify=ty, random_state=42)
X = np.stack([np.load(p) for p in test]).astype("float32")
Y = np.array([labels.index(p.stem.split("__")[0]) for p in test])
model, _ck = npmodels.build("cnn", ROOT / "models" / "cnn.pt")
if _ck.get("mean") is not None:           # retrained model carries its own statistics
    mean, std = np.array(_ck["mean"], "f"), np.array(_ck["std"], "f")
else:
    st = json.loads((ROOT / "models" / "preproc_stats.json").read_text())
    mean, std = np.array(st["mean"], "f"), np.array(st["std"], "f")

P = F = 0


def check(name, cond, detail=""):
    global P, F
    if cond:
        P += 1
        print(f"  PASS  {name}")
    else:
        F += 1
        print(f"  FAIL  {name}  {detail}")


def acc(a):
    z = ((a - mean) / (std + 1e-6)).astype("f")
    out = np.concatenate([model(z[i:i + 128]) for i in range(0, len(z), 128)])
    return float((out.argmax(1) == Y).mean())


def camera(a, dx=0.0, dy=0.0, s=1.0):
    """Move/zoom the signer: pose is in image coordinates; hands are wrist-relative."""
    a = a.copy()
    P_ = a[:, :, 126:].reshape(len(a), 60, 33, 3)
    present = np.abs(P_).sum(3) > 0
    for ax, d in ((0, dx), (1, dy)):
        P_[..., ax] = np.where(present, (P_[..., ax] - 0.5) * s + 0.5 + d, P_[..., ax])
    P_[..., 2] = np.where(present, P_[..., 2] * s, P_[..., 2])
    a[:, :, 126:] = P_.reshape(len(a), 60, 99)
    return a


def canon(a):
    return np.stack([canonicalize_pose(c) for c in a])


conditions = {
    "as recorded (INCLUDE position)": (0, 0, 1.0),
    "signer 5% to the side": (0.05, 0, 1.0),
    "signer 10% to the side": (0.10, 0, 1.0),
    "signer 10% lower in frame": (0, 0.10, 1.0),
    "signer 1.3x closer": (0, 0, 1.3),
    "webcam-like: 2.5x closer, lower": (0, 0.25, 2.5),
    "webcam-like: 3x closer, off-centre": (-0.10, 0.30, 3.0),
}
rows = {}
print("\n== body position (pose block) ==")
for name, (dx, dy, s) in conditions.items():
    a = camera(X, dx, dy, s)
    rows[name] = {"raw": acc(a), "canonical": acc(canon(a))}
    print(f"   {name:36s} raw {rows[name]['raw']:.1%}   canonical {rows[name]['canonical']:.1%}")

cano = [v["canonical"] for v in rows.values()]
check("canonicalised accuracy does not depend on camera position (spread < 1 pt)", max(cano) - min(cano) < 0.01,
      f"{min(cano):.3f}-{max(cano):.3f}")
check("canonicalised accuracy stays above 80% in every condition", min(cano) > 0.80, f"{min(cano):.3f}")
check("raw model collapses under a webcam-like framing (the bug being fixed)",
      rows["webcam-like: 2.5x closer, lower"]["raw"] < 0.10, str(rows["webcam-like: 2.5x closer, lower"]))
check("canonicalised webcam-like framing is at least 20x better than raw",
      rows["webcam-like: 2.5x closer, lower"]["canonical"] > 20 * max(rows["webcam-like: 2.5x closer, lower"]["raw"], 0.002))

print("\n== live window: sign inside a 5 s buffer (12 fps) ==")


def resample(a, n=60):
    return a[np.linspace(0, len(a) - 1, n).astype(int)]


def buffer_around(clip, sign_frames):
    sign = resample(clip, sign_frames)
    pre = np.repeat(clip[:1], (60 - sign_frames) // 2, 0).copy()
    post = np.repeat(clip[-1:], 60 - sign_frames - len(pre), 0).copy()
    pre[:, :126] = 0
    post[:, :126] = 0
    return np.concatenate([pre, sign, post])


def crop_to_hands(buf):
    h = np.abs(buf[:, :126]).sum(1) > 0
    if h.sum() < 4:
        return buf
    idx = np.flatnonzero(h)
    return resample(buf[idx[0]:idx[-1] + 1])


win = {}
for sec, n in (("2.5 s", 30), ("3.0 s", 36), ("4.0 s", 48)):
    bufs = np.stack([buffer_around(c, n) for c in X])
    win[sec] = {"whole 5 s buffer (old)": acc(canon(bufs)),
                "cropped to the sign (now)": acc(canon(np.stack([crop_to_hands(b) for b in bufs])))}
    print(f"   sign {sec}: old {win[sec]['whole 5 s buffer (old)']:.1%}   now {win[sec]['cropped to the sign (now)']:.1%}")
check("cropping to the sign beats the whole buffer for a 2.5 s sign by >= 15 points",
      win["2.5 s"]["cropped to the sign (now)"] - win["2.5 s"]["whole 5 s buffer (old)"] >= 0.15)
check("cropping is never worse than the whole buffer",
      all(v["cropped to the sign (now)"] >= v["whole 5 s buffer (old)"] - 0.005 for v in win.values()))

print("\n== left-handed signers (input flipped) ==")
from preprocess import mirror_sequence as _mirror  # noqa: E402
mir = np.stack([_mirror(c) for c in X])
a_mir = acc(canon(mir))
a_fix = acc(canon(np.stack([_mirror(c) for c in mir])))
print(f"   mirrored clips, read as-is {a_mir:.1%}   flipped back first {a_fix:.1%}")
check("a mirrored (left-handed) signer is misread without the fix", a_mir < 0.35, f"{a_mir:.3f}")
check("flipping the input restores the right-handed accuracy exactly", abs(a_fix - acc(canon(X))) < 1e-9, f"{a_fix:.4f}")

out = ROOT.parent / "ml" / "logs" / "tne"
out.mkdir(parents=True, exist_ok=True)
(out / "camera_position.json").write_text(json.dumps({
    "model": "cnn as deployed (see canonical_retrain_report.json), served through canonicalize_pose; raw = same model WITHOUT canonicalisation",
    "test_clips": int(len(Y)),
    "body_position": rows,
    "live_window": win,
    "left_handed": {"mirrored_read_as_is": a_mir, "flipped_back": a_fix},
}, indent=2), encoding="utf-8")

print(f"\n{P} passed, {F} failed")
sys.exit(1 if F else 0)
