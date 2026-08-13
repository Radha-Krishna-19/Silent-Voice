import { NavLink, Link, useLocation } from "react-router-dom";
import { Radio, MessageSquare, GraduationCap, ScrollText, Settings2, Info, LogIn, FlaskConical } from "lucide-react";

const items = [
  { to: "/live", label: "Live", icon: Radio, testId: "nav-live" },
  { to: "/reverse", label: "Reverse", icon: MessageSquare, testId: "nav-reverse" },
  { to: "/practice", label: "Practice", icon: GraduationCap, testId: "nav-practice" },
  { to: "/transcripts", label: "Transcripts", icon: ScrollText, testId: "nav-transcripts" },
  { to: "/research", label: "Research", icon: FlaskConical, testId: "nav-research" },
  { to: "/settings", label: "Settings", icon: Settings2, testId: "nav-settings" },
  { to: "/about", label: "About", icon: Info, testId: "nav-about" },
];

export const Nav = ({ transparent = false }) => {
  const loc = useLocation();
  return (
    <header
      data-testid="site-nav"
      className={`fixed top-0 inset-x-0 z-50 ${transparent ? "" : "glass-panel border-b border-cream/10"}`}
    >
      <div className="max-w-[1440px] mx-auto flex items-center justify-between px-6 md:px-12 py-4">
        <Link to="/" data-testid="nav-logo" className="flex items-center gap-3 focus-ring rounded-sm">
          <div className="w-7 h-7 relative">
            <div className="absolute inset-0 rounded-full border border-cyan/70 landmark-glow" />
            <div className="absolute inset-1.5 rounded-full bg-copper" />
          </div>
          <span className="font-display text-xl tracking-tight">Silent Voice</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {items.map(({ to, label, icon: Icon, testId }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testId}
              className={({ isActive }) =>
                `focus-ring px-3.5 py-2 rounded-sm text-sm flex items-center gap-2 transition-colors ${
                  isActive ? "text-cream bg-cream/5" : "text-cream/60 hover:text-cream hover:bg-cream/5"
                }`
              }
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </nav>
        <Link
          to="/auth"
          data-testid="nav-auth-cta"
          className="focus-ring hidden md:inline-flex items-center gap-2 text-sm px-4 py-2 border border-cream/20 rounded-sm text-cream hover:border-cream/40 transition-colors"
        >
          <LogIn className="w-4 h-4" strokeWidth={1.5} />
          Sign in
        </Link>
      </div>
      {loc.pathname !== "/" && <div className="hair-divider" />}
    </header>
  );
};

export default Nav;
