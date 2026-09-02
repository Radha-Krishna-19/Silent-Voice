# =====================================================================
#  Silent Voice — ONE-TIME SETUP.  Run this once per machine.
#
#      .\setup.ps1
#
#  Creates the "nndl" virtualenv, installs Python + Node dependencies,
#  and verifies the install. Safe to re-run; it skips what already exists.
# =====================================================================
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Die($msg)      { Write-Host "`nFAILED: $msg" -ForegroundColor Red; exit 1 }

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Silent Voice - setup" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# --- 1. Python -------------------------------------------------------
Step 1 "Checking Python"
$py = $null
foreach ($c in @("python", "py -3.12", "py -3.11", "py -3.10")) {
    try {
        $parts = $c.Split(" ")
        $v = & $parts[0] $parts[1..99] --version 2>$null
        if ($v -match "Python 3\.(10|11|12)\.") { $py = $c; Ok "$v  ($c)"; break }
    } catch { }
}
if (-not $py) {
    Die "Need Python 3.10, 3.11 or 3.12. mediapipe has no build for 3.13+.
     Install from https://www.python.org/downloads/release/python-3120/
     and tick 'Add python.exe to PATH'."
}

# --- 2. virtualenv ---------------------------------------------------
Step 2 "Creating virtualenv 'nndl'"
$vpy = Join-Path $root "nndl\Scripts\python.exe"
if (Test-Path $vpy) {
    Ok "nndl already exists - reusing"
} else {
    $parts = $py.Split(" ")
    & $parts[0] $parts[1..99] -m venv nndl
    if (-not (Test-Path $vpy)) { Die "venv creation failed" }
    Ok "created nndl\"
}

# --- 3. Python dependencies -----------------------------------------
# Called through the venv's python.exe directly, so NO activation is
# needed and it cannot silently install into the wrong environment.
Step 3 "Installing Python packages (a few minutes - torch is ~200 MB)"
& $vpy -m pip install --upgrade pip --quiet
& $vpy -m pip install -r (Join-Path $root "ml\requirements-training.txt")
& $vpy -m pip install -r (Join-Path $root "backend\requirements.txt")
Ok "python packages installed"

Step 4 "Verifying imports"
& $vpy -c @"
import torch, mediapipe, cv2, numpy, fastapi, sklearn
print('    torch', torch.__version__, '| mediapipe', mediapipe.__version__,
      '| cv2', cv2.__version__, '| numpy', numpy.__version__)
mediapipe.solutions.holistic.Holistic(static_image_mode=True, model_complexity=1)
print('    MediaPipe Holistic loads OK')
"@ 2>$null
if ($LASTEXITCODE -ne 0) { Die "import check failed - see the error above" }
Ok "all imports fine"

# --- 5. Node ---------------------------------------------------------
Step 5 "Installing frontend packages"
try { $nv = node --version } catch { Die "Node.js not found. Install 18+ from https://nodejs.org" }
Ok "node $nv"
Push-Location (Join-Path $root "frontend")
if (Test-Path "node_modules\react") {
    Ok "node_modules already present - skipping"
} else {
    npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { Pop-Location; Die "npm install failed" }
    Ok "frontend packages installed"
}
Pop-Location

# --- 6. Trained models ----------------------------------------------
Step 6 "Checking for trained models"
$need = @("bilstm.pt", "cnn.pt", "label_map.json", "preproc_stats.json")
$missing = $need | Where-Object { -not (Test-Path (Join-Path $root "backend\models\$_")) }
if ($missing) {
    Write-Host "    NOTE: backend\models\ is missing: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "    The app still runs (mock predictions). To train:" -ForegroundColor Yellow
    Write-Host "      cd ml; ..\nndl\Scripts\python.exe -u run_pipeline.py --skip-preprocess --epochs 60 --batch 32 --lr 3e-3 --no-augment" -ForegroundColor Yellow
} else {
    Ok "trained models present (BiLSTM + 1D CNN, 261 classes)"
}

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host " Setup complete.  Now run:   .\start.ps1" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
