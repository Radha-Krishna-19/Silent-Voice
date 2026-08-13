import { useEffect, useState } from "react";
import { api } from "../lib/api";

/**
 * Pulls real training results from GET /api/comparison.
 *
 * The backend reads ml/logs/comparison.json straight off disk on every
 * request, so whatever the last training run wrote is what the UI shows.
 * Three outcomes, and the caller must handle all of them:
 *
 *   status "loading"   — request in flight
 *   status "untrained" — backend reachable, but no comparison.json yet
 *   status "ready"     — real numbers available in `models`
 *   status "offline"   — backend unreachable (dev server running alone)
 *
 * There is deliberately no fallback to placeholder metrics. If we cannot
 * prove a number, we do not show a number.
 */
export default function useComparison() {
  const [state, setState] = useState({
    status: "loading",
    models: {},
    histories: {},
    confusion: {},
    error: null,
    meta: null,
  });

  useEffect(() => {
    let cancelled = false;

    api
      .get("/comparison")
      .then(({ data }) => {
        if (cancelled) return;

        if (!data || data.available === false) {
          setState({
            status: "untrained",
            models: {},
            histories: {},
            confusion: {},
            error: data?.error ?? null,
            meta: null,
          });
          return;
        }

        // comparison.json shape: { models: { bilstm: {...}, cnn: {...} }, ... }
        setState({
          status: "ready",
          models: data.models ?? {},
          histories: data.histories ?? {},
          confusion: data.confusion ?? {},
          error: null,
          meta: {
            trainedAt: data.trained_at ?? data.trainedAt ?? null,
            numClasses: data.num_classes ?? data.numClasses ?? null,
            numSamples: data.num_samples ?? data.numSamples ?? null,
            split: data.split ?? null,
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "offline",
          models: {},
          histories: {},
          confusion: {},
          error: err?.message ?? "backend unreachable",
          meta: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Pick a metric out of a backend model record, tolerating key variations. */
export function metric(record, ...keys) {
  if (!record) return null;
  for (const k of keys) {
    const v = record[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
}
