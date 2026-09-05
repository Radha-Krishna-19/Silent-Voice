# =====================================================================
#  Silent Voice — ONE COMMAND.
#
#      .\run.ps1
#
#  Checks the environment, installs anything missing, rebuilds any
#  derived artefact that is absent, starts both servers and opens the
#  browser. Safe to run every time: it skips whatever is already done.
#
#      .\run.ps1 -Check     verify only, start nothing
#      .\run.ps1 -Stop      stop anything already running on 3000/8000
# =====================================================================
param([switch]$Check, [switch]$Stop)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

function Step($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  ok    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  ..    $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "`nFAILED: $m" -ForegroundColor Red; exit 1 }

$vpy = Join-Path $root "nndl\Scripts\python.exe"

# ---------------------------------------------------------------- stop
function Stop-Ports {
    foreach ($port in 3000, 8000) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Ok "stopped process on :$port" }
            catch { }
        }
    }
}
if ($Stop) { Step "Stopping servers"; Stop-Ports; Write-Host "`nDone." -ForegroundColor Green; exit 0 }

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Silent Voice" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# ------------------------------------------------------------- python
Step "Python environment"
if (-not (Test-Path $vpy)) {
    Warn "virtualenv 'nndl' missing - creating"
    $py = $null
    foreach ($c in @("python", "py -3.12", "py -3.11", "py -3.10")) {
        try {
            $parts = $c.Split(" ")
            $v = & $parts[0] $parts[1..99] --version 2>$null
            if ($v -match "Python 3\.(10|11|12)\.") { $py = $c; break }
        } catch { }
    }
    if (-not $py) {
        Die "Need Python 3.10-3.12 (mediapipe has no 3.13 build).
     Install from python.org, tick 'Add python.exe to PATH', reopen the terminal."
    }
    $parts = $py.Split(" ")
    & $parts[0] $parts[1..99] -m venv nndl
    if (-not (Test-Path $vpy)) { Die "venv creation failed" }
    Ok "created nndl\"
} else {
    Ok "nndl\ present"
}

# --------------------------------------------------------- python deps
Step "Python packages"
$needPkgs = $false
& $vpy -c "import torch, mediapipe, cv2, numpy, fastapi, sklearn" 2>$null
if ($LASTEXITCODE -ne 0) { $needPkgs = $true }
if ($needPkgs) {
    Warn "installing (torch is ~200 MB, this takes a few minutes)"
    & $vpy -m pip install --upgrade pip --quiet
    & $vpy -m pip install -r (Join-Path $root "ml\requirements-training.txt")
    & $vpy -m pip install -r (Join-Path $root "backend\requirements.txt")
    & $vpy -c "import torch, mediapipe, cv2, numpy, fastapi, sklearn" 2>$null
    if ($LASTEXITCODE -ne 0) { Die "packages still missing after install - see errors above" }
}
Ok "torch, mediapipe, cv2, fastapi, sklearn all import"

# ------------------------------------------------------------ node
Step "Frontend packages"
try { $nv = node --version } catch { Die "Node.js not found. Install 18+ from nodejs.org" }

# Reinstall when package.json changes, not just when node_modules is absent.
# Checking only for node_modules\react meant that adding a dependency (three,
# for the 3-D hand) left everyone with a stale tree and a runtime
# "Cannot find module" that looked like a code bug.
$fe        = Join-Path $root "frontend"
$pkgPath   = Join-Path $fe "package.json"
$stampPath = Join-Path $fe "node_modules\.silentvoice-install-stamp"
$pkgHash   = (Get-FileHash $pkgPath -Algorithm SHA256).Hash
$stamp     = if (Test-Path $stampPath) { (Get-Content $stampPath -Raw).Trim() } else { "" }

if (-not (Test-Path (Join-Path $fe "node_modules\react")) -or $stamp -ne $pkgHash) {
    if ($stamp -and $stamp -ne $pkgHash) { Warn "package.json changed - updating packages" }
    else { Warn "installing (~1400 packages, a few minutes)" }
    Push-Location $fe
    npm install --legacy-peer-deps --no-audit --no-fund
    $rc = $LASTEXITCODE
    Pop-Location
    if ($rc -ne 0) { Die "npm install failed" }
    Set-Content -Path $stampPath -Value $pkgHash -NoNewline
}
Ok "node $nv, packages present"

# ------------------------------------------------- derived artefacts
Step "Model artefacts"
$models = Join-Path $root "backend\models"
$haveCkpt = (Test-Path "$models\bilstm.pt") -or (Test-Path "$models\cnn.pt")

if (-not $haveCkpt) {
    Warn "no trained checkpoints in backend\models\"
    Warn "the app will run with placeholder predictions until you train:"
    Warn "  cd ml; ..\nndl\Scripts\python.exe -u run_pipeline.py --skip-preprocess --epochs 60 --batch 32 --lr 3e-3 --no-augment"
} else {
    Ok "checkpoints present"

    # Rebuild anything derived from the tensors that is missing.
    $tensors = Join-Path $root "ml\data\processed\include"
    if (Test-Path $tensors) {
        if (-not (Test-Path "$models\sign_bank.json")) {
            Warn "building reverse-translation sign bank"
            Push-Location (Join-Path $root "ml"); & $vpy scripts\build_sign_bank.py; Pop-Location
        }
        if (-not (Test-Path "$models\practice_refs.npz")) {
            Warn "building practice reference set"
            Push-Location (Join-Path $root "ml"); & $vpy scripts\build_practice_refs.py; Pop-Location
        }
        if (-not (Test-Path (Join-Path $root "frontend\src\lib\vocabulary.js"))) {
            Warn "exporting UI vocabulary from the label map"
            Push-Location (Join-Path $root "ml"); & $vpy scripts\export_ui_vocab.py; Pop-Location
        }
    }
    if (Test-Path "$models\sign_bank.json")     { Ok "sign bank (reverse translation)" }
    if (Test-Path "$models\practice_refs.npz")  { Ok "practice references" }
}

if ($Check) {
    Write-Host "`nCheck complete - nothing started." -ForegroundColor Green
    exit 0
}

# ----------------------------------------------------------- launch
Step "Starting servers"
Stop-Ports

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle='Silent Voice - backend :8000'; Set-Location '$root\backend'; & '$vpy' server.py"
)
Ok "backend  -> http://localhost:8000"

Start-Sleep -Seconds 3

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle='Silent Voice - frontend :3000'; Set-Location '$root\frontend'; npm start"
)
Ok "frontend -> http://localhost:3000"

Write-Host "`n  Waiting for the frontend to compile (~40s)..." -ForegroundColor Gray
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}

Write-Host ""
if ($ready) {
    Start-Process "http://localhost:3000"
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host " Open: http://localhost:3000" -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
} else {
    Write-Host " Frontend is still compiling - open http://localhost:3000 shortly." -ForegroundColor Yellow
}

Write-Host "  /           sign in, or continue as a guest"    -ForegroundColor Gray
Write-Host "  /home       the 3-D hand performing real signs"  -ForegroundColor Gray
Write-Host "  /live       webcam -> live sign recognition"     -ForegroundColor Gray
Write-Host "  /reverse    English -> replayed signer skeleton" -ForegroundColor Gray
Write-Host "  /practice   record an attempt, get scored"       -ForegroundColor Gray
Write-Host "  /research   BiLSTM vs 1D CNN, measured"          -ForegroundColor Gray
Write-Host "  /rubric     Review 2 rubric, scored honestly"    -ForegroundColor Gray
Write-Host "`n  Ctrl+K anywhere opens the command palette."    -ForegroundColor Gray
Write-Host "`n  Stop everything with:  .\run.ps1 -Stop" -ForegroundColor Gray
