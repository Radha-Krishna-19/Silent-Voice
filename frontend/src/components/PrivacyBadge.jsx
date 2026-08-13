import { ShieldCheck } from "lucide-react";

export const PrivacyBadge = ({ className = "" }) => (
  <div
    data-testid="privacy-badge"
    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel ${className}`}
  >
    <ShieldCheck className="w-3.5 h-3.5 text-cyan" strokeWidth={1.5} />
    <span className="text-[10px] uppercase tracking-[0.2em] text-cream/80">
      Landmarks only · no video stored
    </span>
  </div>
);
export default PrivacyBadge;
