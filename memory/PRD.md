# Silent Voice — PRD

## Original Problem Statement
Silent Voice — Every gesture, heard. A real-time Indian Sign Language ↔ English translator web app. Signers can be understood by non-signers instantly via captions + spoken audio, and non-signers can reply back in sign through a curated clip library. Built accessibility-first with a cinematic dark-editorial UI.

**Phase directive from user:** Build the complete UI first with mocked/dummy data. Model integration, WebSocket streaming, and backend wiring happen after the UI is approved.

## User Personas
- Deaf / hard-of-hearing ISL signers who need to be understood
- Non-signers (teachers, doctors, government staff, family)
- ISL learners
- Accessibility researchers

## Core Requirements (Locked)
- Palette: `#0B0B0D` ink + `#F2ECE0` cream + `#6EE7F2` cyan (landmark glow) + `#C97B4A` copper (CTAs)
- Type: Fraunces (headline serif), Inter (UI), micro-caps for labels
- Motion: 150–300ms, character-assemble caption, no bouncy easing, `prefers-reduced-motion` respected
- Accessibility-first, 4.5:1 contrast, keyboard nav, focus rings
- Desktop-first (Chrome/Edge)

## Architecture
- Frontend: React + Tailwind + framer-motion, shadcn/ui components
- Backend: FastAPI (mock JSON endpoints in Phase 1)
- DB: MongoDB (only status_checks used in Phase 1)
- Routing: react-router-dom v7

## Implemented — Feb 11, 2026 (Phase 1 UI complete)

### Frontend screens
- `/` Landing — hero with animated fake landmark overlay, feature grid, pipeline strip, footer, onboarding modal
- `/live` Live Translation — webcam placeholder + SVG landmark skeleton, character-assemble caption, confidence chip (high/medium/low with correction chips), TTS waveform, domain switcher, session transcript sidebar
- `/reverse` Reverse Mode — text input, gloss re-ordering with layout animation, cinematic sign-clip player with segmented progress, upcoming thumbnail queue
- `/practice` Practice Mode — split reference/user webcam, radial match score, feedback bullets, lesson tabs, upcoming word strip
- `/transcripts` — expandable session rows with .txt/.srt export UI
- `/settings` — domain pack, TTS voice, speech rate, reduced motion, landmarks-only, save transcripts
- `/about` — mission + how-it-works pipeline + threat model cards
- `/auth` — split-view auth shell (sign-in / sign-up toggle)

### Components
- `LandmarkOverlay` — animated 21-point hand skeleton SVG with soft bloom
- `AssemblingCaption` — character-by-character reveal via framer-motion
- `ConfidenceChip` — three-tier confidence states
- `Waveform` — TTS bar visualization
- `PrivacyBadge`, `GrainOverlay`, `Nav`, `OnboardingModal`

### Backend (mock)
- `GET /api/domain-packs` — 3 domain packs
- `GET /api/sessions` + `GET /api/sessions/{id}` — mock session list/detail
- `GET /api/sign-clips` — sign clip library
- `POST /api/reverse/translate` — English → gloss (rule-based)
- `GET /api/practice/lessons` — practice lesson list

### Design system
- Tailwind config extended with ink/cream/cyan/copper tokens, Fraunces/Inter/JetBrains Mono, custom keyframes (landmark-pulse, wave-bar, grain-shift)
- Global grain overlay, glass-card/glass-panel utilities, btn-copper/btn-ghost-cream, focus-ring, hair-divider

## Deferred / Phase 2+

### P0
- Wire MediaPipe Holistic (`@mediapipe/tasks-vision`) to actual webcam on `/live`
- Real WebSocket transport for ISL→English

### P1
- Backend: PyTorch model loading, gloss classifier, Gemini 3 Flash gloss→English polish
- Sign clip storage (object storage) + real playback in reverse mode
- Practice mode landmark trajectory similarity scoring

### P2
- JWT auth wiring (screens already built)
- Session persistence in MongoDB (opt-in)
- WSS/HTTPS hardening, rate limiting
- Deploy

## Known Notes
- Phase 1 uses **MOCKED** data everywhere. Sign clips are label-only placeholders.
- No auth flow is wired — form submits `preventDefault`.
- Landmark overlay is a **decorative animated SVG**, not real tracking.
