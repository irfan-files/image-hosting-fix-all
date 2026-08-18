#!/usr/bin/env bash
set -e

echo "========================================"
echo " PICMARKET DEPLOYMENT SCRIPT"
echo "========================================"

if ! command -v docker &> /dev/null; then
    echo "[X] Error: Docker is not installed."
    exit 1
fi

echo "[✓] Docker detected"

if [ ! -f .env ]; then
    echo "[!] Creating .env from .env.example..."
    cp .env.example .env
fi

echo "[*] Building and starting PicMarket services..."
docker compose up -d --build

echo "[*] Waiting for server healthcheck..."
sleep 5

echo "========================================"
echo " APPLICATION READY"
echo "========================================"
echo " App URL: http://localhost:3000"
echo " Health:  http://localhost:3000/api/health"
echo "========================================"
