import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BlobReader, ZipReader, BlobWriter } from '@zip.js/zip.js';
import {
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FolderUp,
  FileImage,
  RotateCcw,
  Sliders,
  Play,
  Pause,
  Trash2,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  Zap,
  HardDrive,
  FolderPlus,
  FileArchive,
  Copy,
  ExternalLink,
  Download,
  FolderCheck,
  Layers,
  ArrowRight,
  Server,
  Cpu,
  Activity,
  Clock,
  Gauge,
  CheckCircle2,
  FileCheck
} from 'lucide-react';
import { Folder, UploadJob, ImageItem, ZipJobProgress } from '../types';
import { api } from '../lib/api';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  currentFolderId: string | null;
  onUploadSuccess: () => void;
  initialTab?: 'files' | 'zip';
}

interface InternalJob extends UploadJob {
  _file: File;
}

interface ZipExtractionResult {
  message: string;
  totalExtracted: number;
  foldersCreated: number;
  elapsedMs: number;
  images: ImageItem[];
  directUrls: string[];
}

interface ParsedZipEntryInfo {
  name: string;
  fullPath: string;
  dirSegments: string[];
  size: number;
  extractBlob: () => Promise<Blob>;
}

export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
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

export function getMimeTypeFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return 'image/jpeg';
  const ext = filename.substring(lastDot).toLowerCase().trim();
  switch (ext) {
    case '.png':
    case '.apng':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
    case '.dib':
      return 'image/bmp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    case '.ico':
      return 'image/x-icon';
    case '.heic':
    case '.heif':
    case '.hif':
      return 'image/heic';
    case '.dng':
    case '.raw':
    case '.cr2':
    case '.nef':
    case '.arw':
      return 'image/x-adobe-dng';
    case '.jpg':
    case '.jpeg':
    case '.jpe':
    case '.jfif':
    case '.jif':
    case '.jfi':
    case '.pjpeg':
    case '.pjp':
    default:
      return 'image/jpeg';
  }
}

/**
 * Universal ZIP parser supporting standard ZIP and Zip64 (>4GB to 50GB+) archives,
 * deeply nested phone type folders, non-ASCII UTF-8 names, and ignores OS system junk.
 */
export async function parseZipArchive(zipFile: File): Promise<{
  entries: ParsedZipEntryInfo[];
  folderCount: number;
  totalSize: number;
}> {
  // Use @zip.js/zip.js with BlobReader to stream Zip64 files (>4GB up to tens of GBs) with zero RAM exhaustion
  const zipReader = new ZipReader(new BlobReader(zipFile));
  const rawEntries = await zipReader.getEntries();

  const entries: ParsedZipEntryInfo[] = [];
  const folderSet = new Set<string>();
  const seenCleanPaths = new Set<string>();
  const seenTargetFolderFiles = new Set<string>();
  let totalSize = 0;

  for (const entry of rawEntries) {
    if (entry.directory) continue;

    let cleanPath = (entry.filename || '').replace(/\\/g, '/');
    cleanPath = cleanPath.replace(/^\.?\/+/, '');
    if (!cleanPath || cleanPath.endsWith('/')) continue;

    const parts = cleanPath
      .split('/')
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p !== '.' && p !== '..');

    if (parts.length === 0) continue;

    // Ignore OS junk, thumbnail folders, cache, and hidden metadata
    const hasJunk = parts.some((p, idx) => {
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

    if (hasJunk) continue;

    const filename = parts[parts.length - 1];
    if (!filename || filename.startsWith('.') || filename.startsWith('._')) continue;

    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) continue;

    const ext = filename.substring(lastDot).toLowerCase().trim();
    if (SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
      const normalizedPath = parts.join('/').toLowerCase();
      if (seenCleanPaths.has(normalizedPath)) {
        continue;
      }
      seenCleanPaths.add(normalizedPath);

      const dirSegments = parts.slice(0, -1);
      const folderPath = dirSegments.join('/');
      const targetKey = `${folderPath.toLowerCase()}///${filename.toLowerCase()}`;

      if (seenTargetFolderFiles.has(targetKey)) {
        continue;
      }
      seenTargetFolderFiles.add(targetKey);

      if (dirSegments.length > 0) {
        folderSet.add(folderPath);
      }
      const uncompressedSize = entry.uncompressedSize || 0;
      totalSize += uncompressedSize;

      const mimeType = getMimeTypeFromFilename(filename);
      const zipFileEntry = entry as any;

      entries.push({
        name: filename,
        fullPath: parts.join('/'),
        dirSegments,
        size: uncompressedSize,
        extractBlob: async () => {
          if (!zipFileEntry.getData) {
            throw new Error('Metode ekstraksi entri tidak didukung');
          }
          return await zipFileEntry.getData(new BlobWriter(mimeType));
        }
      });
    }
  }

  return {
    entries,
    folderCount: folderSet.size,
    totalSize
  };
}

/**
 * Recursively scans files and directories from DragEvent dataTransfer
 */
async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = [];
  const items = dataTransfer.items;

  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    const entries: { entry: any; path: string }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          entries.push({ entry, path: '' });
        }
      }
    }

    const traverse = async (entry: any, currentPath: string): Promise<void> => {
      if (!entry) return;

      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          entry.file(
            (file: File) => {
              const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
              try {
                Object.defineProperty(file, 'webkitRelativePath', {
                  value: relPath,
                  writable: false
                });
              } catch (_) {}
              (file as any)._customRelativePath = relPath;
              files.push(file);
              resolve();
            },
            () => resolve()
          );
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const dirPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        const readAllDirectoryEntries = async (): Promise<any[]> => {
          const dirEntries: any[] = [];
          const readBatch = async (): Promise<void> => {
            return new Promise((resolve) => {
              dirReader.readEntries(
                async (batch: any[]) => {
                  if (!batch || batch.length === 0) {
                    resolve();
                  } else {
                    dirEntries.push(...batch);
                  }
                },
                () => resolve()
              );
            });
          };
          await readBatch();
          return dirEntries;
        };

        const subEntries = await readAllDirectoryEntries();
        for (const subEntry of subEntries) {
          await traverse(subEntry, dirPath);
        }
      }
    };

    for (const item of entries) {
      await traverse(item.entry, item.path);
    }

    if (files.length > 0) return files;
  }

  // Fallback to standard files list
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    return Array.from(dataTransfer.files);
  }

  return [];
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  folders,
  currentFolderId,
  onUploadSuccess,
  initialTab = 'files'
}) => {
  // Modal Tab Mode: 'files' (regular multi-file / folder) or 'zip' (ZIP upload & auto-extract)
  const [activeTab, setActiveTab] = useState<'files' | 'zip'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Common target folder
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);
  const [customFolderPrefix, setCustomFolderPrefix] = useState<string>('');

  // ----------------------------------------------------
  // FILE / FOLDER BATCH UPLOAD STATE
  // ----------------------------------------------------
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [queueFilter, setQueueFilter] = useState<'all' | 'active' | 'failed' | 'completed' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const [autoRetry, setAutoRetry] = useState<boolean>(true);
  const [maxRetries, setMaxRetries] = useState<number>(3);
  const [concurrency, setConcurrency] = useState<number>(4);
  const [showRetrySettings, setShowRetrySettings] = useState<boolean>(false);

  const jobsMapRef = useRef<Map<string, InternalJob>>(new Map());
  const pendingQueueRef = useRef<string[]>([]);
  const activeWorkerCountRef = useRef<number>(0);
  const isUploadingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const concurrencyRef = useRef<number>(4);
  const autoRetryRef = useRef<boolean>(true);
  const maxRetriesRef = useRef<number>(3);
  const selectedFolderIdRef = useRef<string | null>(currentFolderId);

  const startTimeRef = useRef<number>(0);
  const uploadedCountRef = useRef<number>(0);
  const uploadedBytesRef = useRef<number>(0);

  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    processing: 0,
    pending: 0,
    totalBytes: 0,
    uploadedBytes: 0,
    speedBps: 0,
    filesPerSec: 0,
    etaSeconds: 0
  });

  const [jobsSnapshot, setJobsSnapshot] = useState<UploadJob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const uiSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ----------------------------------------------------
  // ZIP UPLOAD & SERVER EXTRACTION STATE
  // ----------------------------------------------------
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [isInspectingZip, setIsInspectingZip] = useState<boolean>(false);
  const [parsedZipEntries, setParsedZipEntries] = useState<ParsedZipEntryInfo[]>([]);
  const [detectedFolderCount, setDetectedFolderCount] = useState<number>(0);
  const [detectedTotalSize, setDetectedTotalSize] = useState<number>(0);
  const [isProcessingZip, setIsProcessingZip] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [zipStatusText, setZipStatusText] = useState<string>('');
  const [zipResult, setZipResult] = useState<ZipExtractionResult | null>(null);
  const [zipSearch, setZipSearch] = useState<string>('');
  const [copiedZipLinkIndex, setCopiedZipLinkIndex] = useState<number | null>(null);
  const [allCopied, setAllCopied] = useState<boolean>(false);
  const cancelZipRef = useRef<boolean>(false);

  // Real-Time Server ZIP Job Tracking
  const [serverZipJob, setServerZipJob] = useState<ZipJobProgress | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading_zip' | 'server_processing' | 'completed' | 'error'>('idle');
  const [uploadSpeedText, setUploadSpeedText] = useState<string>('');
  const zipUnsubscribeRef = useRef<(() => void) | null>(null);

  // Clean up SSE listeners when component unmounts or modal closes
  useEffect(() => {
    return () => {
      if (zipUnsubscribeRef.current) {
        zipUnsubscribeRef.current();
        zipUnsubscribeRef.current = null;
      }
    };
  }, []);

  // Automatically inspect ZIP structure when file is selected
  useEffect(() => {
    if (!selectedZipFile) {
      setParsedZipEntries([]);
      setDetectedFolderCount(0);
      setDetectedTotalSize(0);
      setIsInspectingZip(false);
      return;
    }

    let isCancelled = false;
    const inspect = async () => {
      setIsInspectingZip(true);
      setZipStatusText('Membaca struktur file .ZIP secara lokal di browser...');
      try {
        const { entries, folderCount, totalSize } = await parseZipArchive(selectedZipFile);

        if (!isCancelled) {
          setParsedZipEntries(entries);
          setDetectedFolderCount(folderCount);
          setDetectedTotalSize(totalSize);
          setIsInspectingZip(false);
          if (entries.length === 0) {
            setZipStatusText('Tidak ada file gambar yang didukung (.jpg, .png, .webp, .heic, .avif, .gif, .svg, dll) di dalam arsip ZIP.');
          } else {
            setZipStatusText(`${entries.length} gambar terdeteksi dalam ${folderCount} subfolder.`);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setIsInspectingZip(false);
          setZipStatusText(`Error membaca ZIP: ${err.message || 'File ZIP tidak valid'}`);
        }
      }
    };

    inspect();
    return () => {
      isCancelled = true;
    };
  }, [selectedZipFile]);

  useEffect(() => {
    isUploadingRef.current = isUploading;
  }, [isUploading]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    concurrencyRef.current = concurrency;
  }, [concurrency]);

  useEffect(() => {
    autoRetryRef.current = autoRetry;
  }, [autoRetry]);

  useEffect(() => {
    maxRetriesRef.current = maxRetries;
  }, [maxRetries]);

  useEffect(() => {
    selectedFolderIdRef.current = selectedFolderId;
  }, [selectedFolderId]);

  useEffect(() => {
    setSelectedFolderId(currentFolderId);
    selectedFolderIdRef.current = currentFolderId;
  }, [currentFolderId]);

  const performSync = useCallback(() => {
    let total = 0;
    let completed = 0;
    let failed = 0;
    let retrying = 0;
    let processing = 0;
    let pending = 0;
    let totalBytes = 0;
    let currentUploadedBytes = 0;

    const snapshot: UploadJob[] = [];

    jobsMapRef.current.forEach((job) => {
      total++;
      totalBytes += job.originalSize || 0;

      if (job.status === 'completed') {
        completed++;
        currentUploadedBytes += job.originalSize || 0;
      } else if (job.status === 'failed') {
        failed++;
      } else if (job.status === 'retrying') {
        retrying++;
      } else if (job.status === 'compressing' || job.status === 'processing') {
        processing++;
        currentUploadedBytes += Math.round(((job.originalSize || 0) * (job.progress || 0)) / 100);
      } else {
        pending++;
      }

      snapshot.push({
        id: job.id,
        userId: job.userId,
        filename: job.filename,
        relativePath: job.relativePath,
        status: job.status,
        progress: job.progress,
        originalSize: job.originalSize,
        compressedSize: job.compressedSize,
        directUrl: job.directUrl,
        errorMessage: job.errorMessage,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      });
    });

    const elapsedSec = startTimeRef.current > 0 ? Math.max((Date.now() - startTimeRef.current) / 1000, 0.1) : 0;
    const speedBps = elapsedSec > 0 ? Math.round(uploadedBytesRef.current / elapsedSec) : 0;
    const filesPerSec = elapsedSec > 0 ? Number((uploadedCountRef.current / elapsedSec).toFixed(1)) : 0;

    const remainingBytes = Math.max(0, totalBytes - currentUploadedBytes);
    const etaSeconds = speedBps > 0 ? Math.ceil(remainingBytes / speedBps) : 0;

    setStats({
      total,
      completed,
      failed,
      retrying,
      processing,
      pending,
      totalBytes,
      uploadedBytes: currentUploadedBytes,
      speedBps,
      filesPerSec,
      etaSeconds
    });

    setJobsSnapshot(snapshot);
  }, []);

  const triggerUISync = useCallback(
    (immediate = false) => {
      if (immediate) {
        if (uiSyncTimerRef.current) {
          clearTimeout(uiSyncTimerRef.current);
          uiSyncTimerRef.current = null;
        }
        performSync();
        return;
      }

      if (uiSyncTimerRef.current) return;

      uiSyncTimerRef.current = setTimeout(() => {
        uiSyncTimerRef.current = null;
        performSync();
      }, 100);
    },
    [performSync]
  );

  useEffect(() => {
    return () => {
      if (uiSyncTimerRef.current) {
        clearTimeout(uiSyncTimerRef.current);
      }
    };
  }, []);

  // Process regular dropped or picked files
  const handleFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Check if user dropped a .zip file in files tab -> redirect to zip tab
    const isZip = files.length === 1 && (
      files[0].name.toLowerCase().endsWith('.zip') ||
      (files[0].type && files[0].type.toLowerCase().includes('zip'))
    );

    if (isZip) {
      setSelectedZipFile(files[0]);
      setActiveTab('zip');
      return;
    }

    const allowedMimes = [
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
      'image/heic',
      'image/heif',
      'image/jfif',
      'image/pjpeg',
      'application/octet-stream'
    ];
    const now = new Date().toISOString();
    const batchId = Date.now().toString(36);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lastDot = file.name.lastIndexOf('.');
      const ext = lastDot !== -1 ? file.name.substring(lastDot).toLowerCase().trim() : '';
      const isImage = allowedMimes.includes((file.type || '').toLowerCase()) || SUPPORTED_IMAGE_EXTENSIONS.has(ext);

      if (!isImage || file.name === '.DS_Store' || file.name === 'Thumbs.db' || file.name.startsWith('._')) continue;

      const relPath = (file as any)._customRelativePath || (file as any).webkitRelativePath || file.name;
      const jobId = `job_${batchId}_${i}_${Math.random().toString(36).substring(2, 6)}`;

      const job: InternalJob = {
        id: jobId,
        userId: 'usr_admin',
        filename: file.name,
        relativePath: relPath,
        status: 'pending',
        progress: 0,
        originalSize: file.size,
        retryCount: 0,
        maxRetries: maxRetriesRef.current,
        createdAt: now,
        updatedAt: now,
        _file: file
      };

      jobsMapRef.current.set(jobId, job);
      pendingQueueRef.current.push(jobId);
    }

    triggerUISync(true);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      const droppedFiles: File[] = Array.from(e.dataTransfer.files || []);
      const zipFile = droppedFiles.find(
        (f: File) =>
          f.name.toLowerCase().endsWith('.zip') ||
          (f.type && f.type.toLowerCase().includes('zip'))
      );

      if (activeTab === 'zip') {
        if (zipFile) {
          setSelectedZipFile(zipFile);
          setZipResult(null);
        } else if (
          droppedFiles.length === 1 &&
          (droppedFiles[0].name.toLowerCase().endsWith('.zip') ||
            (droppedFiles[0].type && droppedFiles[0].type.toLowerCase().includes('zip')))
        ) {
          setSelectedZipFile(droppedFiles[0]);
          setZipResult(null);
        } else if (droppedFiles.length > 0) {
          // If dropped images in ZIP tab, switch to regular files tab and handle
          const files = await extractFilesFromDataTransfer(e.dataTransfer);
          if (files.length > 0) {
            handleFiles(files);
            setActiveTab('files');
          }
        }
      } else {
        if (zipFile && droppedFiles.length === 1) {
          setSelectedZipFile(zipFile);
          setActiveTab('zip');
          setZipResult(null);
        } else {
          const files = await extractFilesFromDataTransfer(e.dataTransfer);
          if (files.length > 0) {
            handleFiles(files);
          }
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // Single job upload with intelligent 503 backoff
  const uploadJobWorker = async (jobId: string): Promise<void> => {
    const job = jobsMapRef.current.get(jobId);
    if (!job || !job._file) return;

    let attempt = job.retryCount || 0;
    const maxAttempts = autoRetryRef.current ? maxRetriesRef.current : 0;

    while (attempt <= maxAttempts) {
      if (isPausedRef.current || !isUploadingRef.current) {
        job.status = 'pending';
        job.progress = 0;
        jobsMapRef.current.set(jobId, job);
        triggerUISync();
        return;
      }

      try {
        if (attempt > 0) {
          job.status = 'retrying';
          job.retryCount = attempt;
          job.errorMessage = `Network retry (attempt ${attempt}/${maxAttempts})...`;
          jobsMapRef.current.set(jobId, job);
          triggerUISync();

          // Exponential backoff with jitter on retry
          await delay(Math.min(1000 * Math.pow(1.5, attempt), 5000));
        }

        job.status = 'processing';
        job.progress = 40;
        job.retryCount = attempt;
        jobsMapRef.current.set(jobId, job);
        triggerUISync();

        const response = await api.uploadImage(
          job._file,
          selectedFolderIdRef.current,
          job.relativePath
        );

        // Upload Succeeded
        job.status = 'completed';
        job.progress = 100;
        job.errorMessage = undefined;
        job.imageId = response.image?.id;
        job.directUrl = response.image?.directUrl;
        job.compressedSize = response.image?.compressedSize;
        job.updatedAt = new Date().toISOString();

        jobsMapRef.current.set(jobId, job);
        uploadedCountRef.current++;
        uploadedBytesRef.current += job.originalSize || 0;

        // Sync main UI every 30 uploads
        if (uploadedCountRef.current % 30 === 0) {
          onUploadSuccess();
        }

        triggerUISync();
        return;
      } catch (err: any) {
        attempt++;
        const errorMsg = err.message || 'Upload failed';

        // Auto back-off if 503 detected
        if (errorMsg.includes('503') || errorMsg.includes('fetch failed')) {
          await delay(1500);
        }

        if (attempt <= maxAttempts && isUploadingRef.current && !isPausedRef.current) {
          job.status = 'retrying';
          job.retryCount = attempt;
          job.errorMessage = `${errorMsg} (Retrying ${attempt}/${maxAttempts}...)`;
          jobsMapRef.current.set(jobId, job);
          triggerUISync();
        } else {
          job.status = 'failed';
          job.progress = 0;
          job.retryCount = attempt - 1;
          job.errorMessage = `${errorMsg}${maxAttempts > 0 ? ` (Failed after ${maxAttempts} retries)` : ''}`;
          job.updatedAt = new Date().toISOString();
          jobsMapRef.current.set(jobId, job);
          triggerUISync();
          return;
        }
      }
    }
  };

  const pumpQueue = () => {
    if (!isUploadingRef.current || isPausedRef.current) return;

    const maxConcurrent = concurrencyRef.current || 4;

    while (
      activeWorkerCountRef.current < maxConcurrent &&
      pendingQueueRef.current.length > 0 &&
      isUploadingRef.current &&
      !isPausedRef.current
    ) {
      const nextJobId = pendingQueueRef.current.shift();
      if (!nextJobId) break;

      activeWorkerCountRef.current++;

      uploadJobWorker(nextJobId)
        .catch((e) => console.error('Worker error:', e))
        .finally(() => {
          activeWorkerCountRef.current--;
          triggerUISync();

          if (pendingQueueRef.current.length === 0 && activeWorkerCountRef.current === 0) {
            isUploadingRef.current = false;
            setIsUploading(false);
            triggerUISync(true);
            onUploadSuccess();
          } else if (isUploadingRef.current && !isPausedRef.current) {
            pumpQueue();
          }
        });
    }
  };

  const startUpload = () => {
    if (isUploadingRef.current) return;

    pendingQueueRef.current = [];
    jobsMapRef.current.forEach((job, id) => {
      if (job.status === 'pending' || job.status === 'failed' || job.status === 'retrying') {
        job.status = 'pending';
        job.errorMessage = undefined;
        pendingQueueRef.current.push(id);
      }
    });

    if (pendingQueueRef.current.length === 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }

    isUploadingRef.current = true;
    isPausedRef.current = false;
    setIsUploading(true);
    setIsPaused(false);
    triggerUISync(true);

    pumpQueue();
  };

  const pauseUpload = () => {
    isPausedRef.current = true;
    isUploadingRef.current = false;
    setIsPaused(true);
    setIsUploading(false);
    triggerUISync(true);
  };

  const resumeUpload = () => {
    isPausedRef.current = false;
    isUploadingRef.current = true;
    setIsPaused(false);
    setIsUploading(true);

    if (pendingQueueRef.current.length === 0) {
      jobsMapRef.current.forEach((job, id) => {
        if (job.status === 'pending' || job.status === 'retrying') {
          pendingQueueRef.current.push(id);
        }
      });
    }

    triggerUISync(true);
    pumpQueue();
  };

  const handleRetrySingle = (jobId: string) => {
    const job = jobsMapRef.current.get(jobId);
    if (!job) return;

    job.status = 'pending';
    job.retryCount = 0;
    job.errorMessage = undefined;
    jobsMapRef.current.set(jobId, job);

    if (!pendingQueueRef.current.includes(jobId)) {
      pendingQueueRef.current.push(jobId);
    }

    triggerUISync(true);

    if (!isUploadingRef.current) {
      isUploadingRef.current = true;
      isPausedRef.current = false;
      setIsUploading(true);
      setIsPaused(false);
      pumpQueue();
    }
  };

  const handleRetryAllFailed = () => {
    let failedCount = 0;
    jobsMapRef.current.forEach((job, id) => {
      if (job.status === 'failed') {
        job.status = 'pending';
        job.retryCount = 0;
        job.errorMessage = undefined;
        if (!pendingQueueRef.current.includes(id)) {
          pendingQueueRef.current.push(id);
        }
        failedCount++;
      }
    });

    if (failedCount === 0) return;

    triggerUISync(true);

    if (!isUploadingRef.current) {
      isUploadingRef.current = true;
      isPausedRef.current = false;
      setIsUploading(true);
      setIsPaused(false);
      pumpQueue();
    }
  };

  const handleClearCompleted = () => {
    const toDelete: string[] = [];
    jobsMapRef.current.forEach((job, id) => {
      if (job.status === 'completed') toDelete.push(id);
    });
    toDelete.forEach((id) => jobsMapRef.current.delete(id));
    triggerUISync(true);
  };

  const handleClearAll = () => {
    isUploadingRef.current = false;
    isPausedRef.current = false;
    setIsUploading(false);
    setIsPaused(false);
    pendingQueueRef.current = [];
    jobsMapRef.current.clear();
    startTimeRef.current = 0;
    uploadedCountRef.current = 0;
    uploadedBytesRef.current = 0;
    triggerUISync(true);
  };

  const handleRemoveJob = (jobId: string) => {
    jobsMapRef.current.delete(jobId);
    pendingQueueRef.current = pendingQueueRef.current.filter((id) => id !== jobId);
    triggerUISync(true);
  };

  // ----------------------------------------------------
  // SERVER-SIDE HIGH-PERFORMANCE ZIP EXTRACTION & COMPRESSION
  // ----------------------------------------------------
  const handleStartZipUpload = async () => {
    if (!selectedZipFile || isProcessingZip) return;

    setIsProcessingZip(true);
    cancelZipRef.current = false;
    setZipProgress(0);
    setZipResult(null);
    setServerZipJob(null);

    const generatedJobId = `zip_job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setActiveJobId(generatedJobId);
    setUploadPhase('uploading_zip');
    setZipStatusText('Menyiapkan server & mengunggah arsip .ZIP...');

    // Pre-initialize job on server so endpoints and events are immediately available without 404
    await api.initZipJob(generatedJobId, selectedZipFile.name);

    // Close any previous listener
    if (zipUnsubscribeRef.current) {
      zipUnsubscribeRef.current();
      zipUnsubscribeRef.current = null;
    }

    // Subscribe to real-time Server-Sent Events for live progress
    zipUnsubscribeRef.current = api.listenZipJobProgress(
      generatedJobId,
      (job) => {
        setServerZipJob(job);
        if (job.status === 'scanning' || job.status === 'extracting') {
          setUploadPhase('server_processing');
          setZipProgress(job.percent || 0);
          setZipStatusText(job.phaseText || 'Server sedang mengekstrak & mengompres gambar...');
        } else if (job.status === 'completed') {
          setUploadPhase('completed');
          setZipProgress(100);
          setZipStatusText(job.phaseText || 'Ekstraksi ZIP di server selesai!');
          if (job.result) {
            setZipResult(job.result);
          }
        } else if (job.status === 'error') {
          setUploadPhase('error');
          setZipStatusText(`Error Server: ${job.error || 'Gagal mengekstrak ZIP di server'}`);
        } else if (job.status === 'cancelled') {
          setUploadPhase('idle');
          setZipStatusText('Proses ekstraksi ZIP di server dibatalkan.');
        }
      },
      (err) => {
        console.warn('SSE stream error, falling back:', err);
      }
    );

    let lastUploadTime = Date.now();
    let lastLoadedBytes = 0;

    try {
      const result = await api.uploadZip(
        selectedZipFile,
        selectedFolderId,
        customFolderPrefix,
        (pct, loaded, total) => {
          // Uploading phase progress
          const now = Date.now();
          const timeDelta = (now - lastUploadTime) / 1000;
          if (timeDelta >= 0.5) {
            const bytesDelta = loaded - lastLoadedBytes;
            const speedBytesPerSec = bytesDelta / timeDelta;
            setUploadSpeedText(`${formatBytes(speedBytesPerSec)}/s`);
            lastUploadTime = now;
            lastLoadedBytes = loaded;
          }

          if (pct < 100) {
            setZipProgress(Math.round(pct * 0.95)); // Reserve 95-100% for server decompression
            setZipStatusText(
              `Mengunggah file ZIP ke server: ${pct}% (${formatBytes(loaded)} / ${formatBytes(total)})`
            );
          } else {
            setUploadPhase('server_processing');
            setZipStatusText('File ZIP diterima! Server memulai ekstraksi & kompresi...');
          }
        },
        generatedJobId
      );

      // Server finished successfully
      setUploadPhase('completed');
      setZipProgress(100);
      const finalResult: ZipExtractionResult = {
        message: result.message,
        totalExtracted: result.totalExtracted,
        foldersCreated: result.foldersCreated,
        elapsedMs: result.elapsedMs,
        images: result.images,
        directUrls: result.directUrls
      };

      setZipResult(finalResult);
      setZipStatusText(
        `Ekstraksi server selesai! ${result.totalExtracted} gambar aktif dan direct link siap digunakan.`
      );

      // Release client-side file blob memory reference since server processing & extraction is complete
      setSelectedZipFile(null);
      if (zipInputRef.current) {
        zipInputRef.current.value = '';
      }

      onUploadSuccess();
    } catch (err: any) {
      if (!cancelZipRef.current) {
        setUploadPhase('error');
        setZipStatusText(`Error: ${err.message || 'Gagal mengekstrak file ZIP di server'}`);
      }
    } finally {
      setIsProcessingZip(false);
      if (zipUnsubscribeRef.current) {
        zipUnsubscribeRef.current();
        zipUnsubscribeRef.current = null;
      }
    }
  };

  const handleCancelZipProcess = async () => {
    cancelZipRef.current = true;
    if (activeJobId) {
      await api.cancelZipJob(activeJobId);
    }
    if (zipUnsubscribeRef.current) {
      zipUnsubscribeRef.current();
      zipUnsubscribeRef.current = null;
    }
    setIsProcessingZip(false);
    setUploadPhase('idle');
    setZipStatusText('Ekstraksi ZIP dibatalkan oleh pengguna.');
  };

  // Transfer all files in ZIP directly to regular multi-file queue
  const handleTransferZipToBatchQueue = async () => {
    if (!selectedZipFile || isProcessingZip) return;

    setIsProcessingZip(true);
    setZipStatusText('Mengekstrak file gambar untuk antrean batch...');

    try {
      let entries = parsedZipEntries;
      if (entries.length === 0) {
        const parsed = await parseZipArchive(selectedZipFile);
        entries = parsed.entries;
        setParsedZipEntries(parsed.entries);
        setDetectedFolderCount(parsed.folderCount);
        setDetectedTotalSize(parsed.totalSize);
      }

      const extractedFiles: File[] = [];
      for (const item of entries) {
        const blob = await item.extractBlob();
        const mimeType = getMimeTypeFromFilename(item.name);
        const file = new File([blob], item.name, { type: mimeType });

        let relPath = item.fullPath;
        if (customFolderPrefix && customFolderPrefix.trim()) {
          const prefixClean = customFolderPrefix.trim().replace(/^\/+|\/+$/g, '');
          relPath = `${prefixClean}/${item.fullPath}`;
        }
        (file as any)._customRelativePath = relPath;
        extractedFiles.push(file);
      }

      handleFiles(extractedFiles);
      setActiveTab('files');
      setSelectedZipFile(null);
    } catch (err: any) {
      setZipStatusText(`Error: ${err.message || 'Gagal mengekstrak ke antrean'}`);
    } finally {
      setIsProcessingZip(false);
    }
  };

  // Copy All Direct Links to Clipboard
  const handleCopyAllZipLinks = () => {
    if (!filteredZipImages || filteredZipImages.length === 0) return;
    const uniqueUrls = Array.from(new Set(filteredZipImages.map((img) => img.directUrl)));
    const text = uniqueUrls.join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  // Export Links to CSV
  const handleExportZipLinksCsv = () => {
    if (!filteredZipImages || filteredZipImages.length === 0) return;
    let csv = 'Nama File,Folder Ekstrak,Ukuran (KB),Direct Link URL\n';
    filteredZipImages.forEach((img) => {
      const sizeKb = ((img.compressedSize || img.originalSize) / 1024).toFixed(1);
      csv += `"${img.originalFilename}","${img.folderPath || 'Root Library'}","${sizeKb}","${img.directUrl}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `direct_links_${selectedZipFile?.name.replace('.zip', '') || 'extract'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const filteredJobs = useMemo(() => {
    return jobsSnapshot.filter((job) => {
      if (queueFilter === 'failed' && job.status !== 'failed') return false;
      if (queueFilter === 'completed' && job.status !== 'completed') return false;
      if (queueFilter === 'active' && job.status !== 'compressing' && job.status !== 'processing' && job.status !== 'retrying')
        return false;
      if (queueFilter === 'pending' && job.status !== 'pending') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          job.filename.toLowerCase().includes(q) ||
          (job.relativePath && job.relativePath.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [jobsSnapshot, queueFilter, searchQuery]);

  const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE) || 1;
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredJobs.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredJobs, currentPage]);

  const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  // Filtered & Deduplicated ZIP results
  const filteredZipImages = useMemo(() => {
    if (!zipResult || !zipResult.images) return [];
    
    // Strict deduplication by folder path and filename (as well as ID and direct URL)
    const seenFolderFiles = new Set<string>();
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    const uniqueImages: ImageItem[] = [];

    for (const img of zipResult.images) {
      if (!img) continue;
      const folderFileKey = `${(img.folderPath || '').toLowerCase()}///${(img.originalFilename || '').toLowerCase()}`;
      const urlKey = (img.directUrl || '').toLowerCase();
      
      if (seenFolderFiles.has(folderFileKey) || (img.id && seenIds.has(img.id)) || (urlKey && seenUrls.has(urlKey))) {
        continue;
      }

      if (folderFileKey) seenFolderFiles.add(folderFileKey);
      if (img.id) seenIds.add(img.id);
      if (urlKey) seenUrls.add(urlKey);
      uniqueImages.push(img);
    }

    if (!zipSearch.trim()) return uniqueImages;
    const q = zipSearch.toLowerCase();
    return uniqueImages.filter(
      (img) =>
        img.originalFilename.toLowerCase().includes(q) ||
        (img.folderPath && img.folderPath.toLowerCase().includes(q)) ||
        img.directUrl.toLowerCase().includes(q)
    );
  }, [zipResult, zipSearch]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header with Mode Tabs */}
        <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              {activeTab === 'zip' ? <FileArchive className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 dark:text-white text-base">
                  {activeTab === 'zip' ? 'Upload Arsip ZIP & Ekstrak Otomatis' : 'High-Capacity Multi-Image & Folder Uploader'}
                </h2>
                <span className="text-[11px] bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                  {activeTab === 'zip' ? 'Auto-Link Generator' : '5,000+ Anti-Crash'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeTab === 'zip'
                  ? 'Unggah 1 file ZIP berisi ribuan gambar & subfolder, ekstrak seketika dan buat direct URL per folder.'
                  : 'Unggah ribuan gambar dan folder sekaligus dengan auto-retry and multi-stream worker tanpa risiko 503.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Tabs Pill */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('files')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'files'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FolderUp className="w-3.5 h-3.5" />
                <span>File & Folder</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('zip')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'zip'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>Upload File .ZIP</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 md:p-5 overflow-y-auto space-y-4 flex-1">
          {/* ======================================================== */}
          {/* TAB 1: FILE & RECURSIVE FOLDER UPLOAD                   */}
          {/* ======================================================== */}
          {activeTab === 'files' && (
            <>
              {/* Controls Bar: Folder Selector + Concurrency & Auto-Retry */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                    Target Folder:
                  </span>
                  <select
                    value={selectedFolderId || ''}
                    onChange={(e) => setSelectedFolderId(e.target.value || null)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="">(Root Library / Pertahankan Struktur Subfolder Asli)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 relative">
                  <label
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition-all shadow-2xs ${
                      autoRetry
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                    }`}
                    title="Auto retry on network or 503 spikes"
                  >
                    <input
                      type="checkbox"
                      checked={autoRetry}
                      onChange={(e) => setAutoRetry(e.target.checked)}
                      className="rounded border-emerald-400 text-emerald-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                    />
                    <RotateCcw className={`w-3.5 h-3.5 ${autoRetry ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>Auto-Retry: {autoRetry ? `ON (${maxRetries}x)` : 'OFF'}</span>
                  </label>

                  <div className="flex items-center gap-1 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-semibold">{concurrency} Stream</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowRetrySettings(!showRetrySettings)}
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-pointer transition-colors shadow-2xs"
                    title="Engine Settings"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>

                  {showRetrySettings && (
                    <div className="absolute right-0 top-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-2xl z-30 w-64 space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          <span>Auto-Retry Attempts</span>
                          <span className="text-indigo-600 font-bold">{maxRetries}x</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {[1, 2, 3, 5].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setMaxRetries(num)}
                              className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                                maxRetries === num
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {num}x
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          <span>Parallel Upload Streams</span>
                          <span className="text-amber-600 font-bold">{concurrency} workers</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {[2, 4, 6, 8].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setConcurrency(num)}
                              className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                                concurrency === num
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-indigo-300 dark:border-indigo-800/60 bg-indigo-50/30 dark:bg-indigo-950/20 rounded-2xl p-6 text-center transition-all hover:border-indigo-500 hover:bg-indigo-50/60"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-indigo-600/20">
                  <FolderUp className="w-6 h-6" />
                </div>

                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                  Pilih atau Seret & Lepas Gambar / Folder Produk Massal
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">
                  Dapat mengunggah folder bersarang (e.g.{' '}
                  <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px]">
                    Baju Pria/Kemeja/img1.jpg
                  </code>
                  ). Struktur direktori dibuat otomatis.
                </p>

                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-xs"
                  >
                    <FileImage className="w-4 h-4 text-indigo-500" />
                    <span>Pilih File Gambar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => dirInputRef.current?.click()}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-4 py-2 rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    <FolderUp className="w-4 h-4" />
                    <span>Pilih Folder Tree (Massal)</span>
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />

                <input
                  type="file"
                  ref={dirInputRef}
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
              </div>

              {/* Upload Metrics Dashboard */}
              {stats.total > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-slate-400 text-[11px] block">Progress Unggah</span>
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {stats.completed.toLocaleString()} / {stats.total.toLocaleString()}{' '}
                          <span className="text-indigo-600 font-semibold text-xs">({progressPercent}%)</span>
                        </span>
                      </div>

                      <div className="h-7 w-px bg-slate-200 dark:bg-slate-700" />

                      <div>
                        <span className="text-slate-400 text-[11px] block">Ukuran Data</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatBytes(stats.uploadedBytes)} / {formatBytes(stats.totalBytes)}
                        </span>
                      </div>
                    </div>

                    {isUploading && (
                      <div className="flex items-center gap-3 text-xs bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                        <div className="flex items-center gap-1 font-semibold">
                          <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                          <span>{stats.filesPerSec.toFixed(1)} file/detik</span>
                          <span className="text-slate-400">({formatBytes(stats.speedBps)}/s)</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        stats.failed > 0 && stats.completed === 0 ? 'bg-rose-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Queue Table */}
              {stats.total > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                      {(['all', 'active', 'failed', 'completed', 'pending'] as const).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => {
                            setQueueFilter(filter);
                            setCurrentPage(1);
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition-all cursor-pointer ${
                            queueFilter === filter
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          {filter}{' '}
                          <span className="text-[10px] opacity-70">
                            (
                            {filter === 'all'
                              ? stats.total
                              : filter === 'active'
                              ? stats.processing + stats.retrying
                              : stats[filter]}
                            )
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="Cari file..."
                          className="pl-8 pr-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                        />
                      </div>

                      {stats.failed > 0 && (
                        <button
                          type="button"
                          onClick={handleRetryAllFailed}
                          className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 hover:bg-amber-100 text-xs font-semibold rounded-lg border border-amber-200 dark:border-amber-800 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry ({stats.failed})</span>
                        </button>
                      )}

                      {stats.completed > 0 && (
                        <button
                          type="button"
                          onClick={handleClearCompleted}
                          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded cursor-pointer"
                        >
                          Bersihkan Selesai
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 px-2 py-1 rounded cursor-pointer"
                      >
                        Reset Semua
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/60 max-h-64 overflow-y-auto bg-white dark:bg-slate-900">
                    {paginatedJobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-2.5 px-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <FileImage className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {job.filename}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <span>{formatBytes(job.originalSize)}</span>
                              {job.relativePath && (
                                <span className="text-slate-500 truncate max-w-xs">• {job.relativePath}</span>
                              )}
                              {job.errorMessage && (
                                <span
                                  className={`truncate max-w-xs font-medium ${
                                    job.status === 'failed'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                  }`}
                                  title={job.errorMessage}
                                >
                                  • {job.errorMessage}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {job.status === 'pending' && (
                            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                              Antrian
                            </span>
                          )}

                          {(job.status === 'compressing' || job.status === 'processing') && (
                            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Mengunggah...
                            </span>
                          )}

                          {job.status === 'retrying' && (
                            <span className="text-[10px] bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 animate-pulse">
                              <RotateCcw className="w-3 h-3 animate-spin" /> Retry #{job.retryCount || 1}...
                            </span>
                          )}

                          {job.status === 'completed' && (
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Berhasil
                            </span>
                          )}

                          {job.status === 'failed' && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Gagal
                              </span>

                              <button
                                type="button"
                                onClick={() => handleRetrySingle(job.id)}
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Retry</span>
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveJob(job.id)}
                            className="p-1 text-slate-300 hover:text-slate-500 rounded hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                            title="Hapus"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1 px-1">
                      <span>
                        Halaman {currentPage} dari {totalPages} ({filteredJobs.length} file)
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={currentPage <= 1}
                          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                          className="p-1 rounded bg-slate-100 dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-200 cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={currentPage >= totalPages}
                          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                          className="p-1 rounded bg-slate-100 dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-200 cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ======================================================== */}
          {/* TAB 2: SERVER-SIDE ZIP EXTRACTION & AUTO DIRECT LINK GENERATOR */}
          {/* ======================================================== */}
          {activeTab === 'zip' && (
            <div className="space-y-4">
              {/* Server Engine Info Banner */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl p-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Server className="w-4 h-4" />
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold text-indigo-950 dark:text-indigo-200">
                    <span>Server-Side ZIP Extraction Engine</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      Live Stream Active
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                    Seluruh proses dekompresi arsip ZIP, optimasi/kompresi gambar, dan pemetaan hierarki folder/subfolder (termasuk folder tipe HP bersarang) dieksekusi langsung oleh server dengan progress real-time.
                  </p>
                </div>
              </div>

              {/* Destination folder settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Folder Induk Tujuan:
                  </label>
                  <select
                    value={selectedFolderId || ''}
                    onChange={(e) => setSelectedFolderId(e.target.value || null)}
                    disabled={isProcessingZip}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                  >
                    <option value="">(Root Library / Ekstrak Langsung ke Root)</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Prefix Folder Tambahan (Opsional):
                  </label>
                  <input
                    type="text"
                    value={customFolderPrefix}
                    onChange={(e) => setCustomFolderPrefix(e.target.value)}
                    disabled={isProcessingZip}
                    placeholder="Contoh: Koleksi 2026/Impor ZIP"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* ZIP Dropzone */}
              {!zipResult && !isProcessingZip && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-indigo-300 dark:border-indigo-800/60 bg-indigo-50/30 dark:bg-indigo-950/20 rounded-2xl p-6 text-center transition-all hover:border-indigo-500 hover:bg-indigo-50/60"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-indigo-600/20">
                    <FileArchive className="w-7 h-7" />
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                    Seret & Lepas File .ZIP Di Sini
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">
                    Mendukung arsip ZIP multi-level subfolder bersarang (contoh: <code>Merk / Tipe HP / foto.jpg</code>).
                  </p>

                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => zipInputRef.current?.click()}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-600/20"
                    >
                      <FileArchive className="w-4 h-4" />
                      <span>{selectedZipFile ? 'Ganti File ZIP' : 'Pilih File .ZIP'}</span>
                    </button>
                  </div>

                  <input
                    type="file"
                    ref={zipInputRef}
                    accept=".zip,.ZIP,application/zip,application/x-zip-compressed,multipart/x-zip,application/octet-stream"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setSelectedZipFile(e.target.files[0]);
                        setZipResult(null);
                        setServerZipJob(null);
                        e.target.value = '';
                      }
                    }}
                  />

                  {selectedZipFile && (
                    <div className="mt-4 p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl max-w-lg mx-auto text-left shadow-xs space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileArchive className="w-5 h-5 text-indigo-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate text-xs">{selectedZipFile.name}</p>
                            <p className="text-slate-400 text-[11px]">{formatBytes(selectedZipFile.size)} (Ukuran File ZIP)</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedZipFile(null);
                            setParsedZipEntries([]);
                            setServerZipJob(null);
                          }}
                          className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                          title="Hapus file terpilih"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-medium text-[11px]">
                          <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                          Siap diproses di server
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          Auto Folder Mapping: ON
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* REAL-TIME SERVER EXTRACTION PROGRESS DASHBOARD */}
              {isProcessingZip && (
                <div className="bg-white dark:bg-slate-800 border-2 border-indigo-500/30 dark:border-indigo-500/40 rounded-2xl p-5 shadow-lg shadow-indigo-500/5 space-y-4 animate-in fade-in duration-300">
                  {/* Status header with badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                          {uploadPhase === 'uploading_zip'
                            ? 'Tahap 1: Mengunggah Arsip ZIP ke Server'
                            : 'Tahap 2: Ekstraksi & Kompresi di Server'}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md">
                          {zipStatusText}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-mono font-bold border border-indigo-200 dark:border-indigo-800">
                        {zipProgress}%
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelZipProcess}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-800/60 rounded-lg font-semibold cursor-pointer transition-all"
                      >
                        <X className="w-3 h-3" />
                        <span>Batal</span>
                      </button>
                    </div>
                  </div>

                  {/* Animated Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-600">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-emerald-500 rounded-full transition-all duration-300 shadow-sm"
                        style={{ width: `${Math.max(zipProgress, 3)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>0%</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Real-time Server Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-left">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                        <Activity className="w-3 h-3 text-indigo-500" />
                        Gambar Diproses
                      </span>
                      <p className="font-bold text-xs text-slate-900 dark:text-white mt-0.5">
                        {serverZipJob ? `${serverZipJob.processedCount} / ${serverZipJob.validImagesCount}` : 'Memulai...'}
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-left">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                        <FolderCheck className="w-3 h-3 text-emerald-500" />
                        Folder Dibuat
                      </span>
                      <p className="font-bold text-xs text-slate-900 dark:text-white mt-0.5">
                        {serverZipJob ? `${serverZipJob.foldersCreated} Folder` : 'Otomatis'}
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-left">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                        <Gauge className="w-3 h-3 text-cyan-500" />
                        Kecepatan
                      </span>
                      <p className="font-bold text-xs text-slate-900 dark:text-white mt-0.5">
                        {serverZipJob && serverZipJob.speedFilesPerSec > 0
                          ? `${serverZipJob.speedFilesPerSec} file/detik`
                          : uploadSpeedText || '-'}
                      </p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 text-left">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-500" />
                        Estimasi Sisa
                      </span>
                      <p className="font-bold text-xs text-slate-900 dark:text-white mt-0.5">
                        {serverZipJob && serverZipJob.estimatedRemainingSec > 0
                          ? `~${serverZipJob.estimatedRemainingSec} detik`
                          : uploadPhase === 'uploading_zip'
                          ? 'Mengunggah...'
                          : 'Menghitung...'}
                      </p>
                    </div>
                  </div>

                  {/* Real-time Subfolder & File Focus */}
                  {serverZipJob && (serverZipJob.currentFolder || serverZipJob.currentFile) && (
                    <div className="bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-2.5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      {serverZipJob.currentFolder && (
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                            📁 Subfolder Target:
                          </span>
                          <span className="font-mono text-[11px] truncate text-slate-800 dark:text-slate-200">
                            {serverZipJob.currentFolder}
                          </span>
                        </div>
                      )}
                      {serverZipJob.currentFile && (
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                            🖼️ File Sedang Dikompres:
                          </span>
                          <span className="font-mono text-[11px] truncate text-slate-600 dark:text-slate-400">
                            {serverZipJob.currentFile}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Extraction Results & Direct Link Hub */}
              {zipResult && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Summary Card */}
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <FolderCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-sm flex items-center gap-2">
                          <span>Ekstraksi ZIP di Server Selesai!</span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </h4>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          {filteredZipImages.length.toLocaleString()} gambar berhasil diekstrak dan dikompres ke dalam{' '}
                          {zipResult.foldersCreated} folder ({((zipResult.elapsedMs || 1000) / 1000).toFixed(1)}s).
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                          <Trash2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>File .ZIP sementara telah otomatis dihapus dari server (Storage bersih)</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyAllZipLinks}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer transition-all"
                      >
                        {allCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{allCopied ? 'Tersalin!' : 'Salin Semua Direct Link'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportZipLinksCsv}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold rounded-xl shadow-xs cursor-pointer transition-all"
                        title="Download Daftar Link CSV"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </div>

                  {/* Search and Table of Extracted Direct Links */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Daftar File & Direct URL Sesuai Folder:
                      </span>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={zipSearch}
                          onChange={(e) => setZipSearch(e.target.value)}
                          placeholder="Cari file / folder..."
                          className="pl-8 pr-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
                        />
                      </div>
                    </div>

                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/60 max-h-72 overflow-y-auto bg-white dark:bg-slate-900">
                      {filteredZipImages.map((img, idx) => (
                        <div
                          key={img.id}
                          className="p-2.5 px-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <img
                              src={img.thumbnailUrl}
                              alt={img.originalFilename}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200 dark:border-slate-700"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {img.originalFilename}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate">
                                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                  📁 {img.folderPath || 'Root Library'}
                                </span>
                                <span>• {formatBytes(img.compressedSize || img.originalSize)}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono select-all">
                                {img.directUrl}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(img.directUrl);
                                setCopiedZipLinkIndex(idx);
                                setTimeout(() => setCopiedZipLinkIndex(null), 1500);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer font-medium"
                              title="Salin Direct Link"
                            >
                              {copiedZipLinkIndex === idx ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-400" />
                              )}
                              <span>{copiedZipLinkIndex === idx ? 'Disalin' : 'Salin Link'}</span>
                            </button>

                            <a
                              href={img.directUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="Buka Gambar Langsung"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedZipFile(null);
                          setZipResult(null);
                          setServerZipJob(null);
                        }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                      >
                        + Upload File ZIP Lainnya
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {activeTab === 'files' ? (
              <>
                <span>{stats.total.toLocaleString()} total file</span>
                {stats.failed > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">
                    • {stats.failed} butuh retry
                  </span>
                )}
              </>
            ) : (
              <span>
                {zipResult
                  ? `Selesai: ${zipResult.totalExtracted} gambar diekstrak di server`
                  : isProcessingZip
                  ? `Server Processing: ${zipProgress}%`
                  : selectedZipFile
                  ? `Siap diekstrak di server: ${selectedZipFile.name}`
                  : 'Pilih file ZIP untuk diekstrak di server'}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isProcessingZip}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer disabled:opacity-40"
            >
              Tutup
            </button>

            {activeTab === 'files' && (
              <>
                {isUploading && (
                  <button
                    type="button"
                    onClick={pauseUpload}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 font-semibold rounded-xl cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Jeda</span>
                  </button>
                )}

                {isPaused && (
                  <button
                    type="button"
                    onClick={resumeUpload}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer shadow-md shadow-emerald-600/20"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Lanjutkan Unggah</span>
                  </button>
                )}

                {!isUploading && !isPaused && (
                  <button
                    onClick={startUpload}
                    disabled={stats.total === 0 || (stats.completed === stats.total && stats.failed === 0)}
                    className="flex items-center gap-2 px-5 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {stats.failed > 0 && stats.pending === 0
                        ? `Retry ${stats.failed} File Gagal`
                        : stats.total > 0
                        ? `Mulai Unggah ${stats.total.toLocaleString()} File`
                        : 'Mulai Unggah'}
                    </span>
                  </button>
                )}
              </>
            )}

            {activeTab === 'zip' && !zipResult && (
              <div className="flex items-center gap-2">
                {isProcessingZip ? (
                  <button
                    type="button"
                    onClick={handleCancelZipProcess}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 hover:bg-rose-200 font-semibold rounded-xl cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Batalkan Proses</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartZipUpload}
                    disabled={!selectedZipFile}
                    className="flex items-center gap-2 px-5 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>Ekstrak & Proses di Server</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
