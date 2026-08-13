export const ConfidenceChip = ({ confidence }) => {
  const pct = Math.round(confidence * 100);
  let variant = "high";
  if (confidence < 0.7) variant = "low";
  else if (confidence < 0.85) variant = "medium";

  const styles = {
    high: "bg-copper text-ink shadow-[0_0_16px_rgba(201,123,74,0.35)]",
    medium: "border border-cyan text-cyan bg-cyan/10",
    low: "border border-cream/30 text-cream/70 bg-ink/60",
  };

  return (
    <span
      data-testid={`confidence-chip-${variant}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] rounded-sm ${styles[variant]}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
      {variant} · {pct}%
    </span>
  );
};
export default ConfidenceChip;
