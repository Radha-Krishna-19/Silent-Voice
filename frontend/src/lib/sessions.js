/**
 * Where a finished session goes, which depends entirely on who you are.
 *
 *   signed in  ->  POST /api/me/transcripts. A row in SQLite, on the server,
 *                  owned by your user id. Survives clearing this browser.
 *   guest      ->  nowhere. Not the server, not localStorage. It lives in the
 *                  page's memory until the tab closes.
 *
 * This module is the single place that decision is made, so no page can
 * accidentally persist something a guest was promised would not be kept.
 */
import { authFetch, getToken } from "./auth";
import { fmtDuration } from "./storage";

export { fmtDuration };

// Guest sessions for the life of this page. Deliberately a module-level array
// rather than storage of any kind.
let guestSessions = [];
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isPersistent() {
  return !!getToken();
}

/** Sessions for the current identity. */
export async function listSessions() {
  if (!getToken()) return { sessions: guestSessions, persistent: false, offline: false };
  const data = await authFetch("/me/transcripts");
  if (!data) {
    // Signed in but the server did not answer. Say so rather than silently
    // showing an empty list that looks like data loss.
    return { sessions: [], persistent: true, offline: true };
  }
  return { sessions: data.sessions ?? [], persistent: true, offline: false };
}

/**
 * Persist a finished session.
 * @returns {Promise<{saved: boolean, where: "server"|"memory"}>}
 */
export async function saveSession(session) {
  // Reuse the record shaping (id, averages, rounding) from storage.js without
  // its localStorage write: buildRecord writes to localStorage as a side
  // effect, so build the record by hand here instead.
  const entries = session?.entries ?? [];
  if (!entries.length) return { saved: false, where: "memory" };

  const avg = entries.reduce((s, e) => s + (e.confidence ?? 0), 0) / entries.length;
  const record = {
    id: `s-${Date.now()}`,
    startedAt: session.startedAt ?? new Date().toISOString(),
    durationSec: Math.round(session.durationSec ?? 0),
    model: session.model ?? "cnn",
    signs: entries.length,
    avgConfidence: Number(avg.toFixed(4)),
    entries: entries.map((e) => ({
      ts: e.ts,
      text: e.text,
      conf: Number((e.confidence ?? 0).toFixed(4)),
    })),
  };

  if (!getToken()) {
    guestSessions = [record, ...guestSessions].slice(0, 50);
    notify();
    return { saved: true, where: "memory" };
  }

  const ok = await authFetch("/me/transcripts", {
    method: "POST",
    body: JSON.stringify(record),
  });
  notify();
  return { saved: !!ok, where: "server" };
}

export async function removeSession(id) {
  if (!getToken()) {
    guestSessions = guestSessions.filter((s) => s.id !== id);
    notify();
    return true;
  }
  const ok = await authFetch(`/me/transcripts/${encodeURIComponent(id)}`, { method: "DELETE" });
  notify();
  return !!ok;
}

export async function clearAllSessions() {
  if (!getToken()) {
    guestSessions = [];
    notify();
    return true;
  }
  const { sessions } = await listSessions();
  await Promise.all(sessions.map((s) => removeSession(s.id)));
  notify();
  return true;
}

/* --------------------------- practice history --------------------------- */

let guestPractice = [];

export async function savePracticeAttempt(label, score, breakdown) {
  if (!getToken()) {
    guestPractice = [{ label, score, breakdown, at: Date.now() / 1000 }, ...guestPractice].slice(0, 200);
    return { saved: true, where: "memory" };
  }
  const ok = await authFetch("/me/practice", {
    method: "POST",
    body: JSON.stringify({ label, score, breakdown }),
  });
  return { saved: !!ok, where: "server" };
}

export async function listPractice() {
  if (!getToken()) {
    const perWord = Object.values(
      guestPractice.reduce((acc, a) => {
        const cur = acc[a.label] ?? { label: a.label, best: 0, attempts: 0 };
        cur.best = Math.max(cur.best, a.score);
        cur.attempts += 1;
        acc[a.label] = cur;
        return acc;
      }, {})
    ).sort((a, b) => b.best - a.best);
    return { attempts: guestPractice, perWord, persistent: false };
  }
  const data = await authFetch("/me/practice");
  return {
    attempts: data?.attempts ?? [],
    perWord: data?.perWord ?? [],
    persistent: true,
    offline: !data,
  };
}
