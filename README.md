# PicMarket - Full-Stack Image Hosting & Marketplace Image Manager

PicMarket is a high-performance, production-ready full-stack Image Hosting and Management platform designed specifically for bulk product image uploads for e-commerce marketplaces (Shopee, Tokopedia, Lazada, TikTok Shop, custom web stores).

## Key Features

- **Folder Tree Drag & Drop**: Preserve folder hierarchy when dragging directory trees (e.g., `Produk/iPhone 15/black.jpg`).
- **Adaptive Sharp Compression**: Automatically reduces image size to **&le; 2 MB** per file through step-by-step multi-pass quality and scale optimization while preserving visual clarity.
- **Permanent Direct Image URLs**: Every image gets a clean, public direct URL (`http://domain.com/images/...`).
- **Marketplace Export Engine**: Export folder-to-URL mappings into Excel (`.xlsx`) or `.csv` files formatted for marketplace product upload sheets.
- **Bulk Batch Queue**: Non-blocking concurrent uploads (concurrency = 5) with status indicators and checksum duplicate detection.
- **File & Folder Management**: Full CRUD, move, rename, search, filter, trash, restore, grid/list toggle.
- **Storage Metrics**: Live storage savings dashboard showing total MB saved via compression.

## Quick Start (One Command)

### Docker Compose (Recommended)
```bash
docker compose up -d --build
```
Or run the deployment script:
```bash
# Linux / macOS
chmod +x deploy.sh && ./deploy.sh

# Windows PowerShell
.\deploy.ps1
```

Once running, access:
- **Frontend App**: `http://localhost:3000`
- **Health Check**: `http://localhost:3000/api/health`

### Local Development (Node.js)
```bash
npm install
npm run dev
```

## Environment Variables (.env)
```env
PORT=3000
TARGET_IMAGE_SIZE_MB=2
STORAGE_PATH=./storage
PUBLIC_IMAGE_URL=
```
