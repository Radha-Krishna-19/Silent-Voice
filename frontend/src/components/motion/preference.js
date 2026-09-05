import { useEffect, useState } from "react";

/**
 * Motion preference, with an explicit user override.
 *
 * Three states:
 *   "on" (default) — always animate
 *   "auto"         — follow the operating system's prefers-reduced-motion
 *   "off"          — never animate
 *
 * Why "on" is the default, and not "auto"
 * ---------------------------------------
 * "auto" was the default first, because following prefers-reduced-motion is
 * the textbook answer. In practice it made the product look broken: Windows
 * ships with Settings > Accessibility > Visual effects > Animation effects
 * turned OFF on a great many machines, and that flag is what the media query
 * reports. So the entire motion system silently degraded to plain fades for
 * users who had never made any decision about motion — it was a default two
 * layers away from them, not a preference they expressed.
 *
 * The compromise: animate by default, detect when the OS asks for reduced
 * motion, and say so in the interface with a one-click way to honour it (see
 * MotionNotice). Someone with a vestibular disorder gets an explicit, visible
 * control instead of a silent guess; everyone else gets the product as
 * designed. The control lives in Settings > Motion and persists.
 *
 * Stored under its own key so it works before the settings page loads, and
 * changes broadcast to every mounted component through a storage event plus a
 * custom event (localStorage's own event does not fire in the tab that wrote).
 */
const KEY = "silentvoice.motion.v1";
export const NOTICE_KEY = "silentvoice.motion.notice.v1";
export const EVENT = "silentvoice:motion-change";
export const DEFAULT_MODE = "on";

export function getMotionMode() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "on" || v === "off" || v === "auto" ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/** Has the user ever chosen a motion mode themselves? */
export function motionModeIsExplicit() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "on" || v === "off" || v === "auto";
  } catch {
    return false;
  }
}

export function noticeDismissed() {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissNotice() {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: getMotionMode() }));
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

/**
 * Should we offer to honour the OS setting?
 * True only when the OS asks for reduced motion, the user has never chosen a
 * mode themselves, and they have not dismissed the notice.
 */
export function useMotionNotice() {
  const compute = () =>
    osPrefersReduced() && !motionModeIsExplicit() && !noticeDismissed();
  const [show, setShow] = useState(compute);
  useEffect(() => {
    const update = () => setShow(compute());
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return show;
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
