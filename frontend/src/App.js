import "./App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ScrollProgress } from "./components/motion";
import { ScrollSpine } from "./components/motion/advanced";
import { Toaster } from "./components/ui/sonner";
import GrainOverlay from "./components/GrainOverlay";
import CommandPalette from "./components/CommandPalette";
import MotionNotice from "./components/MotionNotice";
import Gate from "./pages/Gate";
import Landing from "./pages/Landing";
import Live from "./pages/Live";
import Reverse from "./pages/Reverse";
import Practice from "./pages/Practice";
import Transcripts from "./pages/Transcripts";
import Settings from "./pages/Settings";
import About from "./pages/About";
import Research from "./pages/Research";
import Rubric from "./pages/Rubric";
import { needsGate } from "./lib/auth";

/**
 * Everything past the gate requires a decision — signed in, or explicitly a
 * guest. Landing on /live with a bookmark before either sends you to the gate
 * and then back, rather than showing a half-working page.
 */
function Gated({ children }) {
  const location = useLocation();
  if (needsGate()) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  const g = (el) => <Gated>{el}</Gated>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Gate />} />
        <Route path="/home" element={g(<Landing />)} />
        <Route path="/live" element={g(<Live />)} />
        <Route path="/reverse" element={g(<Reverse />)} />
        <Route path="/practice" element={g(<Practice />)} />
        <Route path="/transcripts" element={g(<Transcripts />)} />
        <Route path="/settings" element={g(<Settings />)} />
        <Route path="/about" element={g(<About />)} />
        <Route path="/research" element={g(<Research />)} />
        <Route path="/rubric" element={g(<Rubric />)} />
        {/* Old bookmark from before the gate existed. */}
        <Route path="/auth" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <div className="App">
      <GrainOverlay />
      <ScrollProgress />
      <ScrollSpine />
      <MotionNotice />
      <BrowserRouter basename={process.env.PUBLIC_URL}>
        <CommandPalette />
        <AnimatedRoutes />
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

export default App;
