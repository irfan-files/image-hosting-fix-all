import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { db } from '../db/database';
import { defaultStorage } from '../storage/storageProvider';
import { ImageProcessor } from '../services/imageProcessor';
import { zipJobManager, safeDeleteTempFile, purgeOrphanedTempFiles, activeTempPaths } from '../services/zipJobManager';
import { ImageItem } from '../../src/types';

export const imageRouter = Router();

// Ensure temporary upload directory exists
const tempUploadDir = path.join(process.cwd(), 'storage', 'temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Disk-backed Multer storage: streams file chunks directly to disk instead of V8 heap RAM
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `upload_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const uploadSingle = multer({
  storage: diskStorage,
  limits: {
    fileSize: 200 * 1024 * 1024 // 200 MB max per single image
  },
  fileFilter: (req, file, cb) => {
    const allowedMIMEs = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
      'image/svg+xml',
      'image/svg',
      'image/bmp',
      'image/x-ms-bmp',
      'image/tiff',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'image/heic',
      'image/heif',
      'image/jfif',
      'image/pjpeg',
      'application/octet-stream'
    ];
    const allowedExts = [
      '.jpg',
      '.jpeg',
      '.jpe',
      '.jfif',
      '.jif',
      '.jfi',
      '.pjpeg',
      '.pjp',
      '.png',
      '.apng',
      '.webp',
      '.avif',
      '.gif',
      '.svg',
      '.bmp',
      '.dib',
      '.tiff',
      '.tif',
      '.ico',
      '.heic',
      '.heif',
      '.hif',
      '.dng',
      '.raw',
      '.cr2',
      '.nef',
      '.arw'
    ];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMIMEs.includes((file.mimetype || '').toLowerCase()) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Format file (${file.mimetype || ext}) tidak didukung. Gunakan format gambar umum (JPG, PNG, WEBP, AVIF, HEIC, GIF, SVG, BMP).`));
    }
  }
});

const uploadZip = multer({
  storage: diskStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 * 1024 // 50 GB max zip archive limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const zipMIMEs = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-zip',
      'application/octet-stream',
      'multipart/x-zip',
      'application/zip-compressed'
    ];
    if (ext === '.zip' || zipMIMEs.includes((file.mimetype || '').toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Format file harus berupa arsip .ZIP'));
    }
  }
});

export function getRequestBaseUrl(req: Request): string {
  const settings = db.getSettings();
  if (settings.publicImageUrl && settings.publicImageUrl.trim()) {
    return settings.publicImageUrl.trim().replace(/\/+$/, '');
  }
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3000';
  return `${protocol}://${host}`;
}

// GET /api/images - List images with query filters, pagination, search
imageRouter.get('/', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'usr_admin';
  const folderId = req.query.folderId as string | undefined;
  const status = (req.query.status as 'active' | 'trash') || 'active';
  const search = req.query.search as string | undefined;
  const mimeType = req.query.mimeType as string | undefined;
  const sortBy = req.query.sortBy as any;
  const sortOrder = req.query.sortOrder as any;
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const baseUrl = getRequestBaseUrl(req);

  const result = db.getImages(
    userId,
    {
      folderId,
      status,
      search,
      mimeType,
      sortBy,
      sortOrder,
      page,
      limit
    },
    baseUrl
  );

  return res.json(result);
});

// GET /api/images/:id - Get single image details
imageRouter.get('/:id', (req: Request, res: Response) => {
  const baseUrl = getRequestBaseUrl(req);
  const image = db.getImageById(req.params.id, baseUrl);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }
  return res.json({ image });
});

// POST /api/images/maintenance/cleanup - Manual trigger for duplicate purge & normalization
imageRouter.post('/maintenance/cleanup', (req: Request, res: Response) => {
  const removed = db.cleanAndDeduplicateAllImages();
  const tempCleaned = purgeOrphanedTempFiles(0);
  return res.json({
    message: `Pembersihan selesai. ${removed} data duplikat dihapus & ${tempCleaned} file sementara dibersihkan dari storage/temp.`,
    removed,
    tempCleaned
  });
});

// POST /api/images/maintenance/clean-temp - Clean storage/temp files
imageRouter.post('/maintenance/clean-temp', (req: Request, res: Response) => {
  const deleted = purgeOrphanedTempFiles(0);
  return res.json({
    message: `Berhasil membersihkan ${deleted} file sementara dari folder storage/temp.`,
    deleted
  });
});

// POST /api/images/check-duplicate - Pre-check checksum
imageRouter.post('/check-duplicate', (req: Request, res: Response) => {
  const userId = req.body.userId || 'usr_admin';
  const { checksum } = req.body;

  if (!checksum) {
    return res.status(400).json({ error: 'Checksum is required' });
  }

  const existing = db.getImageByChecksum(userId, checksum);
  if (existing) {
    const baseUrl = getRequestBaseUrl(req);
    return res.json({ isDuplicate: true, image: db.resolveImageUrls(existing, baseUrl) });
  }
  return res.json({ isDuplicate: false });
});

// POST /api/images/upload - Upload single or directory file (Disk-buffered)
imageRouter.post('/upload', (req: Request, res: Response) => {
  uploadSingle.single('file')(req, res, async (multerErr: any) => {
    if (multerErr) {
      console.error('[Upload Multer Error]:', multerErr);
      return res.status(400).json({ error: multerErr.message || 'Gagal menerima file gambar' });
    }

    const tempPath = req.file?.path;
    if (tempPath) {
      activeTempPaths.add(tempPath);
    }

    try {
      if (!req.file || !tempPath) {
        return res.status(400).json({ error: 'No image file uploaded' });
      }

      const userId = req.body.userId || 'usr_admin';
      const settings = db.getSettings();
      const targetSizeBytes = (settings.targetImageSizeMb || 2) * 1024 * 1024;

      const originalFilename = req.file.originalname;
      const relativePath = req.body.relativePath || req.body.folderPath || '';
      let folderId = req.body.folderId || null;
      let folderPathStr = '';

      // If relativePath includes folder hierarchy (e.g., "Produk/iPhone 15/black.jpg" or "Produk/iPhone 15")
      if (relativePath) {
        const cleanRel = relativePath.replace(/\\/g, '/');
        const parts = cleanRel.split('/').filter(Boolean);

        // If the last part matches original filename, extract directory part
        if (parts.length > 0 && parts[parts.length - 1].toLowerCase() === originalFilename.toLowerCase()) {
          parts.pop();
        }

        if (parts.length > 0) {
          folderPathStr = parts.join('/');
          const folderObj = db.findOrCreateFolderPath(userId, folderPathStr);
          folderId = folderObj.id;
        }
      } else if (folderId) {
        const folderObj = db.getFolderById(folderId);
        if (folderObj) {
          folderPathStr = folderObj.path;
        }
      }

      const fileBuffer = await fs.promises.readFile(tempPath);

      // Process & compress image adaptive multi-pass
      const processed = await ImageProcessor.processImage(fileBuffer, originalFilename, {
        targetSizeBytes,
        initialQuality: settings.defaultQuality,
        outputFormat: settings.outputFormat
      });

      // Check duplicate only if duplicateAction is explicitly set to skip
      if (settings.duplicateAction === 'skip') {
        const activeImages = db.getImages(userId, { status: 'active', limit: 50000 }).images;
        const existingDuplicate = activeImages.find(
          (img) =>
            img.checksum === processed.checksum &&
            (img.folderPath || '') === (folderPathStr || '') &&
            img.originalFilename.toLowerCase() === originalFilename.toLowerCase()
        );

        if (existingDuplicate) {
          return res.json({
            message: 'Duplicate file skipped in same folder',
            isDuplicate: true,
            image: existingDuplicate
          });
        }
      }

      // Exact clean stored filename without random hash suffix
      const storedFilename = originalFilename;
      const baseName = path.parse(originalFilename).name;

      // Storage relative path
      const storageRelPath = folderPathStr ? `${folderPathStr}/${storedFilename}` : storedFilename;
      const thumbRelPath = folderPathStr ? `${folderPathStr}/thumbs/${storedFilename}.webp` : `thumbs/${storedFilename}.webp`;

      // Write file & thumbnail to storage
      await defaultStorage.saveFile(storageRelPath, processed.buffer);
      await defaultStorage.saveFile(thumbRelPath, processed.thumbnailBuffer);

      // Get Base URL for Direct Image Links
      const baseUrl = getRequestBaseUrl(req);

      const directUrl = defaultStorage.getPublicUrl(storageRelPath, baseUrl);
      const thumbnailUrl = defaultStorage.getPublicUrl(thumbRelPath, baseUrl);

      // Save metadata in DB
      const imageRecord: ImageItem = {
        id: `img_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        folderId,
        folderPath: folderPathStr,
        originalFilename,
        storedFilename,
        slug: baseName,
        mimeType: processed.mimeType,
        extension: processed.extension,
        originalSize: processed.originalSize,
        compressedSize: processed.compressedSize,
        width: processed.width,
        height: processed.height,
        storagePath: storageRelPath,
        thumbnailPath: thumbRelPath,
        directUrl,
        thumbnailUrl,
        checksum: processed.checksum,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.addImage(imageRecord);

      return res.status(201).json({
        message: 'Upload successful',
        image: imageRecord
      });
    } catch (error: any) {
      console.error('Error during image upload:', error);
      return res.status(500).json({ error: error.message || 'Image processing failed' });
    } finally {
      if (tempPath) {
        activeTempPaths.delete(tempPath);
        await safeDeleteTempFile(tempPath, 5, 100);
      }
    }
  });
});

// POST /api/images/upload-zip - High-speed Server-Side ZIP Extraction with Real-time Progress & Folder Mapping
imageRouter.post('/upload-zip', (req: Request, res: Response) => {
  uploadZip.single('file')(req, res, async (multerErr: any) => {
    if (multerErr) {
      console.error('[Upload-Zip Multer Error]:', multerErr);
      return res.status(400).json({ error: multerErr.message || 'Gagal menerima file ZIP' });
    }

    const tempPath = req.file?.path;
    if (tempPath) {
      activeTempPaths.add(tempPath);
    }

    try {
      if (!req.file || !tempPath) {
        return res.status(400).json({ error: 'Tidak ada file .ZIP yang diunggah' });
      }

      const userId = req.body.userId || 'usr_admin';
      const baseTargetFolderId = req.body.folderId || null;
      const baseFolderPrefix = req.body.folderPrefix ? req.body.folderPrefix.trim().replace(/^\/+|\/+$/g, '') : '';
      const jobId = req.body.jobId || `zip_job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';

      // Start extraction & processing in zipJobManager on the server
      const result = await zipJobManager.processZipArchive(jobId, tempPath, {
        userId,
        baseFolderId: baseTargetFolderId,
        baseFolderPrefix,
        protocol: String(protocol),
        host: String(host)
      });

      return res.status(201).json({
        message: `Berhasil mengekstrak ${result.totalExtracted} gambar dan ${result.foldersCreated} folder dari ZIP di server!`,
        jobId,
        totalExtracted: result.totalExtracted,
        foldersCreated: result.foldersCreated,
        elapsedMs: result.elapsedMs,
        images: result.images,
        directUrls: result.directUrls
      });
    } catch (error: any) {
      console.error('Error during server ZIP extraction:', error);
      return res.status(500).json({ error: error.message || 'Gagal mengekstrak file ZIP di server' });
    } finally {
      if (tempPath) {
        activeTempPaths.delete(tempPath);
        await safeDeleteTempFile(tempPath, 5, 100);
      }
    }
  });
});

// POST /api/images/zip-jobs/init - Pre-initialize a zip extraction job before or during upload
imageRouter.post('/zip-jobs/init', (req: Request, res: Response) => {
  const { jobId, filename, userId } = req.body;
  const id = jobId || `zip_job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const job = zipJobManager.initOrGetJob(id, userId || 'usr_admin', filename || 'archive.zip');
  return res.json({ job });
});

// GET /api/images/zip-jobs/:jobId - Get snapshot of ZIP job progress on server
imageRouter.get('/zip-jobs/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = zipJobManager.initOrGetJob(jobId);
  return res.json({ job });
});

// GET /api/images/zip-jobs/:jobId/events - Server-Sent Events (SSE) for Real-Time Server Progress Bar
imageRouter.get('/zip-jobs/:jobId/events', (req: Request, res: Response) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial ping/state with registered job
  const initialJob = zipJobManager.initOrGetJob(jobId);
  res.write(`data: ${JSON.stringify(initialJob)}\n\n`);

  // Subscribe to micro-updates during server extraction
  const unsubscribe = zipJobManager.subscribe(jobId, (updatedJob) => {
    try {
      res.write(`data: ${JSON.stringify(updatedJob)}\n\n`);
      if (updatedJob.status === 'completed' || updatedJob.status === 'error' || updatedJob.status === 'cancelled') {
        setTimeout(() => {
          try {
            res.end();
          } catch (_) {}
        }, 1000);
      }
    } catch (_) {}
  });

  // Keep-alive heartbeat every 15 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// POST /api/images/zip-jobs/:jobId/cancel - Cancel server extraction job
imageRouter.post('/zip-jobs/:jobId/cancel', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const cancelled = zipJobManager.cancelJob(jobId);
  return res.json({ success: cancelled, message: cancelled ? 'Proses dibatalkan' : 'Job tidak dapat dibatalkan atau sudah selesai' });
});

// PATCH /api/images/:id - Rename image
imageRouter.patch('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { originalFilename } = req.body;

  if (!originalFilename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const updated = db.updateImage(id, { originalFilename });
  if (!updated) {
    return res.status(404).json({ error: 'Image not found' });
  }

  return res.json({ image: updated });
});

// DELETE /api/images/:id - Move to trash or delete permanently
imageRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';

  const image = db.getImageById(id);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  if (permanent) {
    await defaultStorage.deleteFile(image.storagePath);
    await defaultStorage.deleteFile(image.thumbnailPath);
    db.deleteImage(id, true);
  } else {
    db.deleteImage(id, false);
  }

  return res.json({ message: permanent ? 'Image deleted permanently' : 'Image moved to trash' });
});

// POST /api/images/:id/restore - Restore from trash
imageRouter.post('/:id/restore', (req: Request, res: Response) => {
  const { id } = req.params;
  const success = db.restoreImage(id);
  if (!success) {
    return res.status(404).json({ error: 'Image not found' });
  }
  return res.json({ message: 'Image restored successfully' });
});

// POST /api/images/bulk-delete - Bulk trash or permanent delete
imageRouter.post('/bulk-delete', async (req: Request, res: Response) => {
  const { ids, permanent } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  if (permanent) {
    for (const id of ids) {
      const img = db.getImageById(id);
      if (img) {
        await defaultStorage.deleteFile(img.storagePath);
        await defaultStorage.deleteFile(img.thumbnailPath);
      }
    }
  }

  const count = db.bulkDeleteImages(ids, permanent);
  return res.json({ message: `${count} images processed`, count });
});

// POST /api/images/bulk-move - Bulk move to folder
imageRouter.post('/bulk-move', async (req: Request, res: Response) => {
  const { ids, targetFolderId } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  let folderPathStr = '';
  if (targetFolderId) {
    const folder = db.getFolderById(targetFolderId);
    if (folder) folderPathStr = folder.path;
  }

  const count = db.bulkMoveImages(ids, targetFolderId || null, folderPathStr);
  return res.json({ message: `${count} images moved to ${folderPathStr || 'Root'}`, count });
});

// POST /api/images/reindex & /api/images/sync-disk - Re-scan disk storage and recover any unindexed images
imageRouter.post(['/reindex', '/sync-disk', '/recover'], async (req: Request, res: Response) => {
  const userId = req.body.userId || 'usr_admin';
  try {
    const result = await db.reconcileWithDiskStorage(userId);
    const total = db.getImages(userId, { limit: 50000 }).total;
    return res.json({
      message: `Sinkronisasi disk selesai. Berhasil memulihkan ${result.restored} gambar yang belum terindeks. Total gambar aktif: ${total}`,
      scanned: result.scanned,
      restored: result.restored,
      total
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Disk synchronization failed' });
  }
});
