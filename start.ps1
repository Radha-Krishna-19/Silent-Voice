# =====================================================================
#  Silent Voice — START THE APP.
#
#      .\start.ps1
#
#  Opens the backend and frontend in two windows and launches the
#  browser. You do NOT need to activate the virtualenv first: the
#  backend is launched via nndl\Scripts\python.exe directly, which is
#  exactly equivalent to activating and immune to forgetting.
# =====================================================================
$root = $PSScriptRoot
Set-Location $root

$vpy = Join-Path $root "nndl\Scripts\python.exe"
if (-not (Test-Path $vpy)) {
    Write-Host "Virtualenv 'nndl' not found. Run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $root "frontend\node_modules\react"))) {
    Write-Host "Frontend packages missing. Run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host "Starting backend  -> http://localhost:8000" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\backend'; & '$vpy' server.py"
)

Start-Sleep -Seconds 3

Write-Host "Starting frontend -> http://localhost:3000" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\frontend'; npm start"
)

Write-Host "`nTwo windows opened. The frontend takes ~30-60s to compile." -ForegroundColor Green
Write-Host "Then open:  http://localhost:3000" -ForegroundColor Green
Write-Host "  /live      webcam -> live sign recognition" -ForegroundColor Gray
Write-Host "  /research  BiLSTM 91.74%  vs  1D CNN 94.55%" -ForegroundColor Gray
Write-Host "`nClose both windows to stop." -ForegroundColor Gray
