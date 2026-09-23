# Build from the REPO ROOT (docker build -f backend/Dockerfile .), not from
# backend/ — server.py imports ml/scripts/preprocess.py at runtime and reads
# ml/logs/*.json for the Results page, both of which live outside backend/.
#
# Single-stage: torch/mediapipe/opencv are the heavy dependencies here, and
# none of them benefit from a multi-stage split the way a Node build does —
# there's no separate "build output" to copy, just the installed packages.
FROM python:3.11-slim

WORKDIR /app

# opencv-python needs libgl/libglib at runtime even in headless mode.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
# Only the training *code* (small) — ml/data's raw tensors (~236MB, gitignored
# anyway) aren't needed to serve; ml/logs' small JSON/PNGs ARE (read live by
# GET /api/comparison for the Results page).
COPY ml/scripts ml/scripts
COPY ml/logs ml/logs

# backend/models/*.pt is gitignored (trained checkpoints, a few MB each) — if
# they exist in your local checkout, Docker's COPY above already picked them
# up along with the rest of backend/. If not, the app runs in honest mock
# mode, same as running it locally with no checkpoints (see inference.py).

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

WORKDIR /app/backend
EXPOSE 8000
CMD ["python", "server.py"]
