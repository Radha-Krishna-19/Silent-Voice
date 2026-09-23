import { useCallback, useEffect, useRef, useState } from "react";
import { wsFrameUrl, fetchStatus } from "../lib/api";

/**
 * Drives the real ISL→English loop on /live.
 *
 * Webcam frames are captured to an offscreen canvas, encoded as JPEG and sent
 * over a persistent WebSocket (/ws/frame) at a fixed rate. MediaPipe runs
 * server-side, so the browser never has to load a WASM bundle and — more
 * importantly — landmark extraction is byte-for-byte the same code path used
 * to build the training tensors.
 *
 * States:
 *   "idle"       nothing started yet
 *   "requesting" waiting on the camera permission prompt / WS handshake
 *   "streaming"  frames flowing, predictions coming back
 *   "denied"     user refused camera access
 *   "offline"    camera fine, but the backend is unreachable → caller falls back to demo
 *   "error"      anything else, message in `error`
 *
 * Deliberately never fabricates a prediction. If the backend is down the caller
 * is told so and must label the UI accordingly.
 */
const FPS = 12;
const JPEG_QUALITY = 0.7;
const CAPTURE_W = 640;

export default function useLiveCapture({ model = null, mode = "continuous" } = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const inFlight = useRef(false);
  const recordRef = useRef(false);

  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [landmarks, setLandmarks] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [handsVisible, setHandsVisible] = useState(false);
  const [serverMs, setServerMs] = useState(null);
  const [backend, setBackend] = useState(null);   // /api/status payload
  const [elapsed, setElapsed] = useState(0);      // seconds since streaming began

  // ---- single source of truth for the session clock -----------------------
  useEffect(() => {
    if (status !== "streaming") return undefined;
    const t0 = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status]);

  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    const scale = CAPTURE_W / video.videoWidth;
    canvas.width = CAPTURE_W;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  }, []);

  const tick = useCallback(() => {
    // Drop the frame rather than queue it — a backlog would make captions lag
    // behind the signer, which is worse than a lower effective frame rate.
    if (inFlight.current) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const image = grabFrame();
    if (!image) return;

    inFlight.current = true;
    ws.send(JSON.stringify({ image, record: recordRef.current, mode, model }));
  }, [grabFrame, mode, model]);

  const start = useCallback(async () => {
    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setStatus(err?.name === "NotAllowedError" ? "denied" : "error");
      setError(err?.message ?? "camera unavailable");
      return;
    }

    try {
      const st = await fetchStatus();
      setBackend(st);
    } catch {
      // Camera works; server does not. Report it rather than faking output.
      setStatus("offline");
      setError("backend unreachable — start it with: cd backend && python server.py");
      return;
    }

    await new Promise((resolve) => {
      const ws = new WebSocket(wsFrameUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("streaming");
        timerRef.current = setInterval(tick, Math.round(1000 / FPS));
        resolve();
      };

      ws.onmessage = (evt) => {
        inFlight.current = false;
        let r;
        try {
          r = JSON.parse(evt.data);
        } catch {
          return;
        }
        if (r.error) return;
        setLandmarks(r.landmarks ?? null);
        setHandsVisible(Boolean(r.hands_visible));
        setServerMs(r.server_ms ?? null);
        if (r.prediction) setPrediction(r.prediction);
        setStatus((s) => (s === "offline" ? "streaming" : s));
      };

      ws.onerror = () => {
        inFlight.current = false;
        setStatus("offline");
        setError("backend unreachable — start it with: cd backend && python server.py");
        resolve();
      };

      ws.onclose = () => {
        inFlight.current = false;
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      };
    });
  }, [tick]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    inFlight.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    setLandmarks(null);
    setPrediction(null);
    setHandsVisible(false);
  }, []);

  const setRecording = useCallback((on) => {
    recordRef.current = on;
  }, []);

  useEffect(() => stop, [stop]);   // tear the camera down on unmount

  return {
    videoRef, canvasRef,
    status, error, landmarks, prediction, handsVisible, serverMs, backend, elapsed,
    start, stop, setRecording,
    isLive: status === "streaming",
  };
}
