#!/usr/bin/env bash
set -e

BACKUP_DIR="./storage/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

if [ -f "./storage/data.json" ]; then
    cp ./storage/data.json "$BACKUP_DIR/data_$TIMESTAMP.json"
    echo "[✓] Database metadata backup saved to $BACKUP_DIR/data_$TIMESTAMP.json"
else
    echo "[!] No database file found to backup."
fi
