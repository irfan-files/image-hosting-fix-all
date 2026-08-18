import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

import { authRouter } from './server/routes/authRoutes';
import { folderRouter } from './server/routes/folderRoutes';
import { imageRouter } from './server/routes/imageRoutes';
import { exportRouter } from './server/routes/exportRoutes';
import { statsRouter } from './server/routes/statsRoutes';
import { defaultStorage } from './server/storage/storageProvider';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust reverse proxy headers (Nginx, Docker port-forwarding, Cloudflare)
  app.set('trust proxy', true);

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve Direct Image Public URL: GET /images/*
  // Example: http://27.112.79.121:3000/images/produk/iphone-15/black.jpg
  const uploadsDir = defaultStorage.getBaseDir();
  app.use('/images', express.static(uploadsDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res, filePath) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=2592000');
    }
  }));

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    return res.json({
      status: 'ok',
      database: 'connected',
      storage: 'ready',
      version: '1.0.0',
      uptime: process.uptime()
    });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/folders', folderRouter);
  app.use('/api/images', imageRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api', statsRouter); // Mount settings at /api/settings as well

  // Vite Middleware in Development vs Static Serving in Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production / Docker static serving
    const candidateDistDirs = [
      path.join(process.cwd(), 'dist'),
      path.resolve('dist'),
      path.join(__dirname, 'dist'),
      path.join(__dirname, '..', 'dist'),
      path.resolve(__dirname),
      path.resolve(process.cwd())
    ];

    let distDir = path.join(process.cwd(), 'dist');
    for (const dir of candidateDistDirs) {
      if (fs.existsSync(path.join(dir, 'index.html'))) {
        distDir = dir;
        break;
      }
    }

    console.log(`[Production] Serving static files from: ${distDir}`);
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // Do not intercept API or images
      if (req.path.startsWith('/api') || req.path.startsWith('/images')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(` PICMARKET SERVER RUNNING AT PORT ${PORT}`);
    console.log(` Health: http://localhost:${PORT}/api/health`);
    console.log(`========================================`);
  });

  // Configure high-resilience server timeouts for large batch uploads and 2GB ZIP extractions
  server.timeout = 15 * 60 * 1000; // 15 minutes timeout
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer();
