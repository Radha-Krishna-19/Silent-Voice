import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API, timeout: 15000 });

export async function fetchDomainPacks() {
  const { data } = await api.get("/domain-packs");
  return data;
}
export async function fetchSessions() {
  const { data } = await api.get("/sessions");
  return data;
}
export async function fetchSession(id) {
  const { data } = await api.get(`/sessions/${id}`);
  return data;
}
export async function fetchSignClips() {
  const { data } = await api.get("/sign-clips");
  return data;
}
export async function reverseTranslate(text) {
  const { data } = await api.post("/reverse/translate", { text });
  return data;
}
export async function fetchPracticeLessons() {
  const { data } = await api.get("/practice/lessons");
  return data;
}

// --------------------------------------------------------------------------- //
// Real inference endpoints — implemented by backend/server.py.
// --------------------------------------------------------------------------- //

/**
 * Send one webcam frame for landmark extraction + classification.
 *
 * @param {string}  image   data URL or bare base64 JPEG
 * @param {boolean} record  true while the user is holding the capture button
 * @param {"capture"|"continuous"} mode
 * @param {"bilstm"|"cnn"|null} model
 * @returns {{landmarks, prediction, recording, recorded_frames, hands_visible, finished, server_ms}}
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
