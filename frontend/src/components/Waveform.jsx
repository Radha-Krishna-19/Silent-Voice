export const Waveform = ({ active = true, bars = 5 }) => (
  <div className="inline-flex items-end gap-1 h-4" data-testid="tts-waveform" aria-hidden="true">
    {Array.from({ length: bars }).map((_, i) => (
      <span
        key={i}
        className="w-[3px] bg-cyan rounded-sm origin-bottom"
        style={{
          height: "100%",
          animation: active ? `wave-bar 0.9s cubic-bezier(0.25,0.1,0.25,1) infinite` : "none",
          animationDelay: `${i * 90}ms`,
          opacity: active ? 1 : 0.3,
        }}
      />
    ))}
  </div>
);
export default Waveform;
