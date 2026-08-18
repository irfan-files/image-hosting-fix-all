export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string; // e.g. "Produk/iPhone 15"
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
}

export interface ImageItem {
  id: string;
  userId: string;
  folderId: string | null;
  folderPath: string; // relative folder path e.g. "Produk/iPhone 15"
  originalFilename: string;
  storedFilename: string;
  slug: string;
  mimeType: string;
  extension: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  storagePath: string;
  thumbnailPath: string;
  directUrl: string;
  thumbnailUrl: string;
  checksum: string;
  status: 'active' | 'trash';
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadJob {
  id: string;
  userId: string;
  filename: string;
  relativePath?: string;
  status: 'pending' | 'processing' | 'compressing' | 'completed' | 'failed' | 'retrying';
  progress: number;
  errorMessage?: string;
  imageId?: string;
  directUrl?: string;
  originalSize?: number;
  compressedSize?: number;
  retryCount?: number;
  maxRetries?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StorageStats {
  totalImages: number;
  totalFolders: number;
  totalStorageBytes: number;
  originalStorageBytes: number;
  compressedStorageBytes: number;
  storageSavedBytes: number;
  savedPercentage: number;
  imagesByFormat: Record<string, number>;
  recentUploads: ImageItem[];
}

export interface ExportColumnOptions {
  folder: boolean;
  filename: boolean;
  directUrl: boolean;
  originalSize: boolean;
  compressedSize: boolean;
  width: boolean;
  height: boolean;
  format: boolean;
  uploadDate: boolean;
}

export interface MarketplaceMappingRow {
  folderName: string;
  filename: string;
  directUrl: string;
  subfolder?: string;
  fullPath: string;
}

export interface AppSettings {
  targetImageSizeMb: number;
  defaultQuality: number;
  keepOriginal: boolean;
  outputFormat: 'keep' | 'jpeg' | 'webp' | 'png' | 'avif';
  uploadConcurrency: number;
  publicImageUrl: string;
  storageDriver: 'local' | 's3' | 'r2';
  duplicateAction: 'skip' | 'replace' | 'copy' | 'allow';
}

export type SortOption =
  | 'folder_then_name_asc'
  | 'folder_then_name_desc'
  | 'name_asc'
  | 'name_desc'
  | 'folder_asc'
  | 'folder_desc'
  | 'createdAt_desc'
  | 'createdAt_asc'
  | 'size_desc'
  | 'size_asc';

export interface ZipJobResult {
  totalExtracted: number;
  foldersCreated: number;
  elapsedMs: number;
  images: ImageItem[];
  directUrls: string[];
}

export interface ZipJobProgress {
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

