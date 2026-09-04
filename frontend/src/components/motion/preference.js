import { useEffect, useState } from "react";

/**
 * Motion preference, with an explicit user override.
 *
 * framer-motion's useReducedMotion() reads the OS setting only. That is the
 * correct default — but Windows ships with "Animation effects" OFF on many
 * machines, and macOS "Reduce motion" is commonly enabled, so a user who
 * actively WANTS the animations has no way to get them.
 *
 * Three states:
 *   "auto" (default) — follow the operating system
 *   "on"             — always animate, regardless of the OS
 *   "off"            — never animate, regardless of the OS
 *
 * Stored under its own key so it works before the settings page loads, and
 * changes broadcast to every mounted component through a storage event plus a
 * custom event (localStorage's own event does not fire in the tab that wrote).
 */
const KEY = "silentvoice.motion.v1";
export const EVENT = "silentvoice:motion-change";

export function getMotionMode() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setMotionMode(mode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* private mode — fall through, the in-memory event still fires */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

function osPrefersReduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** True when animation should be suppressed. Use INSTEAD of useReducedMotion. */
export function useReducedMotionPref() {
  const compute = () => {
    const mode = getMotionMode();
    if (mode === "on") return false;
    if (mode === "off") return true;
    return osPrefersReduced();
  };

  const [reduced, setReduced] = useState(compute);

  useEffect(() => {
    const update = () => setReduced(compute());
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener?.("change", update);
    } catch { /* older browsers */ }
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
      mq?.removeEventListener?.("change", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return reduced;
}

/** Does the OS ask for reduced motion? Used to explain why things are still. */
export function useOsReducedMotion() {
  const [v, setV] = useState(osPrefersReduced);
  useEffect(() => {
    let mq;
    const update = () => setV(osPrefersReduced());
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener?.("change", update);
    } catch { /* ignore */ }
    return () => mq?.removeEventListener?.("change", update);
  }, []);
  return v;
}
