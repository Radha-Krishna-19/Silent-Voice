#!/usr/bin/env bash
# =====================================================================
#  Silent Voice — ONE COMMAND (macOS / Linux). Mirrors run-windows.ps1.
#
#      ./run-mac.sh
#
#  Checks the environment, installs anything missing, rebuilds any
#  derived artefact that is absent, starts both servers and opens the
#  browser. Safe to run every time: it skips whatever is already done.
#
#      ./run-mac.sh --check     verify only, start nothing
#      ./run-mac.sh --stop      stop anything already running on 3000/8000
# =====================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; GRAY=$'\033[90m'; NC=$'\033[0m'
step() { printf "\n%s> %s%s\n" "$CYAN" "$1" "$NC"; }
ok()   { printf "  %sok    %s%s\n" "$GREEN" "$1" "$NC"; }
warn() { printf "  %s..    %s%s\n" "$YELLOW" "$1" "$NC"; }
die()  { printf "\n%sFAILED: %s%s\n" "$RED" "$1" "$NC"; exit 1; }

VENV="$ROOT/nndl"
VPY="$VENV/bin/python"
LOGDIR="$ROOT/.run-logs"

stop_ports() {
    for port in 3000 8000; do
        pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            kill -9 $pids 2>/dev/null || true
            ok "stopped process on :$port"
        fi
    done
}

if [ "${1:-}" = "--stop" ]; then
    step "Stopping servers"
    stop_ports
    printf "\n%sDone.%s\n" "$GREEN" "$NC"
    exit 0
fi

CHECK=0
if [ "${1:-}" = "--check" ]; then CHECK=1; fi

echo "${CYAN}=====================================================${NC}"
echo "${CYAN} Silent Voice${NC}"
echo "${CYAN}=====================================================${NC}"

# ------------------------------------------------------------- python
step "Python environment"
if [ ! -x "$VPY" ]; then
    warn "virtualenv 'nndl' missing - creating"
    PYBIN=""
    for c in python3.12 python3.11 python3.10 python3; do
        if command -v "$c" >/dev/null 2>&1; then
            v=$("$c" --version 2>&1)
            if [[ "$v" =~ Python\ 3\.(10|11|12)\. ]]; then PYBIN="$c"; break; fi
        fi
    done
    [ -z "$PYBIN" ] && die "Need Python 3.10-3.12 (mediapipe has no 3.13 build yet). Install via 'brew install python@3.11' or python.org."
    "$PYBIN" -m venv "$VENV"
    [ -x "$VPY" ] || die "venv creation failed"
    ok "created nndl/"
else
    ok "nndl/ present"
fi

# --------------------------------------------------------- python deps
step "Python packages"
NEED_PKGS=0
"$VPY" -c "import torch, mediapipe, cv2, numpy, fastapi, sklearn" 2>/dev/null || NEED_PKGS=1
if [ "$NEED_PKGS" = "1" ]; then
    warn "installing (torch is ~200 MB, this takes a few minutes)"
    "$VPY" -m pip install --upgrade pip --quiet
    "$VPY" -m pip install -r "$ROOT/ml/requirements-training.txt"
    "$VPY" -m pip install -r "$ROOT/backend/requirements.txt"
    "$VPY" -c "import torch, mediapipe, cv2, numpy, fastapi, sklearn" 2>/dev/null \
        || die "packages still missing after install - see errors above"
fi
ok "torch, mediapipe, cv2, fastapi, sklearn all import"

# ------------------------------------------------------------ node
step "Frontend packages"
command -v node >/dev/null 2>&1 || die "Node.js not found. Install 18+ via 'brew install node' or nodejs.org."
NODE_V=$(node --version)

FE="$ROOT/frontend"
PKG_JSON="$FE/package.json"
STAMP="$FE/node_modules/.silentvoice-install-stamp"
if command -v shasum >/dev/null 2>&1; then
    PKG_HASH=$(shasum -a 256 "$PKG_JSON" | awk '{print $1}')
else
    PKG_HASH=$(sha256sum "$PKG_JSON" | awk '{print $1}')
fi
STAMP_VAL=""
if [ -f "$STAMP" ]; then STAMP_VAL=$(cat "$STAMP"); fi

if [ ! -d "$FE/node_modules/react" ] || [ "$STAMP_VAL" != "$PKG_HASH" ]; then
    if [ -n "$STAMP_VAL" ] && [ "$STAMP_VAL" != "$PKG_HASH" ]; then
        warn "package.json changed - updating packages"
    else
        warn "installing (~1400 packages, a few minutes)"
    fi
    (cd "$FE" && npm install --legacy-peer-deps --no-audit --no-fund)
    printf '%s' "$PKG_HASH" > "$STAMP"
fi
ok "node $NODE_V, packages present"

# ------------------------------------------------- derived artefacts
step "Model artefacts"
MODELS="$ROOT/backend/models"
HAVE_CKPT=0
if [ -f "$MODELS/bilstm.pt" ] || [ -f "$MODELS/cnn.pt" ]; then HAVE_CKPT=1; fi

if [ "$HAVE_CKPT" = "0" ]; then
    warn "no trained checkpoints in backend/models/"
    warn "the app will run with placeholder predictions until you train:"
    warn "  cd ml && ../nndl/bin/python -u run_pipeline.py --skip-preprocess --epochs 60 --batch 32 --lr 3e-3 --no-augment"
else
    ok "checkpoints present"
    TENSORS="$ROOT/ml/data/processed/include"
    if [ -d "$TENSORS" ]; then
        if [ ! -f "$MODELS/sign_bank.json" ]; then
            warn "building reverse-translation sign bank"
            (cd "$ROOT/ml" && "$VPY" scripts/build_sign_bank.py)
        fi
        if [ ! -f "$MODELS/practice_refs.npz" ]; then
            warn "building practice reference set"
            (cd "$ROOT/ml" && "$VPY" scripts/build_practice_refs.py)
        fi
        if [ ! -f "$ROOT/frontend/src/lib/vocabulary.js" ]; then
            warn "exporting UI vocabulary from the label map"
            (cd "$ROOT/ml" && "$VPY" scripts/export_ui_vocab.py)
        fi
    fi
    if [ -f "$MODELS/sign_bank.json" ]; then ok "sign bank (reverse translation)"; fi
    if [ -f "$MODELS/practice_refs.npz" ]; then ok "practice references"; fi
fi

if [ "$CHECK" = "1" ]; then
    printf "\n%sCheck complete - nothing started.%s\n" "$GREEN" "$NC"
    exit 0
fi

# ----------------------------------------------------------- launch
step "Starting servers"
stop_ports
mkdir -p "$LOGDIR"

nohup "$VPY" "$ROOT/backend/server.py" > "$LOGDIR/backend.log" 2>&1 &
disown
ok "backend  -> http://localhost:8000  (log: .run-logs/backend.log)"

sleep 3

( cd "$FE" && nohup npm start > "$LOGDIR/frontend.log" 2>&1 & disown )
ok "frontend -> http://localhost:3000  (log: .run-logs/frontend.log)"

echo ""
echo "  Waiting for the frontend to compile (~40s)..."
READY=0
for _ in $(seq 1 60); do
    sleep 2
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || true)
    if [ "$code" = "200" ]; then READY=1; break; fi
done

echo ""
if [ "$READY" = "1" ]; then
    if command -v open >/dev/null 2>&1; then open "http://localhost:3000"
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:3000"
    fi
    echo "${GREEN}=====================================================${NC}"
    echo "${GREEN} Open: http://localhost:3000${NC}"
    echo "${GREEN}=====================================================${NC}"
else
    echo "${YELLOW} Frontend is still compiling - open http://localhost:3000 shortly.${NC}"
fi

echo "${GRAY}  /           sign in, or continue as a guest${NC}"
echo "${GRAY}  /home       the 3-D hand performing real signs${NC}"
echo "${GRAY}  /live       webcam -> live sign recognition${NC}"
echo "${GRAY}  /reverse    English -> replayed signer skeleton${NC}"
echo "${GRAY}  /practice   record an attempt, get scored${NC}"
echo "${GRAY}  /contribute record a clip to grow the dataset${NC}"
echo "${GRAY}  /research   BiLSTM vs 1D CNN, measured${NC}"
echo "${GRAY}  /rubric     Review 2 rubric, scored honestly${NC}"
printf "\n%s  Ctrl+K anywhere opens the command palette.%s\n" "$GRAY" "$NC"
printf "\n%s  Stop everything with:  ./run-mac.sh --stop%s\n" "$GRAY" "$NC"
