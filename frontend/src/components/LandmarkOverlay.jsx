import { useEffect, useState } from "react";
import { useReducedMotionPref } from "./motion/preference";

// ISL uses two-handed signs and a two-handed alphabet, so we render BOTH hands.
// Each hand: 21 MediaPipe-style landmarks + standard connection graph.

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// Right hand — closer to center but not touching left
const RIGHT_HAND = [
  [0.68, 0.90], [0.62, 0.83], [0.58, 0.75], [0.56, 0.67], [0.55, 0.60],
  [0.68, 0.63], [0.68, 0.51], [0.68, 0.43], [0.68, 0.35],
  [0.73, 0.62], [0.74, 0.47], [0.74, 0.38], [0.75, 0.30],
  [0.78, 0.64], [0.80, 0.51], [0.81, 0.42], [0.81, 0.35],
  [0.82, 0.68], [0.84, 0.58], [0.85, 0.51], [0.85, 0.44],
];

// Left hand — mirror of right, closer to center
const LEFT_HAND = [
  [0.32, 0.90], [0.38, 0.83], [0.42, 0.75], [0.44, 0.67], [0.45, 0.60],
  [0.32, 0.63], [0.32, 0.51], [0.32, 0.43], [0.32, 0.35],
  [0.27, 0.62], [0.26, 0.47], [0.26, 0.38], [0.25, 0.30],
  [0.22, 0.64], [0.20, 0.51], [0.19, 0.42], [0.19, 0.35],
  [0.18, 0.68], [0.16, 0.58], [0.15, 0.51], [0.15, 0.44],
];

export const LandmarkOverlay = ({
  className = "",
  color = "#6EE7F2",
  intensity = 1,
  showConnections = true,
  hands = "both", // "both" | "right" | "left"
  live = null,    // { left: [[x,y],…], right: [[x,y],…] } from POST /api/frame
}) => {
  const reduced = useReducedMotionPref();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let raf;
    const start = performance.now();
    const loop = (now) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const jitter = (i, axis, phase) => {
    if (reduced) return 0;
    const seed = i * 12.9898 + (axis === "x" ? 7.13 : 3.29) + phase;
    return Math.sin(t * 1.2 + seed) * 0.006 * intensity;
  };

  const renderHand = (base, phase, keyPrefix) => {
    const pts = base.map(([x, y], i) => [x + jitter(i, "x", phase), y + jitter(i, "y", phase)]);
    return (
      <g key={keyPrefix}>
        {showConnections &&
          HAND_CONNECTIONS.map(([a, b], i) => (
            <line
              key={`${keyPrefix}-c-${i}`}
              x1={pts[a][0]} y1={pts[a][1]}
              x2={pts[b][0]} y2={pts[b][1]}
              stroke={color}
              strokeWidth={0.0035}
              strokeLinecap="round"
              opacity={0.55}
            />
          ))}
        {pts.map(([x, y], i) => {
          const isTip = [4, 8, 12, 16, 20].includes(i);
          const r = isTip ? 0.011 : 0.008;
          const pulse = reduced ? 0 : (Math.sin(t * 2 + i + phase) + 1) * 0.002;
          return (
            <g key={`${keyPrefix}-p-${i}`} filter="url(#lm-bloom)">
              <circle cx={x} cy={y} r={r + pulse} fill={color} opacity={isTip ? 1 : 0.85} />
              <circle cx={x} cy={y} r={r * 2.2 + pulse * 2} fill={color} opacity={0.15} />
            </g>
          );
        })}
      </g>
    );
  };

  // Real landmarks: no jitter, no pulse — what you see is what the model got.
  const renderReal = (pts21, keyPrefix) => {
    const pts = pts21.map(([x, y]) => [1 - x, y]);   // mirror to match the preview
    return (
      <g key={keyPrefix}>
        {showConnections &&
          HAND_CONNECTIONS.map(([a, b], i) => (
            <line
              key={`${keyPrefix}-c-${i}`}
              x1={pts[a][0]} y1={pts[a][1]}
              x2={pts[b][0]} y2={pts[b][1]}
              stroke={color}
              strokeWidth={0.0035}
              strokeLinecap="round"
              opacity={0.6}
            />
          ))}
        {pts.map(([x, y], i) => {
          const isTip = [4, 8, 12, 16, 20].includes(i);
          const r = isTip ? 0.011 : 0.008;
          return (
            <g key={`${keyPrefix}-p-${i}`} filter="url(#lm-bloom)">
              <circle cx={x} cy={y} r={r} fill={color} opacity={isTip ? 1 : 0.85} />
              <circle cx={x} cy={y} r={r * 2.2} fill={color} opacity={0.15} />
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      data-testid="landmark-overlay"
      aria-hidden="true"
    >
      <defs>
        <filter id="lm-bloom" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.006" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {live ? (
        // Real MediaPipe output. Coordinates arrive already normalised to 0-1,
        // and are mirrored on x so the overlay tracks the un-mirrored preview.
        <>
          {live.left?.length === 21 && renderReal(live.left, "RL")}
          {live.right?.length === 21 && renderReal(live.right, "RR")}
        </>
      ) : (
        <>
          {(hands === "both" || hands === "left") && renderHand(LEFT_HAND, 0, "L")}
          {(hands === "both" || hands === "right") && renderHand(RIGHT_HAND, 2.5, "R")}
        </>
      )}
    </svg>
  );
};

export default LandmarkOverlay;
