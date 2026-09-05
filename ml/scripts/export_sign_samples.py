"""Bundle a handful of real signs into the frontend.

Why this exists
---------------
The 3-D hand on the landing and sign-in pages performed signs by calling
/api/text-to-sign. That made a decorative, always-on element depend on the
backend being up — and when it was not, the hand just sat there in a rest pose,
which looks worse than the static overlay it replaced. A hero element should
not be able to fail.

So a small set of words is baked into the bundle at build time. The data is the
same landmark tensor the recogniser was trained on, quantised exactly as the
sign bank quantises it, so nothing here is invented or stylised — it is a real
signer's hand, just shipped as JS instead of fetched.

Only hand landmarks are exported (the 3-D rig has no torso), which keeps the
file small: 20 frames x 42 integers per hand.

    cd ml && python scripts/export_sign_samples.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BANK = ROOT / "backend" / "models" / "sign_bank.json"
OUT = ROOT / "frontend" / "src" / "lib" / "signSamples.js"

# Chosen to be recognisable and to cover both one- and two-handed signs.
# Every one is checked against the bank below; anything missing is dropped with
# a warning rather than silently shipped as a broken entry.
WANTED = [
    "hello", "friend", "teacher", "doctor", "book", "school",
    "family", "mother", "happy", "beautiful", "morning", "today",
    "city", "money", "student", "good",
]


def main() -> None:
    if not BANK.exists():
        raise SystemExit(
            f"{BANK} not found.\n"
            "Build it first:  cd ml && python scripts/build_sign_bank.py"
        )

    bank = json.loads(BANK.read_text(encoding="utf-8"))
    words = bank["words"]

    out: dict[str, dict] = {}
    missing: list[str] = []

    for w in WANTED:
        entry = words.get(w)
        if entry is None or not entry.get("frames"):
            missing.append(w)
            continue
        # Hands only. The rig draws 21 points; the pose block is for the 2-D
        # full-body player, which fetches from the API anyway.
        frames = [
            {"l": f.get("l"), "r": f.get("r")}
            for f in entry["frames"]
        ]
        out[w] = {
            "frames": frames,
            "hands": entry.get("hands"),
            "takes": entry.get("takes"),
        }

    if missing:
        print(f"  warning: not in the bank, skipped: {', '.join(missing)}")
    if not out:
        raise SystemExit("nothing exported — is the sign bank empty?")

    payload = {
        "fps": bank.get("fps", 12),
        "quant": bank.get("quant", 1000),
        "words": out,
    }

    body = json.dumps(payload, separators=(",", ":"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Produced by ml/scripts/export_sign_samples.py from\n"
        "// backend/models/sign_bank.json. These are real landmark recordings\n"
        "// from the INCLUDE dataset, quantised the same way the sign bank\n"
        "// quantises them — the same data the recogniser was trained on.\n"
        "//\n"
        "// They are bundled so the 3-D hand can perform real signs even when\n"
        "// the backend is not running. The full 261-word vocabulary still\n"
        "// comes from the API; this is a subset for the hero elements.\n"
        "//\n"
        f"// {len(out)} words, {sum(len(v['frames']) for v in out.values())} frames total.\n"
        "// Re-run the script after retraining.\n\n"
        f"const DATA = {body};\n\n"
        "export const SAMPLE_FPS = DATA.fps;\n"
        "export const SAMPLE_QUANT = DATA.quant;\n"
        "export const SAMPLE_WORDS = Object.keys(DATA.words);\n\n"
        "/** Frames for one bundled word, or null. Shape matches /api/text-to-sign. */\n"
        "export function sampleSign(word) {\n"
        "  const e = DATA.words[word];\n"
        "  return e ? { frames: e.frames, hands: e.hands, takes: e.takes } : null;\n"
        "}\n",
        encoding="utf-8",
    )

    kb = OUT.stat().st_size / 1024
    print(f"OK  {len(out)} words, {kb:.0f} KB  ->  {OUT.relative_to(ROOT)}")
    for w, v in out.items():
        print(f"      {w:<12} {len(v['frames']):>3} frames  {v['hands']}  ({v['takes']} takes)")


if __name__ == "__main__":
    main()
