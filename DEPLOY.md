# Deploying Silent Voice

## Quick start (Docker Compose)

```bash
docker compose up --build
```

Open `http://localhost:8080`. The frontend container's nginx proxies `/api/*`
and `/ws/*` through to the backend container, so the browser only ever talks
to one origin — that's also where you'd terminate TLS for a real deployment
(see below).

Set `GEMINI_API_KEY` in your shell before running compose to enable the LLM
path in `backend/nlg.py` (gloss → sentence). It's optional — the rule-based
fallback works without it.

**Model checkpoints**: `backend/models/*.pt` are gitignored (a few MB each,
produced by training). If they exist in your local checkout when you run
`docker compose up --build`, they're included in the image automatically. If
not, the container runs in the same honest mock mode the app already falls
back to locally when no checkpoints are present (see `backend/inference.py`)
— it doesn't fail, it's just not doing real recognition.

## Adding HTTPS/WSS for a real deployment

Locally, everything is plain HTTP/WS — that's fine for `docker compose up` on
your own machine. To actually put this on the internet, terminate TLS at the
nginx layer (`frontend/nginx.conf`) rather than trying to add it to the
Python backend:

1. Get a certificate (Let's Encrypt via `certbot`, or one from your host).
2. Mount it into the frontend container and add a `listen 443 ssl;` server
   block to `frontend/nginx.conf` pointing at the cert/key, redirecting `:80`
   to `:443`.
3. `wsFrameUrl()` in `frontend/src/lib/api.js` already upgrades `ws://` to
   `wss://` automatically whenever the page itself is loaded over `https://`
   — no frontend code changes needed once nginx is serving HTTPS.

This is intentionally not baked into the compose file with a fake
self-signed cert — a cert that doesn't actually validate would be more
misleading than no cert at all.

## CI

`.github/workflows/ci.yml` runs on every push/PR:
- `backend/test_auth.py` and `backend/test_nlg.py` (the project's existing
  script-style test runners — not pytest; see their docstrings).
- The frontend's existing `routecheck.mjs` / `classcheck.mjs` / `trailcheck.mjs`
  smoke tests, via `npm run verify`.
- A Docker build of both images, to catch a Dockerfile break before it's a
  deploy-time surprise.

None of these tests are new — they existed before this pass and simply
weren't wired into any automation.
