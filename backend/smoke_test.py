"""End-to-end smoke test of the running app, in-process (no browser, no webcam).

    cd backend
    python smoke_test.py

Exercises every API the frontend calls, through FastAPI's TestClient, so the
startup hook, model loading, routing, JSON shapes and the WebSocket protocol are
all real. What it cannot do is put a human in front of a camera: the WebSocket
frames are plain JPEGs (no person in them), so that part proves the protocol and
the record -> classify -> respond loop, while recognition accuracy is proven
separately on real landmark tensors from the held-out test split.
"""
from __future__ import annotations

import base64
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

# Isolate writes: auth DB and contributions go to a temp dir, not the real ones.
_TMP = Path(tempfile.mkdtemp(prefix="sv_smoke_"))
os.environ.setdefault("SV_DB_PATH", str(_TMP / "auth.db"))
os.environ["SV_CONTRIB_ROOT"] = str(_TMP / "contrib")

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402

PASS = FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {detail}")


def jpeg_b64(seed: int = 0) -> str:
    rng = np.random.default_rng(seed)
    img = (rng.random((360, 480, 3)) * 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


def test_split_tensors(n: int | None = None):
    """Real recognition check: held-out test tensors -> /predict path."""
    import inference
    from sklearn.model_selection import train_test_split
    paths = sorted((ROOT.parent / "ml" / "data" / "processed" / "include").glob("*.npy"))
    if not paths:
        return None
    labels = sorted({p.stem.split("__")[0] for p in paths})
    y = [labels.index(p.stem.split("__")[0]) for p in paths]
    _, tmp, _, ty = train_test_split(paths, y, test_size=0.30, stratify=y, random_state=42)
    _, test, _, _ = train_test_split(tmp, ty, test_size=0.50, stratify=ty, random_state=42)
    test = test[:n] if n else test
    sys.path.insert(0, str(ROOT.parent / "ml" / "scripts"))
    from preprocess import canonicalize_pose  # the server canonicalises every window before predict
    hit = sum(inference.predict(canonicalize_pose(np.load(p)), "cnn")["label"] == p.stem.split("__")[0] for p in test)
    return hit / len(test)


def main() -> int:
    with TestClient(server.app) as c:
        print("\n== status / models")
        st = c.get("/api/status").json()
        check("models loaded (not mock)", "cnn" in st.get("models", []), json.dumps(st)[:200])
        check("261+ classes", st.get("num_labels", 0) >= 261)

        acc = test_split_tensors()
        if acc is not None:
            check(f"CNN on held-out test clips: {acc:.1%}", acc > 0.9)

        print("\n== reverse translation (English -> sign)")
        r = c.post("/api/text-to-sign", json={"text": "hello, thank you"}).json()
        check("text-to-sign returns a sequence", isinstance(r, dict) and bool(r), str(r)[:200])
        items = r.get("items") or r.get("sequence") or r.get("signs") or []
        check("at least one sign has frames", any((i.get("frames") or i.get("found")) for i in items) if items else False,
              str(r)[:300])
        h3 = [i for i in items if i.get("available")]
        check("every playable word carries a 3-D hand clip (Reverse 3D view)",
              bool(h3) and all(i.get("hands3d") and len(i["hands3d"][0]) == 126 for i in h3), str(h3)[:200])
        g = c.post("/api/text-to-gloss", json={"text": "where is the doctor"}).json()
        check("text-to-gloss works", bool(g), str(g)[:200])
        v = c.get("/api/vocabulary").json()
        check("vocabulary non-empty", v.get("count", 0) > 0)

        print("\n== sentence formation")
        s = c.post("/api/sentence", json={"words": ["i", "go", "hospital"]}).json()
        check("gloss -> sentence", bool(s.get("sentence")), str(s))

        print("\n== practice")
        w = c.get("/api/practice/words").json()
        check("practice words available", w.get("available") and w.get("count", 0) > 0, str(w)[:200])
        refs = np.load(ROOT / "models" / "practice_refs.npz")
        lab = str(refs["labels"][0])
        win = refs["refs"][0].astype(np.float32).tolist()
        sc = c.post("/api/practice/score", json={"label": lab, "window": win}).json()
        check(f"practice: reference scored against itself ({lab})", sc.get("available", True) and
              sc.get("score", 0) >= 0.8, str(sc)[:300])

        print("\n== live recognition WebSocket (capture mode)")
        with c.websocket_connect("/ws/frame") as ws:
            for i in range(6):
                ws.send_json({"image": jpeg_b64(i), "record": True, "mode": "capture", "model": "cnn"})
                m = ws.receive_json()
            check("frames accepted while recording", m.get("recording") is True, str(m)[:200])
            ws.send_json({"image": jpeg_b64(9), "record": False, "mode": "capture", "model": "cnn"})
            m = ws.receive_json()
            p = m.get("prediction") or {}
            check("release -> real (non-mock) prediction", m.get("finished") and p.get("mock") is False, str(m)[:300])
            check("landmark overlay payload present", set(m.get("landmarks", {})) >= {"left", "right", "pose"})
        with c.websocket_connect("/ws/frame") as ws:
            for i in range(6):
                ws.send_json({"image": jpeg_b64(i), "record": True, "mode": "capture", "practice_label": lab})
                ws.receive_json()
            ws.send_json({"image": jpeg_b64(9), "record": False, "mode": "capture", "practice_label": lab})
            m = ws.receive_json()
            pr = m.get("practice") or {}
            check("practice attempt scored in the same WebSocket message", pr.get("available") is True and "score" in pr, str(pr)[:200])
        ref = c.get(f"/api/practice/reference/{lab}").json()
        fr = ref.get("frames") or []
        check("3-D reference served: (60, 126) hand landmarks", len(fr) == 60 and len(fr[0]) == 126, str(ref)[:150])
        check("unknown word -> 404", c.get("/api/practice/reference/not_a_word").status_code == 404)
        sc = c.post("/api/practice/score", json={"label": lab}).json()
        check("practice can score the last live capture", "error" not in sc or sc.get("available") is not False, str(sc)[:200])

        print("\n== contribute (video upload -> skeleton -> training set)")
        stats0 = c.get("/api/contributions").json()
        check("contributions endpoint", "total" in stats0, str(stats0))
        vid = _make_test_video(_TMP / "clip.webm")
        if vid is None:
            check("could encode a test video", False, "no VP8/VP9 encoder in this OpenCV build")
        else:
            r = c.post("/api/contribute/video?label=Thank%20You", content=vid.read_bytes(),
                       headers={"Content-Type": "video/webm"}).json()
            check("video stored", r.get("video_saved") is True, str(r))
            check("skeleton extracted from video", r.get("frames", 0) > 0, str(r))
            # no person in the synthetic clip, so it is correctly rejected for training
            check("clip without hands is NOT added to training", r.get("tensor_saved") is False, str(r))
            stats1 = c.get("/api/contributions").json()
            check("video counted", stats1.get("videos", 0) == stats0.get("videos", 0) + 1, str(stats1))
        bad = c.post("/api/contribute/video?label=", content=b"x", headers={"Content-Type": "video/webm"})
        check("empty label rejected", bad.status_code == 400)

        tr = c.get("/api/contribute/retrain").json()
        check("retrain status endpoint", "running" in tr, str(tr))

        print("\n== accounts")
        u = "smoke_user"
        r = c.post("/api/auth/register", json={"username": u, "password": "correct-horse-9"})
        check("register", r.status_code in (200, 201), r.text[:200])
        r = c.post("/api/auth/login", json={"username": u, "password": "correct-horse-9"})
        check("login", r.status_code == 200 and "token" in r.json(), r.text[:200])

        print("\n== results page")
        comp = c.get("/api/comparison").json()
        check("comparison results available", comp.get("available") is True)

    shutil.rmtree(_TMP, ignore_errors=True)
    print(f"\n{'=' * 52}\n  {PASS} passed, {FAIL} failed\n{'=' * 52}")
    return 1 if FAIL else 0


def _make_test_video(path: Path) -> Path | None:
    for fourcc in ("VP80", "VP90"):
        vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), 15, (320, 240))
        if not vw.isOpened():
            continue
        for i in range(30):
            img = np.full((240, 320, 3), 40, np.uint8)
            cv2.circle(img, (40 + i * 8, 120), 20, (200, 200, 200), -1)
            vw.write(img)
        vw.release()
        if path.exists() and path.stat().st_size > 0:
            return path
    return None


if __name__ == "__main__":
    raise SystemExit(main())
