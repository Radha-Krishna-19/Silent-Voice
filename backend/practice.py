"""Practice-mode scoring: how close was the learner's attempt to the reference?

This is a real measurement, not a decorative number. The learner's recorded
window and the reference recording are both (60, 225) landmark tensors in the
same feature space the recogniser uses, so they can be compared directly.

Three sub-scores, because "you scored 71" tells a learner nothing:

  HANDSHAPE  cosine similarity of the wrist-relative hand blocks (cols 0:126).
             These encode finger configuration independently of where the hands
             are, so this answers "is your hand making the right shape?"

  LOCATION   distance between wrist positions in pose space, normalised by
             shoulder width. Answers "are your hands in the right place?" — in
             sign languages location is phonemic, not cosmetic.

  MOVEMENT   correlation of frame-to-frame motion energy. Answers "is the
             gesture travelling the same way through time?", and catches an
             attempt that hits the right poses in the wrong order or tempo.

Deliberate limits, stated because a learner should not be misled:
  * There is no ground truth for "correct" beyond a single reference take, so a
    valid regional or personal variant will score low.
  * Non-manual markers (face, mouth, head tilt) are not captured at all.
  * A left-handed signer performing a right-handed reference is mirrored, and
    scored as different. `mirror=True` compensates.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np

REFS_PATH = Path(__file__).parent / "models" / "practice_refs.npz"

L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST = 11, 12, 15, 16
_POSE_SWAP = [(1, 4), (2, 5), (3, 6), (7, 8), (9, 10), (11, 12), (13, 14),
              (15, 16), (17, 18), (19, 20), (21, 22), (23, 24), (25, 26),
              (27, 28), (29, 30), (31, 32)]


@lru_cache(maxsize=1)
def _load() -> tuple[list[str], np.ndarray]:
    if not REFS_PATH.exists():
        return [], np.zeros((0, 60, 225), dtype=np.float32)
    d = np.load(REFS_PATH, allow_pickle=False)
    return [str(x) for x in d["labels"]], d["refs"].astype(np.float32)


def available() -> bool:
    return len(_load()[0]) > 0


def vocabulary() -> list[str]:
    return _load()[0]


def _mirror(x: np.ndarray) -> np.ndarray:
    out = x.copy()
    left, right = out[:, 0:63].copy(), out[:, 63:126].copy()
    out[:, 0:63], out[:, 63:126] = right, left
    out[:, 0:126:3] *= -1.0
    pose = out[:, 126:225].reshape(-1, 33, 3)
    pose[:, :, 0] = 1.0 - pose[:, :, 0]
    for a, b in _POSE_SWAP:
        pose[:, [a, b]] = pose[:, [b, a]]
    out[:, 126:225] = pose.reshape(len(out), 99)
    return out


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def _handshape(user: np.ndarray, ref: np.ndarray) -> float:
    """Per-frame cosine over the wrist-relative hand blocks, averaged."""
    sims = []
    for u, r in zip(user[:, 0:126], ref[:, 0:126]):
        if np.abs(u).max() < 1e-9 and np.abs(r).max() < 1e-9:
            continue                       # both hands absent — no information
        sims.append(_cosine(u, r))
    return float(np.mean(sims)) if sims else 0.0


def _location(user: np.ndarray, ref: np.ndarray) -> float:
    """Wrist placement, in shoulder-widths. 0 error -> 1.0, 1 shoulder -> ~0."""
    def wrists(t):
        p = t[:, 126:225].reshape(len(t), 33, 3)[:, :, :2]
        sw = np.linalg.norm(p[:, L_SHOULDER] - p[:, R_SHOULDER], axis=1)
        sw = np.where(sw > 1e-3, sw, 1.0)
        origin = (p[:, L_SHOULDER] + p[:, R_SHOULDER]) / 2
        return (p[:, [L_WRIST, R_WRIST]] - origin[:, None, :]) / sw[:, None, None]

    d = np.linalg.norm(wrists(user) - wrists(ref), axis=2).mean()
    return float(np.exp(-d))               # 0 -> 1.0, 1 shoulder-width -> 0.37


def _movement(user: np.ndarray, ref: np.ndarray) -> float:
    """Correlation of motion energy over time — tempo and travel, not pose."""
    def energy(t):
        e = np.zeros(len(t))
        e[1:] = np.abs(np.diff(t[:, 0:126], axis=0)).mean(axis=1)
        return e
    eu, er = energy(user), energy(ref)
    if eu.std() < 1e-8 or er.std() < 1e-8:
        return 0.0
    c = float(np.corrcoef(eu, er)[0, 1])
    return max(0.0, c)                      # anti-correlation is just "wrong"


def score(user_window: list | np.ndarray, label: str, *, mirror: bool = False) -> dict:
    """Score one attempt. `user_window` is (60, 225) as produced by preprocess."""
    labels, refs = _load()
    if not labels:
        return {"available": False,
                "error": "practice_refs.npz missing — run ml/scripts/build_practice_refs.py"}
    if label not in labels:
        return {"available": False, "error": f"'{label}' is not in the vocabulary"}

    user = np.asarray(user_window, dtype=np.float32)
    if user.ndim != 2 or user.shape[1] != 225:
        return {"available": False, "error": f"expected (T, 225), got {user.shape}"}
    if mirror:
        user = _mirror(user)

    ref = refs[labels.index(label)]
    if len(user) != len(ref):                       # resample to the reference length
        idx = np.linspace(0, len(user) - 1, len(ref)).astype(int)
        user = user[idx]

    hs = _handshape(user, ref)
    loc = _location(user, ref)
    mov = _movement(user, ref)

    # Handshape and location are what make a sign that sign. Movement is
    # weighted lightly on purpose: measured across takes of the SAME word it
    # correlates only 0.0-0.35, because signers vary tempo far more than they
    # vary shape or placement. Weighting it heavily would punish correct
    # attempts for being fast or slow.
    overall = 0.45 * max(hs, 0.0) + 0.40 * loc + 0.15 * mov

    notes = []
    if hs < 0.55:
        notes.append("Hand shape differs from the reference — check finger positions.")
    elif hs < 0.75:
        notes.append("Hand shape is close. Tighten the finger configuration.")
    else:
        notes.append("Hand shape matches the reference well.")

    if loc < 0.55:
        notes.append("Hands are in the wrong place relative to your shoulders. "
                     "Location carries meaning in ISL, so this changes the sign.")
    elif loc < 0.78:
        notes.append("Placement is roughly right but drifting — watch the reference height.")
    else:
        notes.append("Hand placement is accurate.")

    if mov < 0.35:
        notes.append("The movement pattern does not track the reference — "
                     "check the direction and order of motion.")
    elif mov < 0.65:
        notes.append("Movement is recognisable but the timing differs.")
    else:
        notes.append("Movement and tempo track the reference closely.")

    detected = float((np.abs(user[:, 0:126]) > 1e-9).any(axis=1).mean())
    if detected < 0.6:
        notes.append(f"Hands were only detected in {detected*100:.0f}% of frames — "
                     "move closer to the camera or improve the lighting.")

    return {
        "available": True,
        "label": label,
        "score": round(float(np.clip(overall, 0, 1)), 4),
        "handshape": round(float(np.clip(hs, 0, 1)), 4),
        "location": round(float(loc), 4),
        "movement": round(float(mov), 4),
        "hand_detection": round(detected, 3),
        "mirrored": mirror,
        "notes": notes,
        "reference_frames": int(len(ref)),
    }
