import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { CursorGlow, ScrollProgress } from "./components/motion";
import { Toaster } from "./components/ui/sonner";
import GrainOverlay from "./components/GrainOverlay";
import Landing from "./pages/Landing";
import Live from "./pages/Live";
import Reverse from "./pages/Reverse";
import Practice from "./pages/Practice";
import Transcripts from "./pages/Transcripts";
import Settings from "./pages/Settings";
import About from "./pages/About";
import Auth from "./pages/Auth";
import Research from "./pages/Research";

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Landing />} />
          <Route path="/live" element={<Live />} />
          <Route path="/reverse" element={<Reverse />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/transcripts" element={<Transcripts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
          <Route path="/research" element={<Research />} />
          <Route path="/auth" element={<Auth />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <div className="App">
      <GrainOverlay />
      <CursorGlow />
      <ScrollProgress />
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

export default App;
