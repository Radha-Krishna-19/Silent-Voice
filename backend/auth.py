"""Accounts, sessions and per-user storage.

Why this exists
---------------
Before this, "sign in" was a decorative form and everything lived in
localStorage, which meant an account and a guest were the same thing wearing
different labels. This module makes the distinction real:

    signed in  ->  transcripts and practice history are rows in a database on
                   the server, keyed to a user id, and survive clearing the
                   browser, switching browsers, or using a different machine
                   on the same network.
    guest      ->  nothing is written anywhere. No row, no file, no localStorage
                   key. Close the tab and it is genuinely gone.

Security, stated honestly
-------------------------
  * Passwords are stored as scrypt hashes with a per-user 16-byte random salt.
    scrypt is memory-hard, so a stolen database is expensive to attack. The
    plaintext is never written to disk and never logged.
  * Comparisons use hmac.compare_digest, so a wrong password takes the same
    time to reject regardless of how nearly right it was.
  * Tokens are 32 bytes from secrets.token_urlsafe and are stored HASHED, so
    read access to the database still does not let you impersonate a live
    session.
  * Failed logins are rate limited per username.

What it is NOT: this server speaks plain HTTP on localhost. There is no TLS,
so on a hostile network the password is visible in transit. It is an academic
demo you run on your own machine, and it should not be exposed to the internet
as-is. That limitation is documented rather than hidden.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

DB_PATH = Path(__file__).parent / "data" / "silentvoice.db"

# scrypt parameters. n=2**14 costs ~16 MB and a few tens of milliseconds per
# hash: slow enough to make offline cracking painful, fast enough that logging
# in feels instant.
_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)

TOKEN_TTL = 30 * 24 * 3600          # 30 days
MAX_FAILED = 8                       # per username, per window
FAIL_WINDOW = 15 * 60                # 15 minutes

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,32}$")
MIN_PASSWORD = 8

router = APIRouter(prefix="/api", tags=["auth"])

# username -> [timestamps of failed attempts]. In-memory on purpose: a restart
# clearing the lockout is acceptable for a single-user local demo, and it keeps
# the failure path from touching disk.
_failures: dict[str, list[float]] = {}


# --------------------------------------------------------------------------- #
# database
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT    NOT NULL,
    pw_hash      BLOB    NOT NULL,
    pw_salt      BLOB    NOT NULL,
    created_at   REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL    NOT NULL,
    expires_at REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL    NOT NULL,
    payload    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS practice (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL    NOT NULL,
    label      TEXT    NOT NULL,
    score      REAL    NOT NULL,
    breakdown  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_user   ON transcripts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_user   ON practice(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tok_user  ON tokens(user_id);
"""


@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db() -> None:
    with db() as con:
        con.executescript(SCHEMA)
        # Opportunistic cleanup: expired tokens are dead weight.
        con.execute("DELETE FROM tokens WHERE expires_at < ?", (time.time(),))


# --------------------------------------------------------------------------- #
# hashing
# --------------------------------------------------------------------------- #
def hash_password(password: str, salt: Optional[bytes] = None) -> tuple[bytes, bytes]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, **_SCRYPT)
    return digest, salt


def verify_password(password: str, digest: bytes, salt: bytes) -> bool:
    candidate = hashlib.scrypt(password.encode("utf-8"), salt=salt, **_SCRYPT)
    return hmac.compare_digest(candidate, digest)


def _hash_token(token: str) -> str:
    """Tokens live in the DB hashed, so DB read access != session hijack."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    with db() as con:
        con.execute(
            "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
            (_hash_token(token), user_id, now, now + TOKEN_TTL),
        )
    return token


# --------------------------------------------------------------------------- #
# rate limiting
# --------------------------------------------------------------------------- #
def _record_failure(username: str) -> None:
    now = time.time()
    hits = [t for t in _failures.get(username.lower(), []) if now - t < FAIL_WINDOW]
    hits.append(now)
    _failures[username.lower()] = hits


def _is_locked(username: str) -> int:
    """Returns seconds remaining in the lockout, or 0."""
    now = time.time()
    hits = [t for t in _failures.get(username.lower(), []) if now - t < FAIL_WINDOW]
    _failures[username.lower()] = hits
    if len(hits) < MAX_FAILED:
        return 0
    return int(FAIL_WINDOW - (now - hits[0])) + 1


# --------------------------------------------------------------------------- #
# dependency
# --------------------------------------------------------------------------- #
def current_user(authorization: str = Header(default="")) -> sqlite3.Row:
    """Resolve `Authorization: Bearer <token>` to a user row, or 401."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="not signed in")
    token = authorization.split(" ", 1)[1].strip()
    with db() as con:
        row = con.execute(
            """SELECT u.*, t.expires_at FROM tokens t
               JOIN users u ON u.id = t.user_id
               WHERE t.token_hash = ?""",
            (_hash_token(token),),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="session not recognised")
    if row["expires_at"] < time.time():
        raise HTTPException(status_code=401, detail="session expired — sign in again")
    return row


def _public(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "createdAt": row["created_at"],
    }


# --------------------------------------------------------------------------- #
# models
# --------------------------------------------------------------------------- #
class RegisterIn(BaseModel):
    username: str
    password: str
    displayName: str = ""


class LoginIn(BaseModel):
    username: str
    password: str


class TranscriptIn(BaseModel):
    id: str
    startedAt: str
    durationSec: float = 0
    model: str = "cnn"
    signs: int = 0
    avgConfidence: float = 0
    entries: list = Field(default_factory=list)


class PracticeIn(BaseModel):
    label: str
    score: float
    breakdown: dict = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# endpoints
# --------------------------------------------------------------------------- #
@router.post("/auth/register")
def register(body: RegisterIn):
    username = body.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-32 characters: letters, numbers, dot, dash or underscore.",
        )
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD} characters.",
        )

    digest, salt = hash_password(body.password)
    display = (body.displayName or username).strip()[:64]

    try:
        with db() as con:
            cur = con.execute(
                "INSERT INTO users (username, display_name, pw_hash, pw_salt, created_at)"
                " VALUES (?,?,?,?,?)",
                (username, display, digest, salt, time.time()),
            )
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="That username is already taken.")

    with db() as con:
        row = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"token": _issue_token(user_id), "user": _public(row)}


@router.post("/auth/login")
def login(body: LoginIn):
    username = body.username.strip()
    locked = _is_locked(username)
    if locked:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {locked // 60 + 1} minute(s).",
        )

    with db() as con:
        row = con.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
        ).fetchone()

    # Hash even when the user does not exist, so a missing account and a wrong
    # password take the same time — otherwise the timing enumerates usernames.
    if row is None:
        hash_password(body.password, salt=b"\x00" * 16)
        _record_failure(username)
        raise HTTPException(status_code=401, detail="Wrong username or password.")

    if not verify_password(body.password, row["pw_hash"], row["pw_salt"]):
        _record_failure(username)
        raise HTTPException(status_code=401, detail="Wrong username or password.")

    _failures.pop(username.lower(), None)
    return {"token": _issue_token(row["id"]), "user": _public(row)}


@router.post("/auth/logout")
def logout(authorization: str = Header(default="")):
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        with db() as con:
            con.execute("DELETE FROM tokens WHERE token_hash = ?", (_hash_token(token),))
    return {"ok": True}


@router.get("/auth/me")
def me(user: sqlite3.Row = Depends(current_user)):
    with db() as con:
        tx = con.execute(
            "SELECT COUNT(*) c FROM transcripts WHERE user_id = ?", (user["id"],)
        ).fetchone()["c"]
        pr = con.execute(
            "SELECT COUNT(*) c, AVG(score) a FROM practice WHERE user_id = ?", (user["id"],)
        ).fetchone()
    return {
        "user": _public(user),
        "stats": {
            "transcripts": tx,
            "practiceAttempts": pr["c"],
            "practiceMean": round(pr["a"], 4) if pr["a"] is not None else None,
        },
    }


# ----------------------------- transcripts ----------------------------- #
@router.get("/me/transcripts")
def list_transcripts(user: sqlite3.Row = Depends(current_user)):
    with db() as con:
        rows = con.execute(
            "SELECT payload FROM transcripts WHERE user_id = ? ORDER BY created_at DESC LIMIT 200",
            (user["id"],),
        ).fetchall()
    return {"sessions": [json.loads(r["payload"]) for r in rows]}


@router.post("/me/transcripts")
def save_transcript(body: TranscriptIn, user: sqlite3.Row = Depends(current_user)):
    payload = body.model_dump()
    with db() as con:
        con.execute(
            "INSERT OR REPLACE INTO transcripts (id, user_id, created_at, payload) VALUES (?,?,?,?)",
            (body.id, user["id"], time.time(), json.dumps(payload)),
        )
    return {"ok": True, "id": body.id}


@router.delete("/me/transcripts/{tid}")
def delete_transcript(tid: str, user: sqlite3.Row = Depends(current_user)):
    with db() as con:
        con.execute("DELETE FROM transcripts WHERE id = ? AND user_id = ?", (tid, user["id"]))
    return {"ok": True}


# ------------------------------ practice ------------------------------- #
@router.get("/me/practice")
def list_practice(user: sqlite3.Row = Depends(current_user)):
    with db() as con:
        rows = con.execute(
            """SELECT label, score, breakdown, created_at FROM practice
               WHERE user_id = ? ORDER BY created_at DESC LIMIT 500""",
            (user["id"],),
        ).fetchall()
        best = con.execute(
            """SELECT label, MAX(score) best, COUNT(*) attempts FROM practice
               WHERE user_id = ? GROUP BY label ORDER BY best DESC""",
            (user["id"],),
        ).fetchall()
    return {
        "attempts": [
            {
                "label": r["label"],
                "score": r["score"],
                "breakdown": json.loads(r["breakdown"]),
                "at": r["created_at"],
            }
            for r in rows
        ],
        "perWord": [
            {"label": b["label"], "best": b["best"], "attempts": b["attempts"]} for b in best
        ],
    }


@router.post("/me/practice")
def save_practice(body: PracticeIn, user: sqlite3.Row = Depends(current_user)):
    with db() as con:
        con.execute(
            "INSERT INTO practice (user_id, created_at, label, score, breakdown) VALUES (?,?,?,?,?)",
            (user["id"], time.time(), body.label, body.score, json.dumps(body.breakdown)),
        )
    return {"ok": True}
