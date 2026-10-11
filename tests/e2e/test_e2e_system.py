"""Automated end-to-end system tests: real browser, real backend, real models.

Drives the built React app in headless Chromium against a running backend.
The webcam is Chromium's fake camera (a synthetic test pattern), so these tests
prove the integration works end to end (camera -> WebSocket -> MediaPipe ->
model -> UI), not recognition accuracy, which the model tests measure.

    # terminal 1: backend          cd backend && python server.py
    # terminal 2: built frontend   (any static server on port 3000 with SPA fallback)
    pip install playwright && python tests/e2e/test_e2e_system.py

Env: SV_FRONTEND (default http://localhost:3000), SV_BACKEND (default http://localhost:8000).
Screenshots and results go to ml/logs/tne/e2e/.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

FRONT = os.environ.get("SV_FRONTEND", "http://localhost:3000").rstrip("/")
BACK = os.environ.get("SV_BACKEND", "http://localhost:8000").rstrip("/")
OUT = Path(os.environ.get("SV_E2E_OUT", Path(__file__).resolve().parents[2] / "ml" / "logs" / "tne" / "e2e"))
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(case, name, cond, detail=""):
    results.append({"id": case, "name": name, "passed": bool(cond), "detail": detail})
    print(f"  {'PASS' if cond else 'FAIL'}  [{case}] {name}" + (f"  ({detail})" if detail else ""), flush=True)


status = json.load(urllib.request.urlopen(f"{BACK}/api/status", timeout=30))
check("E2E-01", "backend /api/status reports both models loaded", set(status.get("models", [])) >= {"bilstm", "cnn"},
      f"models={status.get('models')}, labels={status.get('num_labels')}")

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, permissions=["camera"])
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    pg.goto(f"{FRONT}/")
    pg.get_by_test_id("gate-guest").click()
    pg.wait_for_url("**/home", timeout=15000)
    check("E2E-02", "gate: 'Continue as guest' opens the home page", "/home" in pg.url)
    pg.screenshot(path=str(OUT / "e2e_02_home.png"))

    frames = {"sent": 0, "recv": 0, "last": None}

    def on_ws(ws):
        ws.on("framesent", lambda _: frames.__setitem__("sent", frames["sent"] + 1))

        def got(payload):
            frames["recv"] += 1
            try:
                frames["last"] = json.loads(payload)
            except Exception:
                pass
        ws.on("framereceived", got)
    pg.on("websocket", on_ws)
    pg.goto(f"{FRONT}/live")
    pg.get_by_test_id("live-camera-btn").click()
    pg.wait_for_timeout(12000)
    last = frames["last"] or {}
    check("E2E-03", "live: webcam frames stream over the WebSocket and the server answers",
          frames["sent"] >= 10 and frames["recv"] >= 10, f"sent {frames['sent']}, received {frames['recv']}, server_ms {last.get('server_ms')}")
    check("E2E-04", "live: no caption is invented for an empty scene (fake camera shows no person)",
          not (last.get("prediction") or {}).get("label"), f"hands_visible={last.get('hands_visible')}")
    pg.screenshot(path=str(OUT / "e2e_03_live_streaming.png"))
    mon = json.load(urllib.request.urlopen(f"{BACK}/api/monitor", timeout=30))
    check("E2E-10", "monitor: /api/monitor counts the streamed frames (production monitoring is live)",
          mon.get("frames_processed", 0) >= 10, f"frames_processed {mon.get('frames_processed')}, hand_visible_rate {mon.get('hand_visible_rate')}")
    pg.get_by_test_id("live-camera-btn").click()

    pg.goto(f"{FRONT}/reverse")
    pg.get_by_test_id("reverse-input").fill("where is the doctor tomorrow")
    pg.get_by_test_id("reverse-submit").click()
    pg.wait_for_timeout(4000)
    body = pg.inner_text("body")
    check("E2E-05", "reverse: 'where is the doctor tomorrow' is glossed TOMORROW DOCTOR WHERE",
          all(w in body for w in ("TOMORROW", "DOCTOR", "WHERE")) and body.find("TOMORROW") < body.find("WHERE"))
    pg.screenshot(path=str(OUT / "e2e_05_reverse.png"))

    pg.goto(f"{FRONT}/research")
    pg.wait_for_timeout(4000)
    body = pg.inner_text("body")
    check("E2E-06", "research: page shows the measured accuracy from comparison.json", "94.5" in body or "91.7" in body)
    pg.screenshot(path=str(OUT / "e2e_06_research.png"), full_page=False)

    pg.goto(f"{FRONT}/practice")
    pg.wait_for_timeout(4000)
    body = pg.inner_text("body").lower()
    check("E2E-07", "practice: page loads the list of practisable words from the backend", "hello" in body or "doctor" in body)
    pg.screenshot(path=str(OUT / "e2e_07_practice.png"))

    pg.goto(f"{FRONT}/contribute")
    pg.wait_for_timeout(3000)
    check("E2E-08", "contribute: page renders with the review queue", "contribut" in pg.inner_text("body").lower())
    pg.screenshot(path=str(OUT / "e2e_08_contribute.png"))

    check("E2E-09", "no uncaught JavaScript errors on any page", not errors, "; ".join(errors[:2]))
    b.close()

ok = all(r["passed"] for r in results)
json.dump({"run_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "frontend": FRONT, "backend": BACK,
           "passed": sum(r["passed"] for r in results), "failed": sum(not r["passed"] for r in results), "cases": results},
          open(OUT / "e2e_results.json", "w"), indent=1)
print(f"\n{sum(r['passed'] for r in results)} passed, {sum(not r['passed'] for r in results)} failed")
sys.exit(0 if ok else 1)
