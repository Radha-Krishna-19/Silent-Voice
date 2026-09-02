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

const BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API, timeout: 15000 });

// --------------------------------------------------------------------------- //
// Forward: ISL -> English
// --------------------------------------------------------------------------- //

/**
 * Send one webcam frame for landmark extraction + classification.
 *
 * @param {string}  image   data URL or bare base64 JPEG
 * @param {boolean} record  true while the user holds the capture button
 * @param {"capture"|"continuous"} mode
 * @param {"bilstm"|"cnn"|null} model
 */
export async function postFrame(image, { record = false, mode = "capture", model = null } = {}) {
  const { data } = await api.post("/frame", { image, record, mode, model });
  return data;
}

/** Clear the server-side rolling landmark buffer and recording state. */
export async function resetSession() {
  const { data } = await api.post("/reset", {});
  return data;
}

/** Which checkpoints are loaded, and the label vocabulary they were trained on. */
export async function fetchStatus() {
  const { data } = await api.get("/status");
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
// Research
// --------------------------------------------------------------------------- //

/** Measured model comparison, read from ml/logs/comparison.json on each request. */
export async function fetchComparison() {
  const { data } = await api.get("/comparison");
  return data;
}
