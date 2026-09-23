import axios from "axios";

/**
 * Every function here maps to an endpoint that actually exists in
 * backend/server.py. Nothing is speculative.
 *
 * (An earlier version exported fetchDomainPacks / fetchSessions / fetchSignClips
 * / reverseTranslate / fetchPracticeLessons, none of which the backend
 * implemented and none of which any page imported. They were removed rather
 * than left as traps.)
 */

// REACT_APP_BACKEND_URL unset -> local dev default (localhost:8000).
// REACT_APP_BACKEND_URL="" (explicitly empty, set at Docker build time) ->
// same-origin: the production nginx config proxies /api and /ws through to
// the backend container, so the browser only ever talks to one origin.
const BASE = process.env.REACT_APP_BACKEND_URL !== undefined
  ? process.env.REACT_APP_BACKEND_URL
  : "http://localhost:8000";
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API, timeout: 15000 });

/**
 * WebSocket URL for /ws/frame — derived from REACT_APP_BACKEND_URL so a
 * deployed build (https://) automatically gets wss:// rather than ws://.
 */
export function wsFrameUrl() {
  const origin = BASE || window.location.origin;
  const url = new URL(`${origin}/ws/frame`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// --------------------------------------------------------------------------- //
// Forward: ISL -> English
// --------------------------------------------------------------------------- //
// Per-frame recognition itself now streams over the WebSocket (see
// hooks/useLiveCapture.js) rather than a REST call — postFrame/resetSession
// used to live here but a persistent connection replaces both: there's no
// separate "reset" call because opening a new connection already starts
// from clean per-session state.

/** Which checkpoints are loaded, and the label vocabulary they were trained on. */
export async function fetchStatus() {
  const { data } = await api.get("/status");
  return data;
}

/** Ordered recognized-word stream -> one fluent English sentence. */
export async function formSentence(words) {
  const { data } = await api.post("/sentence", { words });
  return data;
}

// --------------------------------------------------------------------------- //
// Reverse: English -> ISL
// --------------------------------------------------------------------------- //

/** English sentence -> ISL gloss + the skeleton frames needed to play it. */
export async function textToSign(text) {
  const { data } = await api.post("/text-to-sign", { text });
  return data;
}

/** Gloss ordering only, without animation frames. */
export async function textToGloss(text) {
  const { data } = await api.post("/text-to-gloss", { text });
  return data;
}

/** Every word the system can sign back. */
export async function fetchVocabulary() {
  const { data } = await api.get("/vocabulary");
  return data;
}

// --------------------------------------------------------------------------- //
// Practice — real scoring against the reference recording for a word
// --------------------------------------------------------------------------- //

/** Score the last captured attempt (or an explicit window) against `label`. */
export async function scorePractice(label, { window: win = null, mirror = false } = {}) {
  const { data } = await api.post("/practice/score", { label, window: win, mirror });
  return data;
}

/** Words that have a reference recording and can therefore be practised. */
export async function fetchPracticeWords() {
  const { data } = await api.get("/practice/words");
  return data;
}

// --------------------------------------------------------------------------- //
// Research
// --------------------------------------------------------------------------- //

/** Measured model comparison, read from ml/logs/comparison.json on each request. */
export async function fetchComparison() {
  const { data } = await api.get("/comparison");
  return data;
}
