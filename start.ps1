# ============================================================
# OceanEmbed – one-shot dev launcher
# Usage: .\start.ps1
# Starts the FastAPI backend (port 8000) + Vite frontend (port 3000)
# ============================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  OceanEmbed Dev Launcher" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Python ──────────────────────────────────────────
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python not found in PATH." -ForegroundColor Red
    exit 1
}

# ── 2. Check FastAPI deps ────────────────────────────────────
Write-Host "[1/3] Checking Python dependencies..." -ForegroundColor Yellow
python -c "import fastapi, uvicorn, torch, numpy" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing Python dependencies..." -ForegroundColor DarkYellow
    pip install -r "$root\requirements.txt" --quiet
}
Write-Host "  Python deps OK" -ForegroundColor Green

# ── 3. Launch FastAPI backend ────────────────────────────────
Write-Host ""
Write-Host "[2/3] Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Yellow
$backendJob = Start-Process -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" `
    -WorkingDirectory $root `
    -PassThru `
    -NoNewWindow

Write-Host "  Backend PID: $($backendJob.Id)" -ForegroundColor Green

# Give the server a moment to bind
Start-Sleep -Seconds 2

# ── 4. Launch Vite frontend ──────────────────────────────────
Write-Host ""
Write-Host "[3/3] Starting Vite frontend on http://localhost:3000 ..." -ForegroundColor Yellow
$frontendJob = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $root `
    -PassThru `
    -NoNewWindow

Write-Host "  Frontend PID: $($frontendJob.Id)" -ForegroundColor Green

Write-Host ""
Write-Host "-----------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Frontend : http://localhost:3000" -ForegroundColor Cyan
Write-Host "  API docs : http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Health   : http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "  Metrics  : http://localhost:8000/api/v1/metrics" -ForegroundColor Cyan
Write-Host "-----------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Press Ctrl+C to stop both processes." -ForegroundColor Gray
Write-Host ""

# Wait until user kills the script, then clean up
try {
    Wait-Process -Id $frontendJob.Id -ErrorAction SilentlyContinue
} finally {
    Write-Host ""
    Write-Host "Shutting down..." -ForegroundColor DarkYellow
    if (-not $backendJob.HasExited)  { Stop-Process -Id $backendJob.Id  -Force -ErrorAction SilentlyContinue }
    if (-not $frontendJob.HasExited) { Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "Done." -ForegroundColor Green
}
