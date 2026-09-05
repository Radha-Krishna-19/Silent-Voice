/**
 * Account state for the browser.
 *
 * Two modes, and the difference is real rather than cosmetic:
 *
 *   ACCOUNT — a bearer token from /api/auth/login. Transcripts and practice
 *             attempts are written to a SQLite database on the server, so they
 *             survive clearing this browser and follow you to another one.
 *   GUEST   — no token. Nothing is written: not to the server, not to
 *             localStorage. The transcript list lives in React state for as
 *             long as the tab is open and then it is gone.
 *
 * The only thing kept in localStorage is the token itself (so a reload does not
 * sign you out) and the guest flag (so the gate does not reappear every time).
 * If you sign out, both are removed.
 */
import { useEffect, useState } from "react";
import { API } from "./api";

const TOKEN_KEY = "silentvoice.token.v1";
const GUEST_KEY = "silentvoice.guest.v1";
export const AUTH_EVENT = "silentvoice:auth-change";

function readLS(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLS(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* private mode */ }
}

export function getToken() {
  return readLS(TOKEN_KEY);
}

export function isGuest() {
  return readLS(GUEST_KEY) === "1";
}

/** Neither signed in nor explicitly a guest — i.e. show the gate. */
export function needsGate() {
  return !getToken() && !isGuest();
}

function broadcast() {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

export function continueAsGuest() {
  writeLS(GUEST_KEY, "1");
  writeLS(TOKEN_KEY, null);
  broadcast();
}

export function signOut() {
  const token = getToken();
  writeLS(TOKEN_KEY, null);
  writeLS(GUEST_KEY, null);
  broadcast();
  // Fire and forget: the token is already gone locally, and the server call is
  // just housekeeping to delete the row.
  if (token) {
    fetch(`${API}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * network
 * ------------------------------------------------------------------ */
async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Start it with: cd backend && python server.py"
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

export async function register(username, password, displayName) {
  const data = await post("/auth/register", { username, password, displayName });
  writeLS(TOKEN_KEY, data.token);
  writeLS(GUEST_KEY, null);
  broadcast();
  return data.user;
}

export async function login(username, password) {
  const data = await post("/auth/login", { username, password });
  writeLS(TOKEN_KEY, data.token);
  writeLS(GUEST_KEY, null);
  broadcast();
  return data.user;
}

/** Authenticated fetch. Returns null when signed out rather than throwing. */
export async function authFetch(path, options = {}) {
  const token = getToken();
  if (!token) return null;
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return null;                       // server down; caller falls back
  }
  if (res.status === 401) {
    // The token was revoked or expired. Drop it so the UI stops pretending.
    writeLS(TOKEN_KEY, null);
    broadcast();
    return null;
  }
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function fetchMe() {
  return authFetch("/auth/me");
}

/* ------------------------------------------------------------------ *
 * React binding
 * ------------------------------------------------------------------ */
/**
 * @returns {{user: object|null, stats: object|null, guest: boolean,
 *            gate: boolean, loading: boolean, signedIn: boolean}}
 */
export function useAuth() {
  const [state, setState] = useState(() => ({
    user: null,
    stats: null,
    guest: isGuest(),
    gate: needsGate(),
    loading: !!getToken(),
  }));

  useEffect(() => {
    let alive = true;

    const sync = async () => {
      const token = getToken();
      if (!token) {
        if (alive) {
          setState({
            user: null, stats: null,
            guest: isGuest(), gate: needsGate(), loading: false,
          });
        }
        return;
      }
      if (alive) setState((s) => ({ ...s, loading: true }));
      const me = await fetchMe();
      if (!alive) return;
      setState({
        user: me?.user ?? null,
        stats: me?.stats ?? null,
        guest: isGuest(),
        // A dead token means the gate comes back, but only once we KNOW it is
        // dead — not while the request is still in flight.
        gate: !me && needsGate(),
        loading: false,
      });
    };

    sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      alive = false;
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { ...state, signedIn: !!state.user };
}
