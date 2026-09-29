# Hugging Face Spaces image for the Silent Voice backend.
# Assembled and uploaded by scripts/deploy_space.py — not built from the
# repo root like backend/Dockerfile, because the Space repo is a flat copy
# (backend/, ml/scripts, ml/logs) with the trained checkpoints included.
FROM python:3.11-slim

# opencv-python needs libgl/libglib at runtime even in headless mode.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch: the default Linux wheel pulls ~2 GB of CUDA libraries the
# free Space hardware cannot use.
COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r /tmp/requirements.txt

# Spaces run the container as uid 1000.
RUN useradd -m -u 1000 user
WORKDIR /home/user/app
COPY --chown=user backend/ backend/
COPY --chown=user ml/ ml/
USER user

ENV PORT=7860
WORKDIR /home/user/app/backend
EXPOSE 7860
CMD ["python", "server.py"]
