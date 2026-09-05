/**
 * Local persistence for sessions and preferences.
 *
 * This file handles SETTINGS and the export/formatting helpers only.
 *
 * Session persistence moved to lib/sessions.js when accounts arrived, because
 * where a session goes now depends on who you are: a signed-in user gets a row
 * in the server's database, a guest gets nothing at all. Settings stay here —
 * they are per-browser preferences, not user data, and should survive a reload
 * whether or not you are signed in.
 *
 * Everything is wrapped in try/catch: localStorage throws in private-browsing
 * modes and when the quota is exceeded, and a translator should not white-screen
 * because it could not save a preference.
 */

const SETTINGS_KEY = "silentvoice.settings.v1";

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

/* --------------------- session formatting & export -------------------- */
/* Storing sessions lives in lib/sessions.js — see the note above. What is
   left here is turning a session into a file, which is identity-agnostic. */

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
