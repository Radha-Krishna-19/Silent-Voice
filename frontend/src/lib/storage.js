/**
 * Local persistence for sessions and preferences.
 *
 * There is no account system and no database, so "your data" means "this
 * browser". That is a real limitation, not a feature — but it does mean the
 * Transcripts page shows sessions you actually recorded rather than invented
 * ones, and Settings survive a reload.
 *
 * Everything is wrapped in try/catch: localStorage throws in private-browsing
 * modes and when the quota is exceeded, and a translator should not white-screen
 * because it could not save a preference.
 */

const SESSIONS_KEY = "silentvoice.sessions.v1";
const SETTINGS_KEY = "silentvoice.settings.v1";
const MAX_SESSIONS = 50;

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;   // private mode or quota exceeded
  }
}

/* ----------------------------- sessions ----------------------------- */

export function loadSessions() {
  const s = read(SESSIONS_KEY, []);
  return Array.isArray(s) ? s : [];
}

/**
 * Persist a finished /live session.
 * @param {{entries: Array, durationSec: number, model: string}} session
 */
export function saveSession(session) {
  if (!session?.entries?.length) return null;   // never store empty sessions
  const entries = session.entries;
  const avg = entries.reduce((s, e) => s + (e.confidence ?? 0), 0) / entries.length;

  const record = {
    id: `s-${Date.now()}`,
    startedAt: session.startedAt ?? new Date().toISOString(),
    durationSec: Math.round(session.durationSec ?? 0),
    model: session.model ?? "bilstm",
    signs: entries.length,
    avgConfidence: Number(avg.toFixed(4)),
    entries: entries.map((e) => ({
      ts: e.ts,
      text: e.text,
      conf: Number((e.confidence ?? 0).toFixed(4)),
    })),
  };

  const all = [record, ...loadSessions()].slice(0, MAX_SESSIONS);
  write(SESSIONS_KEY, all);
  return record;
}

export function deleteSession(id) {
  const all = loadSessions().filter((s) => s.id !== id);
  write(SESSIONS_KEY, all);
  return all;
}

export function clearSessions() {
  write(SESSIONS_KEY, []);
  return [];
}

/** Plain-text export of one session. */
export function sessionToTxt(s) {
  const head = [
    `Silent Voice — session transcript`,
    `Recorded : ${new Date(s.startedAt).toLocaleString()}`,
    `Duration : ${fmtDuration(s.durationSec)}`,
    `Model    : ${s.model}`,
    `Signs    : ${s.signs}   ·   mean confidence ${(s.avgConfidence * 100).toFixed(1)}%`,
    "",
  ].join("\n");
  const body = s.entries.map((e) => `[${e.ts}]  ${e.text}  (${(e.conf * 100).toFixed(0)}%)`).join("\n");
  return `${head}${body}\n`;
}

/** SubRip subtitles, so a session can be laid over a recording. */
export function sessionToSrt(s) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = (sec) =>
    `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(Math.floor(sec) % 60)},${pad(Math.round((sec % 1) * 1000), 3)}`;
  return s.entries
    .map((e, i) => {
      const start = tsToSeconds(e.ts);
      const end = start + 2;
      return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${e.text}\n`;
    })
    .join("\n");
}

function tsToSeconds(ts) {
  const parts = String(ts).split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : (parts[0] || 0);
}

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ----------------------------- settings ----------------------------- */

export const DEFAULT_SETTINGS = {
  model: "cnn",            // the measured winner: 94.55% vs 91.74%
  speakCaptions: true,
  speechRate: 1.0,
  voiceURI: null,
  reducedMotion: false,
  saveSessions: true,
  mirrorPractice: false,
  captureFps: 12,
};

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  write(SETTINGS_KEY, next);
  return next;
}

export function resetSettings() {
  write(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS };
}

/** localStorage genuinely unavailable (private mode)? Worth telling the user. */
export function storageAvailable() {
  try {
    const k = "__sv_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
