import { useEffect, useState } from "react";
import {motion} from "framer-motion";
import { useReducedMotionPref } from "./motion/preference";

export const AssemblingCaption = ({ text, speed = 28, className = "", onDone }) => {
  const [visible, setVisible] = useState(0);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    setVisible(0);
    if (reduced) {
      setVisible(text.length);
      onDone && onDone();
      return;
    }
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setVisible(i);
      if (i >= text.length) {
        clearInterval(iv);
        onDone && onDone();
      }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed, reduced, onDone]);

  return (
    <div
      data-testid="assembling-caption"
      className={`font-display text-[2.75rem] leading-[1.1] tracking-tight text-cream ${className}`}
      aria-live="polite"
    >
      {text.split("").map((ch, i) => (
        <motion.span
          key={`${text}-${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: i < visible ? 1 : 0 }}
          transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ whiteSpace: "pre" }}
        >
          {ch}
        </motion.span>
      ))}
      <span
        className="inline-block w-[2px] h-[0.9em] align-middle ml-1 bg-copper"
        style={{ opacity: visible < text.length ? 1 : 0 }}
        aria-hidden="true"
      />
    </div>
  );
};
export default AssemblingCaption;
