import { NavLink, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
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
          {items.map(({ to, label, icon: Icon, testId }) => {
            const isActive = loc.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                data-testid={testId}
                className="focus-ring relative px-3.5 py-2 rounded-sm text-sm flex items-center gap-2 group"
              >
                {/* One shared element slides between tabs, so navigation reads
                    as movement rather than two things blinking. */}
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 bg-cream/[0.07] rounded-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <motion.span
                  className="relative z-10 flex items-center gap-2"
                  animate={{ color: isActive ? "rgb(242,236,224)" : "rgba(242,236,224,0.6)" }}
                  whileHover={{ color: "rgb(242,236,224)", y: -1 }}
                  transition={{ duration: 0.18 }}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.5} />
                  {label}
                </motion.span>
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-[1px] left-3 right-3 h-px bg-copper"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
              </NavLink>
            );
          })}
        </nav>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
          <Link
            to="/auth"
            data-testid="nav-auth-cta"
            className="focus-ring hidden md:inline-flex items-center gap-2 text-sm px-4 py-2 border border-cream/20 rounded-sm text-cream hover:border-cream/40 transition-colors"
          >
            <LogIn className="w-4 h-4" strokeWidth={1.5} />
            Sign in
          </Link>
        </motion.div>
      </div>
      {loc.pathname !== "/" && <div className="hair-divider" />}
    </header>
  );
};

export default Nav;
