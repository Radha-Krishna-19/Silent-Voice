import { useState } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio, MessageSquare, GraduationCap, ScrollText, Settings2, Info,
  FlaskConical, ClipboardList, LogOut, UserRound, Command,
} from "lucide-react";
import { useAuth, signOut } from "../lib/auth";
import { Magnetic } from "./motion";

const items = [
  { to: "/live", label: "Live", icon: Radio, testId: "nav-live" },
  { to: "/reverse", label: "Reverse", icon: MessageSquare, testId: "nav-reverse" },
  { to: "/practice", label: "Practice", icon: GraduationCap, testId: "nav-practice" },
  { to: "/transcripts", label: "Transcripts", icon: ScrollText, testId: "nav-transcripts" },
  { to: "/research", label: "Research", icon: FlaskConical, testId: "nav-research" },
  { to: "/rubric", label: "Rubric", icon: ClipboardList, testId: "nav-rubric" },
  { to: "/settings", label: "Settings", icon: Settings2, testId: "nav-settings" },
  { to: "/about", label: "About", icon: Info, testId: "nav-about" },
];

export const Nav = ({ transparent = false }) => {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, guest, loading } = useAuth();
  const [menu, setMenu] = useState(false);

  const out = () => { signOut(); nav("/"); };

  return (
    <header
      data-testid="site-nav"
      className={`fixed top-0 inset-x-0 z-50 ${transparent ? "" : "glass-panel border-b border-cream/10"}`}
    >
      <div className="max-w-[1440px] mx-auto flex items-center justify-between px-6 md:px-12 py-4">
        <Link to="/home" data-testid="nav-logo" className="flex items-center gap-3 focus-ring rounded-sm">
          <div className="w-7 h-7 relative">
            <div className="absolute inset-0 rounded-full border border-cyan/70 landmark-glow" />
            <div className="absolute inset-1.5 rounded-full bg-copper" />
          </div>
          <span className="font-display text-xl tracking-tight">Silent Voice</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5">
          {items.map(({ to, label, icon: Icon, testId }) => {
            const isActive = loc.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                data-testid={testId}
                className="focus-ring relative px-3 py-2 rounded-sm text-sm flex items-center gap-2 group"
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

        <div className="flex items-center gap-3">
          <kbd
            className="hidden xl:flex items-center gap-1 text-[10px] text-cream/30 border border-cream/12 rounded px-2 py-1"
            title="Command palette"
          >
            <Command className="w-3 h-3" strokeWidth={1.5} /> K
          </kbd>

          {loading ? (
            <div className="w-24 h-8 rounded-sm bg-cream/[0.05] animate-pulse" />
          ) : user ? (
            <div className="relative">
              <Magnetic strength={0.12}>
                <button
                  onClick={() => setMenu((v) => !v)}
                  onBlur={() => setTimeout(() => setMenu(false), 140)}
                  data-testid="nav-account"
                  className="focus-ring flex items-center gap-2 text-sm px-3 py-2 border border-cream/15 rounded-sm hover:border-cream/35 transition-colors"
                >
                  <span className="w-5 h-5 rounded-full bg-copper/20 border border-copper/40 flex items-center justify-center text-[10px] text-copper font-medium">
                    {(user.displayName || user.username).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden md:inline max-w-[9rem] truncate">
                    {user.displayName || user.username}
                  </span>
                </button>
              </Magnetic>

              <AnimatePresence>
                {menu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 mt-2 w-56 bg-ink border border-cream/15 rounded-sm overflow-hidden shadow-xl"
                  >
                    <div className="px-4 py-3 border-b border-cream/10">
                      <div className="text-sm text-cream/90 truncate">{user.displayName}</div>
                      <div className="text-[11px] text-cream/35 truncate">@{user.username}</div>
                      <div className="text-[10px] text-cyan/70 mt-1.5">Sessions are saved</div>
                    </div>
                    <button
                      onClick={out}
                      data-testid="nav-signout"
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-cream/70 hover:text-cream hover:bg-cream/[0.05] transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Magnetic strength={0.12}>
              <Link
                to="/"
                data-testid="nav-auth-cta"
                title={guest ? "You are a guest — nothing is being saved" : "Sign in"}
                className="focus-ring inline-flex items-center gap-2 text-sm px-3 py-2 border border-cream/20 rounded-sm text-cream/80 hover:text-cream hover:border-cream/40 transition-colors"
              >
                <UserRound className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden md:inline">{guest ? "Guest" : "Sign in"}</span>
              </Link>
            </Magnetic>
          )}
        </div>
      </div>
      {loc.pathname !== "/home" && <div className="hair-divider" />}
    </header>
  );
};

export default Nav;
