"""End-to-end tests for the account system.

Run:  cd backend && ..\\nndl\\Scripts\\python.exe test_auth.py

Uses a throwaway database so it never touches your real one. Every assertion
below is a claim the UI makes to the user, so if this passes, the copy on the
sign-in page is true.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import auth  # noqa: E402

# Point at a temp DB BEFORE anything creates the real one.
_tmp = Path(tempfile.mkdtemp()) / "test.db"
auth.DB_PATH = _tmp
auth.init_db()

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

app = FastAPI()
app.include_router(auth.router)
c = TestClient(app)

PASSED = 0
FAILED = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if cond:
        PASSED += 1
        print(f"  PASS  {name}")
    else:
        FAILED += 1
        print(f"  FAIL  {name}  {detail}")


print("\n=== hashing ===")
d1, s1 = auth.hash_password("correct horse battery")
check("verify accepts the right password", auth.verify_password("correct horse battery", d1, s1))
check("verify rejects a wrong password", not auth.verify_password("correct horse batteru", d1, s1))
d2, s2 = auth.hash_password("correct horse battery")
check("same password, different salt -> different hash", d1 != d2 and s1 != s2)
check("hash is 32 bytes", len(d1) == 32)
check("plaintext is not recoverable from the hash", b"correct" not in d1)

print("\n=== register ===")
r = c.post("/api/auth/register", json={"username": "radha", "password": "signlanguage1",
                                       "displayName": "Radha Krishna"})
check("register returns 200", r.status_code == 200, r.text)
tok = r.json().get("token", "")
check("register returns a token", len(tok) > 20)
check("register echoes the display name", r.json()["user"]["displayName"] == "Radha Krishna")
check("register never returns the password hash", "pw_hash" not in r.text and "password" not in r.text)

r = c.post("/api/auth/register", json={"username": "radha", "password": "another1234"})
check("duplicate username is rejected (409)", r.status_code == 409, r.text)

r = c.post("/api/auth/register", json={"username": "ab", "password": "longenough1"})
check("short username is rejected (400)", r.status_code == 400)

r = c.post("/api/auth/register", json={"username": "valid_name", "password": "short"})
check("short password is rejected (400)", r.status_code == 400)

r = c.post("/api/auth/register", json={"username": "bad name!", "password": "longenough1"})
check("username with spaces/punctuation is rejected", r.status_code == 400)

print("\n=== login ===")
r = c.post("/api/auth/login", json={"username": "radha", "password": "signlanguage1"})
check("correct password logs in", r.status_code == 200, r.text)
tok2 = r.json()["token"]
check("a second login issues a different token", tok2 != tok)

r = c.post("/api/auth/login", json={"username": "RADHA", "password": "signlanguage1"})
check("username is case-insensitive", r.status_code == 200)

r = c.post("/api/auth/login", json={"username": "radha", "password": "wrong-password"})
check("wrong password is rejected (401)", r.status_code == 401)

r = c.post("/api/auth/login", json={"username": "ghost", "password": "wrong-password"})
check("unknown user gives the same error as a wrong password (no enumeration)",
      r.status_code == 401 and "Wrong username or password" in r.text)

print("\n=== tokens ===")
H = {"Authorization": f"Bearer {tok}"}
r = c.get("/api/auth/me", headers=H)
check("a valid token identifies the user", r.status_code == 200 and r.json()["user"]["username"] == "radha")

r = c.get("/api/auth/me")
check("no token -> 401", r.status_code == 401)

r = c.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
check("forged token -> 401", r.status_code == 401)

r = c.get("/api/auth/me", headers={"Authorization": tok})
check("token without the Bearer prefix -> 401", r.status_code == 401)

with auth.db() as con:
    stored = con.execute("SELECT token_hash FROM tokens LIMIT 1").fetchone()["token_hash"]
check("the raw token is NOT stored in the database", stored != tok and tok not in stored)

print("\n=== per-user storage ===")
c.post("/api/auth/register", json={"username": "friend", "password": "otherpassword1"})
H2 = {"Authorization": f"Bearer {c.post('/api/auth/login', json={'username': 'friend', 'password': 'otherpassword1'}).json()['token']}"}

session = {"id": "s-1", "startedAt": "2026-01-01T00:00:00Z", "durationSec": 42,
           "model": "cnn", "signs": 3, "avgConfidence": 0.91,
           "entries": [{"ts": "0:01", "text": "doctor", "conf": 0.94}]}
r = c.post("/api/me/transcripts", json=session, headers=H)
check("a signed-in user can save a transcript", r.status_code == 200, r.text)

r = c.get("/api/me/transcripts", headers=H)
check("the transcript comes back", r.status_code == 200 and len(r.json()["sessions"]) == 1)
check("the transcript round-trips intact", r.json()["sessions"][0]["entries"][0]["text"] == "doctor")

r = c.get("/api/me/transcripts", headers=H2)
check("another user CANNOT see it", r.status_code == 200 and r.json()["sessions"] == [])

r = c.delete("/api/me/transcripts/s-1", headers=H2)
r = c.get("/api/me/transcripts", headers=H)
check("another user CANNOT delete it", len(r.json()["sessions"]) == 1)

r = c.post("/api/me/transcripts", json=session)
check("a guest cannot save a transcript (401)", r.status_code == 401)

c.post("/api/me/practice", json={"label": "doctor", "score": 0.72,
                                 "breakdown": {"handshape": 0.8}}, headers=H)
c.post("/api/me/practice", json={"label": "doctor", "score": 0.61, "breakdown": {}}, headers=H)
r = c.get("/api/me/practice", headers=H)
check("practice attempts are stored", len(r.json()["attempts"]) == 2)
check("best-per-word is computed", r.json()["perWord"][0]["best"] == 0.72
      and r.json()["perWord"][0]["attempts"] == 2)

r = c.get("/api/auth/me", headers=H)
check("stats reflect real rows", r.json()["stats"]["transcripts"] == 1
      and r.json()["stats"]["practiceAttempts"] == 2)

print("\n=== logout ===")
r = c.post("/api/auth/logout", headers=H)
check("logout returns ok", r.status_code == 200)
r = c.get("/api/auth/me", headers=H)
check("the token is dead after logout", r.status_code == 401)
r = c.get("/api/auth/me", headers={"Authorization": f"Bearer {tok2}"})
check("the OTHER session is still alive (per-token logout)", r.status_code == 200)

print("\n=== rate limiting ===")
auth._failures.clear()
codes = [c.post("/api/auth/login", json={"username": "radha", "password": "nope"}).status_code
         for _ in range(auth.MAX_FAILED + 2)]
check("repeated failures eventually return 429", 429 in codes, str(codes))
r = c.post("/api/auth/login", json={"username": "friend", "password": "otherpassword1"})
check("the lockout is per-username, not global", r.status_code == 200)

print("\n=== expiry ===")
auth._failures.clear()
tok3 = c.post("/api/auth/login", json={"username": "friend", "password": "otherpassword1"}).json()["token"]
with auth.db() as con:
    con.execute("UPDATE tokens SET expires_at = 1 WHERE token_hash = ?", (auth._hash_token(tok3),))
r = c.get("/api/auth/me", headers={"Authorization": f"Bearer {tok3}"})
check("an expired token is rejected", r.status_code == 401 and "expired" in r.text)

print(f"\n{'=' * 52}")
print(f"  {PASSED} passed, {FAILED} failed")
print("=" * 52)

try:
    os.unlink(_tmp)
except OSError:
    pass

raise SystemExit(1 if FAILED else 0)

sys.exit(1 if FAILED else 0)
