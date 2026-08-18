import StreamZip from 'node-stream-zip';
import AdmZip from 'adm-zip';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { db } from '../db/database';
import { defaultStorage } from '../storage/storageProvider';
import { ImageProcessor } from './imageProcessor';
import { ImageItem } from '../../src/types';

const TEMP_DIR = path.join(process.cwd(), 'storage', 'temp');

/**
 * Global set of temporary files currently in use by active uploads or extraction jobs.
 * These files MUST NEVER be deleted by background cleaners while in use.
 */
export const activeTempPaths = new Set<string>();

/**
 * Safely delete a temporary file with retry logic to ensure file locks are released
 */
export async function safeDeleteTempFile(filePath: string, maxRetries = 5, delayMs = 200): Promise<boolean> {
  if (!filePath) return false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`[TempCleaner] Berhasil menghapus file temp: ${filePath}`);
        return true;
      }
      return true; // Already deleted
    } catch (err: any) {
      if (attempt === maxRetries) {
        console.warn(`[TempCleaner] Gagal menghapus file temp ${filePath} setelah ${maxRetries} percobaan:`, err.message);
        return false;
      }
      await new Promise((res) => setTimeout(res, delayMs * attempt));
    }
  }
  return false;
}

/**
 * Purge all orphaned temporary files in storage/temp that are older than maxAgeMs
 * and NOT currently in the activeTempPaths set.
 */
export function purgeOrphanedTempFiles(maxAgeMs = 15 * 60 * 1000): number {
  if (!fs.existsSync(TEMP_DIR)) return 0;
  let deletedCount = 0;
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    for (const file of files) {
      try {
        const fullPath = path.join(TEMP_DIR, file);
        if (activeTempPaths.has(fullPath)) {
          continue; // Active file, do not touch
        }
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && (now - stat.mtimeMs > maxAgeMs)) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      } catch (_) {}
    }
    if (deletedCount > 0) {
      console.log(`[TempCleaner] Membersihkan ${deletedCount} file sementara lama dari storage/temp.`);
    }
  } catch (err) {
    console.error('[TempCleaner] Error saat membersihkan direktori temp:', err);
  }
  return deletedCount;
}

export interface ZipJobResult {
  totalExtracted: number;
  foldersCreated: number;
  elapsedMs: number;
  images: ImageItem[];
  directUrls: string[];
}

export interface ZipJob {
  id: string;
  userId: string;
  filename: string;
  status: 'uploading' | 'queued' | 'scanning' | 'extracting' | 'completed' | 'error' | 'cancelled';
  phaseText: string;
  totalEntries: number;
  validImagesCount: number;
  processedCount: number;
  skippedCount: number;
  foldersCreated: number;
  currentFolder: string;
  currentFile: string;
  percent: number;
  startTime: number;
  endTime?: number;
  elapsedMs: number;
  speedFilesPerSec: number;
  estimatedRemainingSec: number;
  error?: string;
  result?: ZipJobResult;
}

export interface ProcessZipOptions {
  userId: string;
  baseFolderId?: string | null;
  baseFolderPrefix?: string;
  protocol?: string;
  host?: string;
}

const SUPPORTED_ZIP_IMAGE_EXTS = new Set([
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
]);

class ZipJobManagerService {
  private jobs: Map<string, ZipJob> = new Map();
  private subscribers: Map<string, Set<(job: ZipJob) => void>> = new Map();
  private cancelFlags: Set<string> = new Set();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Purge any leftover temporary zip or upload files immediately on startup
    try {
      purgeOrphanedTempFiles(0);
    } catch (_) {}

    // Background periodic temp folder cleaner every 2 minutes
    this.cleanupTimer = setInterval(() => {
      try {
        purgeOrphanedTempFiles(2 * 60 * 1000);
      } catch (_) {}
    }, 2 * 60 * 1000);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public createJob(id: string, userId: string, filename: string): ZipJob {
    const job: ZipJob = {
      id,
      userId,
      filename,
      status: 'queued',
      phaseText: 'Menyiapkan proses di server...',
      totalEntries: 0,
      validImagesCount: 0,
      processedCount: 0,
      skippedCount: 0,
      foldersCreated: 0,
      currentFolder: '',
      currentFile: '',
      percent: 0,
      startTime: Date.now(),
      elapsedMs: 0,
      speedFilesPerSec: 0,
      estimatedRemainingSec: 0
    };

    this.jobs.set(id, job);
    this.cancelFlags.delete(id);
    this.broadcast(job);
    return job;
  }

  public initOrGetJob(id: string, userId: string = 'usr_admin', filename: string = 'archive.zip'): ZipJob {
    let job = this.jobs.get(id);
    if (!job) {
      job = {
        id,
        userId,
        filename,
        status: 'uploading',
        phaseText: 'Mengunggah file ZIP ke server...',
        totalEntries: 0,
        validImagesCount: 0,
        processedCount: 0,
        skippedCount: 0,
        foldersCreated: 0,
        currentFolder: '',
        currentFile: '',
        percent: 0,
        startTime: Date.now(),
        elapsedMs: 0,
        speedFilesPerSec: 0,
        estimatedRemainingSec: 0
      };
      this.jobs.set(id, job);
    }
    return job;
  }

  public getJob(id: string): ZipJob | undefined {
    return this.jobs.get(id);
  }

  public cancelJob(id: string): boolean {
    this.cancelFlags.add(id);
    const job = this.jobs.get(id);
    if (job && job.status !== 'completed' && job.status !== 'error') {
      job.status = 'cancelled';
      job.phaseText = 'Dibatalkan oleh pengguna.';
      job.endTime = Date.now();
      job.elapsedMs = job.endTime - job.startTime;
      this.broadcast(job);
      return true;
    }
    return false;
  }

  public isCancelled(id: string): boolean {
    return this.cancelFlags.has(id);
  }

  public subscribe(id: string, callback: (job: ZipJob) => void): () => void {
    if (!this.subscribers.has(id)) {
      this.subscribers.set(id, new Set());
    }
    this.subscribers.get(id)!.add(callback);

    // Send initial state immediately
    const job = this.jobs.get(id);
    if (job) {
      callback(job);
    }

    return () => {
      const set = this.subscribers.get(id);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.subscribers.delete(id);
        }
      }
    };
  }

  private broadcast(job: ZipJob) {
    const set = this.subscribers.get(job.id);
    if (set) {
      set.forEach((cb) => {
        try {
          cb({ ...job });
        } catch (_) {}
      });
    }
  }

  public async processZipArchive(
    jobId: string,
    tempZipPath: string,
    options: ProcessZipOptions
  ): Promise<ZipJobResult> {
    // Protect this active zip path from any background temp cleaner
    activeTempPaths.add(tempZipPath);

    let job = this.jobs.get(jobId);
    if (!job) {
      job = this.createJob(jobId, options.userId, path.basename(tempZipPath));
    }

    job.status = 'scanning';
    job.phaseText = 'Server membaca struktur dan daftar subfolder dalam arsip .ZIP...';
    job.percent = 2;
    this.broadcast(job);

    const startTime = Date.now();
    let zipInstance: any = null;
    let admZipInstance: AdmZip | null = null;
    let isUsingAdmZip = false;

    try {
      let rawEntries: any[] = [];

      try {
        // Initialize StreamZip on disk archive with skipEntryNameValidation for non-standard file paths
        zipInstance = new (StreamZip as any).async({
          file: tempZipPath,
          storeEntries: true,
          skipEntryNameValidation: true
        });

        const entriesMap = await zipInstance.entries();
        rawEntries = Object.values(entriesMap);
      } catch (streamZipErr: any) {
        console.warn('[ZipJobManager] StreamZip gagal membuka arsip, mencoba fallback AdmZip:', streamZipErr?.message);
        if (zipInstance) {
          try { await zipInstance.close(); } catch (_) {}
          zipInstance = null;
        }

        // Fallback to AdmZip
        admZipInstance = new AdmZip(tempZipPath);
        rawEntries = admZipInstance.getEntries().map((entry) => ({
          name: entry.entryName,
          isDirectory: entry.isDirectory,
          size: entry.header.size,
          admEntry: entry
        }));
        isUsingAdmZip = true;
      }

      job.totalEntries = rawEntries.length;

      // Filter valid image files and folder paths
      interface ValidZipItem {
        entry: any;
        filename: string;
        cleanPath: string;
        dirSegments: string[];
        targetFolderPath: string;
        ext: string;
      }

      // Prepare target destination folder base
      let baseFolderPathStr = '';
      if (options.baseFolderId) {
        const folderObj = db.getFolderById(options.baseFolderId);
        if (folderObj) baseFolderPathStr = folderObj.path;
      } else if (options.baseFolderPrefix) {
        baseFolderPathStr = options.baseFolderPrefix.trim().replace(/^\/+|\/+$/g, '');
      }

      const validItems: ValidZipItem[] = [];
      const seenCleanPaths = new Set<string>();
      const seenTargetFolderFiles = new Set<string>();

      for (const entry of rawEntries) {
        if (entry.isDirectory) continue;

        let cleanPath = (entry.name || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');
        if (!cleanPath || cleanPath.endsWith('/')) continue;

        const parts = cleanPath
          .split('/')
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0 && p !== '.' && p !== '..');

        if (parts.length === 0) continue;

        // Skip OS junk files, hidden files, resource forks, and thumbnail/cache subdirectories
        const isJunk = parts.some((p: string, idx: number) => {
          const lower = p.toLowerCase().trim();
          const isDirPart = idx < parts.length - 1;

          if (isDirPart) {
            return (
              lower === '__macosx' ||
              lower === '.ds_store' ||
              lower === 'thumbs.db' ||
              lower === 'desktop.ini' ||
              lower === 'ehthumbs.db' ||
              lower === 'thumbs' ||
              lower === '.thumbs' ||
              lower === 'thumb' ||
              lower === '_thumbs' ||
              lower === '_thumb' ||
              lower === '__thumbs' ||
              lower === 'thumbnails' ||
              lower === '.thumbnails' ||
              lower === '_thumbnails' ||
              lower === 'preview' ||
              lower === 'previews' ||
              lower === '.preview' ||
              lower === '.previews' ||
              lower === 'cache' ||
              lower === '.cache' ||
              lower === 'resized' ||
              lower === '.picasaoriginals' ||
              lower === '.sync' ||
              lower === 'catalog' ||
              lower === 'temp' ||
              lower === 'tmp' ||
              lower === '.git' ||
              lower === '.svn' ||
              lower === '.trash' ||
              lower === '.trashed' ||
              lower.startsWith('._') ||
              lower.startsWith('.') ||
              lower.startsWith('~')
            );
          }

          // Filename checks
          return (
            lower === '.ds_store' ||
            lower === 'thumbs.db' ||
            lower === 'desktop.ini' ||
            lower === 'ehthumbs.db' ||
            lower.startsWith('._') ||
            lower.startsWith('.') ||
            lower.startsWith('~') ||
            lower.startsWith('$') ||
            lower.endsWith('.tmp') ||
            lower.endsWith('.crdownload')
          );
        });

        if (isJunk) continue;

        const filename = parts[parts.length - 1];
        if (!filename || filename.startsWith('.') || filename.startsWith('._')) continue;

        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1) continue;

        const ext = filename.substring(lastDot).toLowerCase().trim();
        if (SUPPORTED_ZIP_IMAGE_EXTS.has(ext)) {
          const normalizedFullPath = parts.join('/').toLowerCase();
          if (seenCleanPaths.has(normalizedFullPath)) {
            continue; // Deduplicate identical raw path entries within ZIP
          }
          seenCleanPaths.add(normalizedFullPath);

          const dirSegments = parts.slice(0, -1);
          let combinedParts: string[] = [];
          if (baseFolderPathStr) {
            combinedParts.push(...baseFolderPathStr.split('/').filter(Boolean));
          }
          combinedParts.push(...dirSegments);
          const finalFolderPath = combinedParts.join('/');

          // Deduplicate by target folder + filename to prevent duplicate uploads
          const targetKey = `${(finalFolderPath || '').toLowerCase()}///${filename.toLowerCase()}`;
          if (seenTargetFolderFiles.has(targetKey)) {
            continue;
          }
          seenTargetFolderFiles.add(targetKey);

          validItems.push({
            entry,
            filename,
            cleanPath: parts.join('/'),
            dirSegments,
            targetFolderPath: finalFolderPath,
            ext
          });
        }
      }

      job.validImagesCount = validItems.length;

      if (validItems.length === 0) {
        throw new Error(
          'Tidak ditemukan file gambar yang didukung (.jpg, .png, .webp, .heic, .avif, .gif, .svg, dll) di dalam arsip ZIP ini.'
        );
      }

      const settings = db.getSettings();
      const targetSizeBytes = (settings.targetImageSizeMb || 2) * 1024 * 1024;
      const protocol = options.protocol || 'http';
      const host = options.host || 'localhost:3000';
      const baseUrl = settings.publicImageUrl || `${protocol}://${host}`;

      job.status = 'extracting';
      job.phaseText = `Mengekstrak, mengompres & memetakan 0 dari ${validItems.length} gambar di server...`;
      job.percent = 5;
      this.broadcast(job);

      const addedImages: ImageItem[] = [];
      const createdFolderPaths = new Set<string>();
      let batchToSave: ImageItem[] = [];
      let lastBroadcastTime = Date.now();

      for (let i = 0; i < validItems.length; i++) {
        if (this.isCancelled(jobId)) {
          job.status = 'cancelled';
          job.phaseText = 'Ekstraksi dibatalkan di server.';
          job.endTime = Date.now();
          job.elapsedMs = job.endTime - job.startTime;
          this.broadcast(job);
          break;
        }

        const item = validItems[i];
        const originalFilename = item.filename;
        const finalFolderPath = item.targetFolderPath;
        let folderId: string | null = null;

        if (finalFolderPath) {
          createdFolderPaths.add(finalFolderPath);
          const folderObj = db.findOrCreateFolderPath(options.userId, finalFolderPath, false);
          folderId = folderObj.id;
        }

        job.currentFolder = finalFolderPath || '(Root Library)';
        job.currentFile = item.cleanPath;
        job.foldersCreated = createdFolderPaths.size;

        try {
          // Stream raw buffer from Zip (StreamZip or AdmZip)
          let rawBuffer: Buffer | null = null;
          if (isUsingAdmZip && admZipInstance) {
            rawBuffer = admZipInstance.readFile(item.entry.admEntry);
          } else if (zipInstance) {
            try {
              rawBuffer = await zipInstance.entryData(item.entry);
            } catch (entryReadErr: any) {
              // Try fallback extraction via AdmZip for this specific entry
              try {
                if (!admZipInstance) {
                  admZipInstance = new AdmZip(tempZipPath);
                }
                rawBuffer = admZipInstance.readFile(item.entry.name);
              } catch (_) {}
            }
          }

          if (!rawBuffer || rawBuffer.length === 0) {
            job.skippedCount++;
            continue;
          }

          // Process & compress on server
          const processed = await ImageProcessor.processImage(rawBuffer, originalFilename, {
            targetSizeBytes,
            initialQuality: settings.defaultQuality,
            outputFormat: settings.outputFormat
          });

          // Clean exact stored filename without random hash suffix
          const storedFilename = originalFilename;
          const baseName = path.parse(originalFilename).name;

          const storageRelPath = finalFolderPath
            ? `${finalFolderPath}/${storedFilename}`
            : storedFilename;
          const thumbRelPath = finalFolderPath
            ? `${finalFolderPath}/thumbs/${storedFilename}.webp`
            : `thumbs/${storedFilename}.webp`;

          // Write file & thumbnail to persistent storage
          await defaultStorage.saveFile(storageRelPath, processed.buffer);
          await defaultStorage.saveFile(thumbRelPath, processed.thumbnailBuffer);

          const directUrl = defaultStorage.getPublicUrl(storageRelPath, baseUrl);
          const thumbnailUrl = defaultStorage.getPublicUrl(thumbRelPath, baseUrl);

          const imageRecord: ImageItem = {
            id: `img_${crypto.randomBytes(8).toString('hex')}`,
            userId: options.userId,
            folderId,
            folderPath: finalFolderPath,
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

          addedImages.push(imageRecord);
          batchToSave.push(imageRecord);

          // Flush every 20 images incrementally
          if (batchToSave.length >= 20) {
            db.bulkAddImages(batchToSave);
            batchToSave = [];
          }

          job.processedCount = addedImages.length;
        } catch (entryErr: any) {
          console.error(`Gagal memproses file ${item.cleanPath}:`, entryErr);
          job.skippedCount++;
        }

        // Metrics calculation
        const now = Date.now();
        const elapsedSoFarSec = (now - startTime) / 1000;
        const speed = elapsedSoFarSec > 0 ? (i + 1) / elapsedSoFarSec : 0;
        const remainingItems = validItems.length - (i + 1);
        const etaSec = speed > 0 ? Math.ceil(remainingItems / speed) : 0;

        const currentPct = 5 + Math.round(((i + 1) / validItems.length) * 93);
        job.percent = Math.min(currentPct, 98);
        job.elapsedMs = now - startTime;
        job.speedFilesPerSec = Math.round(speed * 10) / 10;
        job.estimatedRemainingSec = etaSec;
        job.phaseText = `Memproses & mengompres: [${item.cleanPath}] (${i + 1}/${validItems.length} gambar - ${job.percent}%)`;

        // Throttle SSE broadcasts to max every 100ms or on completion
        if (now - lastBroadcastTime > 100 || i === validItems.length - 1) {
          lastBroadcastTime = now;
          this.broadcast(job);
        }
      }

      // Flush remaining batch
      if (batchToSave.length > 0) {
        db.bulkAddImages(batchToSave);
        batchToSave = [];
      }

      db.flushSync();

      const totalElapsed = Date.now() - startTime;
      const directUrls = addedImages.map((img) => img.directUrl);

      const result: ZipJobResult = {
        totalExtracted: addedImages.length,
        foldersCreated: createdFolderPaths.size,
        elapsedMs: totalElapsed,
        images: addedImages,
        directUrls
      };

      if (!this.isCancelled(jobId)) {
        job.status = 'completed';
        job.percent = 100;
        job.endTime = Date.now();
        job.elapsedMs = totalElapsed;
        job.phaseText = `Selesai! Berhasil mengekstrak ${addedImages.length} gambar dan memetakan ${createdFolderPaths.size} folder di server.`;
        job.result = result;
        this.broadcast(job);
      }

      return result;
    } catch (error: any) {
      console.error(`Error during server zip job ${jobId}:`, error);
      job.status = 'error';
      job.error = error.message || 'Gagal mengekstrak file ZIP di server';
      job.phaseText = `Error: ${job.error}`;
      job.endTime = Date.now();
      job.elapsedMs = job.endTime - job.startTime;
      this.broadcast(job);
      throw error;
    } finally {
      if (zipInstance) {
        try {
          await zipInstance.close();
        } catch (_) {}
      }
      // Release this zip path from activeTempPaths set
      activeTempPaths.delete(tempZipPath);

      // Guarantee temporary zip archive is deleted immediately from disk with retries
      if (tempZipPath) {
        await safeDeleteTempFile(tempZipPath, 5, 100);
      }
      // Purge any other temporary chunk or orphaned file older than 15 minutes
      try {
        purgeOrphanedTempFiles(15 * 60 * 1000);
      } catch (_) {}
    }
  }
}

export const zipJobManager = new ZipJobManagerService();
