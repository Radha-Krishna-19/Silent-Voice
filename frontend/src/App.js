import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

function App() {
  return (
    <div className="App">
      <GrainOverlay />
      <BrowserRouter>
        <Routes>
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
      </BrowserRouter>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

export default App;
