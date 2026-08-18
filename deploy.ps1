Write-Host "========================================" -ForegroundColor Cyan
Write-Host " PICMARKET DEPLOYMENT SCRIPT (WINDOWS)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[X] Error: Docker is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

Write-Host "[✓] Docker detected" -ForegroundColor Green

if (-not (Test-Path .env)) {
    Write-Host "[!] Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
}

Write-Host "[*] Building and starting PicMarket services..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "========================================" -ForegroundColor Green
Write-Host " APPLICATION READY" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host " App URL: http://localhost:3000" -ForegroundColor White
Write-Host " Health:  http://localhost:3000/api/health" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
