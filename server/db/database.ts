import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { User, Folder, ImageItem, AppSettings, StorageStats } from '../../src/types';

interface DatabaseSchema {
  users: User[];
  folders: Folder[];
  images: ImageItem[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  targetImageSizeMb: 2,
  defaultQuality: 85,
  keepOriginal: false,
  outputFormat: 'keep',
  uploadConcurrency: 6,
  publicImageUrl: '',
  storageDriver: 'local',
  duplicateAction: 'allow'
};

export class Database {
  private dbPath: string;
  private bakPath: string;
  private bak2Path: string;
  private data: DatabaseSchema;
  private isSaving = false;
  private hasPendingSave = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'storage', 'data.json');
    this.bakPath = `${this.dbPath}.bak`;
    this.bak2Path = `${this.dbPath}.bak2`;
    this.data = {
      users: [],
      folders: [],
      images: [],
      settings: DEFAULT_SETTINGS
    };
    this.init();

    // Ensure state is flushed on all process exit events
    const flushHandler = () => {
      this.flushSync();
    };

    process.on('beforeExit', flushHandler);
    process.on('SIGINT', () => {
      flushHandler();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      flushHandler();
      process.exit(0);
    });
  }

  private init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let loaded = false;
    let candidateData: DatabaseSchema | null = null;
    let maxImageCount = -1;

    // Helper to safely inspect candidate JSON files
    const tryReadFile = (filePath: string): DatabaseSchema | null => {
      if (!fs.existsSync(filePath)) return null;
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (!raw || raw.trim().length === 0) return null;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.images)) {
          return parsed;
        }
      } catch (e) {
        console.warn(`File ${filePath} is corrupted or empty:`, e);
      }
      return null;
    };

    const primary = tryReadFile(this.dbPath);
    if (primary) {
      candidateData = primary;
      maxImageCount = primary.images?.length || 0;
    }

    const bak = tryReadFile(this.bakPath);
    if (bak && (bak.images?.length || 0) > maxImageCount) {
      candidateData = bak;
      maxImageCount = bak.images.length;
      console.log(`[Database] Found backup with larger dataset (${maxImageCount} images), selecting backup.`);
    }

    const bak2 = tryReadFile(this.bak2Path);
    if (bak2 && (bak2.images?.length || 0) > maxImageCount) {
      candidateData = bak2;
      maxImageCount = bak2.images.length;
      console.log(`[Database] Found secondary backup with larger dataset (${maxImageCount} images), selecting secondary backup.`);
    }

    if (candidateData) {
      this.data = candidateData;
      if (!this.data.settings) this.data.settings = DEFAULT_SETTINGS;
      if (!this.data.images) this.data.images = [];
      if (!this.data.folders) this.data.folders = [];
      if (!this.data.users) this.data.users = [];
      loaded = true;
      console.log(`[Database] Successfully loaded database with ${this.data.images.length} images and ${this.data.folders.length} folders.`);
      this.deduplicateImages();
    }

    if (!loaded || this.data.users.length === 0) {
      // Create initial admin user if clean start
      this.data.users = [{
        id: 'usr_admin',
        email: 'admin@picmarket.com',
        name: 'Administrator',
        createdAt: new Date().toISOString()
      }];
      this.flushSync();
    }

    // Run comprehensive image deduplication & filename normalization on startup
    this.cleanAndDeduplicateAllImages();

    // Always run disk reconciliation on startup to auto-recover any stored image files from disk
    this.reconcileWithDiskStorage('usr_admin').catch((err) =>
      console.error('Auto-disk reconciliation error:', err)
    );
  }

  /**
   * Scans, normalizes filenames, and removes any duplicate images (including hash-suffixed duplicates like 000-adb305d7.jpg)
   */
  public cleanAndDeduplicateAllImages(): number {
    if (!this.data.images || this.data.images.length === 0) return 0;
    const initialCount = this.data.images.length;
    const uploadsDir = path.join(process.cwd(), 'storage', 'uploads');

    // Hash suffix regex matching names like "000-adb305d7.jpg" or "image_name-2ad785ae.png"
    const HASH_SUFFIX_REGEX = /^(.+?)-[a-f0-9]{6,12}\.([a-zA-Z0-9]+)$/i;

    // Step 1: Pre-pass to map all clean filenames present per folder
    // key: "userId///folderPath///cleanFilename"
    const existingCleanEntries = new Set<string>();
    for (const img of this.data.images) {
      if (!img || !img.originalFilename) continue;
      const uId = img.userId || 'usr_admin';
      const fPath = (img.folderPath || '').toLowerCase().trim();
      const origName = img.originalFilename.trim();
      const match = origName.match(HASH_SUFFIX_REGEX);
      if (!match) {
        existingCleanEntries.add(`${uId}///${fPath}///${origName.toLowerCase()}`);
      }
    }

    const cleanList: ImageItem[] = [];
    const seenFolderFileKeys = new Set<string>();
    const seenStoragePaths = new Set<string>();
    const seenIds = new Set<string>();

    // Step 2: Iterate images, normalize single hashed entries, and prune duplicates
    for (const img of this.data.images) {
      if (!img || !img.id) continue;
      const uId = img.userId || 'usr_admin';
      const fPath = (img.folderPath || '').trim();
      const lowerFPath = fPath.toLowerCase();
      let origName = (img.originalFilename || '').trim();
      const match = origName.match(HASH_SUFFIX_REGEX);

      if (match) {
        const cleanBaseName = `${match[1]}.${match[2]}`;
        const cleanKey = `${uId}///${lowerFPath}///${cleanBaseName.toLowerCase()}`;

        if (existingCleanEntries.has(cleanKey)) {
          // A clean version (e.g. 000.jpg) already exists in this folder!
          // Remove the hashed copy file from disk if it exists
          try {
            if (img.storagePath) {
              const oldFile = path.join(uploadsDir, img.storagePath);
              if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
            }
            if (img.thumbnailPath) {
              const oldThumb = path.join(uploadsDir, img.thumbnailPath);
              if (fs.existsSync(oldThumb)) fs.unlinkSync(oldThumb);
            }
          } catch (_) {}
          // Skip adding this duplicate hashed entry
          continue;
        } else {
          // No clean version exists; normalize this image to cleanBaseName on disk and in DB
          try {
            const oldStoragePath = img.storagePath;
            const newStorageRelPath = fPath ? `${fPath}/${cleanBaseName}` : cleanBaseName;
            const newThumbRelPath = fPath ? `${fPath}/thumbs/${cleanBaseName}.webp` : `thumbs/${cleanBaseName}.webp`;

            if (oldStoragePath && oldStoragePath !== newStorageRelPath) {
              const oldDiskFile = path.join(uploadsDir, oldStoragePath);
              const newDiskFile = path.join(uploadsDir, newStorageRelPath);
              if (fs.existsSync(oldDiskFile)) {
                const targetDir = path.dirname(newDiskFile);
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                fs.renameSync(oldDiskFile, newDiskFile);
              }
            }

            if (img.thumbnailPath && img.thumbnailPath !== newThumbRelPath) {
              const oldThumbFile = path.join(uploadsDir, img.thumbnailPath);
              const newThumbFile = path.join(uploadsDir, newThumbRelPath);
              if (fs.existsSync(oldThumbFile)) {
                const targetThumbDir = path.dirname(newThumbFile);
                if (!fs.existsSync(targetThumbDir)) fs.mkdirSync(targetThumbDir, { recursive: true });
                fs.renameSync(oldThumbFile, newThumbFile);
              }
            }

            origName = cleanBaseName;
            img.originalFilename = cleanBaseName;
            img.storedFilename = cleanBaseName;
            img.slug = match[1];
            img.storagePath = newStorageRelPath;
            img.thumbnailPath = newThumbRelPath;
            existingCleanEntries.add(cleanKey);
          } catch (renErr) {
            console.warn('Failed to rename disk file during normalization:', renErr);
          }
        }
      }

      // Enforce strict uniqueness per (user, folder, filename)
      const folderFileKey = `${uId}///${lowerFPath}///${origName.toLowerCase()}`;
      const pathKey = img.storagePath ? img.storagePath.toLowerCase() : '';

      if (seenIds.has(img.id) || seenFolderFileKeys.has(folderFileKey) || (pathKey && seenStoragePaths.has(pathKey))) {
        continue;
      }

      seenIds.add(img.id);
      seenFolderFileKeys.add(folderFileKey);
      if (pathKey) seenStoragePaths.add(pathKey);
      cleanList.push(img);
    }

    const removed = initialCount - cleanList.length;
    if (removed > 0 || cleanList.length !== this.data.images.length) {
      console.log(`[Database] Normalized filenames and removed ${removed} duplicate image entries.`);
      this.data.images = cleanList;
      this.flushSync();
    }
    return removed;
  }

  /**
   * Scans and removes any duplicate images from the in-memory database and flushes to disk
   */
  public deduplicateImages(): number {
    return this.cleanAndDeduplicateAllImages();
  }

  /**
   * Scans disk storage directory recursively and auto-registers any missing files into database
   */
  public async reconcileWithDiskStorage(userId = 'usr_admin'): Promise<{ scanned: number; restored: number }> {
    const uploadsDir = path.join(process.cwd(), 'storage', 'uploads');
    if (!fs.existsSync(uploadsDir)) return { scanned: 0, restored: 0 };

    const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);
    let scanned = 0;
    let restored = 0;

    // Build O(1) fast lookup set of existing paths to prevent O(N^2) slowdown on 5000+ files
    const existingStoragePaths = new Set<string>();
    const existingFilenames = new Set<string>();
    for (const img of this.data.images) {
      if (img.storagePath) existingStoragePaths.add(img.storagePath.toLowerCase());
      if (img.storedFilename) existingFilenames.add(img.storedFilename.toLowerCase());
      if (img.originalFilename) existingFilenames.add(img.originalFilename.toLowerCase());
    }

    const newlyDiscoveredImages: ImageItem[] = [];

    const walk = (currentDir: string, relativePathPrefix = '') => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        const lowerName = entry.name.toLowerCase();
        if (
          entry.name.startsWith('.') ||
          entry.name.startsWith('._') ||
          lowerName === 'thumbs' ||
          lowerName === 'thumbnails' ||
          lowerName === '.thumbs' ||
          lowerName === 'preview' ||
          lowerName === 'previews' ||
          lowerName === 'cache' ||
          lowerName === '__macosx'
        ) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        const relPath = relativePathPrefix ? `${relativePathPrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (allowedExts.has(ext)) {
            scanned++;
            
            // Check if already in DB in O(1)
            const exists =
              existingStoragePaths.has(relPath.toLowerCase()) ||
              existingFilenames.has(entry.name.toLowerCase());

            if (!exists) {
              try {
                const stat = fs.statSync(fullPath);
                const folderPathStr = relativePathPrefix || '';
                let folderId: string | null = null;

                if (folderPathStr) {
                  const folder = this.findOrCreateFolderPath(userId, folderPathStr, false);
                  folderId = folder.id;
                }

                const baseName = path.parse(entry.name).name;
                const cleanExt = ext.replace('.', '');
                const mimeType = `image/${cleanExt === 'jpg' ? 'jpeg' : cleanExt}`;
                const baseUrl = this.data.settings.publicImageUrl || 'http://localhost:3000';
                const directUrl = `${baseUrl.replace(/\/$/, '')}/images/${relPath.split('/').map(encodeURIComponent).join('/')}`;
                const thumbRelPath = folderPathStr ? `${folderPathStr}/thumbs/${entry.name}.webp` : `thumbs/${entry.name}.webp`;
                const thumbnailUrl = `${baseUrl.replace(/\/$/, '')}/images/${thumbRelPath.split('/').map(encodeURIComponent).join('/')}`;

                const newImg: ImageItem = {
                  id: `img_${crypto.randomBytes(8).toString('hex')}`,
                  userId,
                  folderId,
                  folderPath: folderPathStr,
                  originalFilename: entry.name,
                  storedFilename: entry.name,
                  slug: baseName,
                  mimeType,
                  extension: cleanExt,
                  originalSize: stat.size,
                  compressedSize: stat.size,
                  width: 1200,
                  height: 1200,
                  storagePath: relPath,
                  thumbnailPath: thumbRelPath,
                  directUrl,
                  thumbnailUrl,
                  checksum: `${entry.name}_${stat.size}`,
                  status: 'active',
                  createdAt: stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };

                newlyDiscoveredImages.push(newImg);
                existingStoragePaths.add(relPath);
                existingFilenames.add(entry.name);
                restored++;
              } catch (e) {
                console.error(`Failed to auto-index file ${relPath}:`, e);
              }
            }
          }
        }
      }
    };

    try {
      walk(uploadsDir);
      if (newlyDiscoveredImages.length > 0) {
        this.data.images.push(...newlyDiscoveredImages);
        console.log(`[Auto-Recovery] Discovered and restored ${restored} missing images from disk! Total database images: ${this.data.images.length}`);
        this.flushSync();
      }
    } catch (e) {
      console.error('Error walking storage directory:', e);
    }

    return { scanned, restored };
  }

  /**
   * Synchronous flush for process lifecycle events and immediate persistence
   */
  public flushSync() {
    try {
      if (this.saveDebounceTimer) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = null;
      }
      const serialized = JSON.stringify(this.data);
      const tempPath = `${this.dbPath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
      fs.writeFileSync(tempPath, serialized, 'utf-8');

      // Rotate backups before replacing main
      if (fs.existsSync(this.bakPath)) {
        try {
          fs.copyFileSync(this.bakPath, this.bak2Path);
        } catch (_) {}
      }
      if (fs.existsSync(this.dbPath)) {
        try {
          fs.copyFileSync(this.dbPath, this.bakPath);
        } catch (_) {}
      }

      fs.renameSync(tempPath, this.dbPath);
    } catch (e) {
      console.error('Failed to flush database sync:', e);
    }
  }

  /**
   * Non-blocking, atomic debounced save to handle high-frequency concurrent writes
   */
  public save() {
    this.hasPendingSave = true;

    if (this.saveDebounceTimer) {
      return;
    }

    // Debounce to batch writes every 500ms
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.performAsyncSave();
    }, 500);
  }

  private async performAsyncSave() {
    if (this.isSaving) {
      // Re-queue if already in-flight
      this.save();
      return;
    }

    if (!this.hasPendingSave) {
      return;
    }

    this.isSaving = true;
    this.hasPendingSave = false;

    try {
      // Compact JSON to reduce disk I/O and memory overhead with 5,000+ files
      const serialized = JSON.stringify(this.data);
      const tempPath = `${this.dbPath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
      
      await fs.promises.writeFile(tempPath, serialized, 'utf-8');

      // Rotate backup snapshots safely
      if (fs.existsSync(this.bakPath)) {
        try {
          await fs.promises.copyFile(this.bakPath, this.bak2Path);
        } catch (_) {}
      }
      if (fs.existsSync(this.dbPath)) {
        try {
          await fs.promises.copyFile(this.dbPath, this.bakPath);
        } catch (_) {}
      }

      await fs.promises.rename(tempPath, this.dbPath);
    } catch (e) {
      console.error('Failed to save database asynchronously:', e);
      this.hasPendingSave = true; // Retry on next cycle
    } finally {
      this.isSaving = false;
      if (this.hasPendingSave) {
        this.save();
      }
    }
  }

  // --- Users ---
  public getUsers(): User[] {
    return this.data.users;
  }

  public getUserByEmail(email: string): User | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public createUser(email: string, name: string): User {
    const user: User = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      email,
      name,
      createdAt: new Date().toISOString()
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  // --- Folders ---
  public getFolders(userId: string): Folder[] {
    const folders = this.data.folders.filter((f) => f.userId === userId);
    return folders.map((f) => {
      const itemCount = this.data.images.filter(
        (img) => img.userId === userId && img.folderId === f.id && img.status === 'active'
      ).length;
      return { ...f, itemCount };
    });
  }

  public getFolderById(id: string): Folder | undefined {
    return this.data.folders.find((f) => f.id === id);
  }

  public findOrCreateFolderPath(userId: string, folderPathString: string, autoSave = true): Folder {
    if (!folderPathString || folderPathString.trim() === '' || folderPathString === '/' || folderPathString === '.') {
      throw new Error('Invalid folder path');
    }

    const segments = folderPathString.split('/').filter(Boolean);
    let parentId: string | null = null;
    let currentPath = '';
    let currentFolder: Folder | null = null;

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = this.data.folders.find(
        (f) => f.userId === userId && f.parentId === parentId && f.name.toLowerCase() === segment.toLowerCase()
      );

      if (existing) {
        parentId = existing.id;
        currentFolder = existing;
      } else {
        const slug = segment.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const newFolder: Folder = {
          id: `fld_${crypto.randomBytes(6).toString('hex')}`,
          userId,
          parentId,
          name: segment,
          slug,
          path: currentPath,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.data.folders.push(newFolder);
        parentId = newFolder.id;
        currentFolder = newFolder;
      }
    }

    if (autoSave) {
      this.save();
    }
    return currentFolder!;
  }

  public createFolder(userId: string, name: string, parentId: string | null = null): Folder {
    let folderPath = name;
    if (parentId) {
      const parent = this.getFolderById(parentId);
      if (parent) {
        folderPath = `${parent.path}/${name}`;
      }
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const folder: Folder = {
      id: `fld_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      parentId,
      name,
      slug,
      path: folderPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.folders.push(folder);
    this.save();
    return folder;
  }

  public renameFolder(id: string, newName: string): Folder | undefined {
    const folder = this.getFolderById(id);
    if (!folder) return undefined;

    const oldPath = folder.path;
    folder.name = newName;
    folder.slug = newName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    // Update path
    if (folder.parentId) {
      const parent = this.getFolderById(folder.parentId);
      folder.path = parent ? `${parent.path}/${newName}` : newName;
    } else {
      folder.path = newName;
    }
    folder.updatedAt = new Date().toISOString();

    // Cascade update child folder paths and image folder paths
    for (const childFolder of this.data.folders) {
      if (childFolder.path.startsWith(`${oldPath}/`)) {
        childFolder.path = childFolder.path.replace(oldPath, folder.path);
        childFolder.updatedAt = new Date().toISOString();
      }
    }

    for (const img of this.data.images) {
      if (img.folderPath.startsWith(oldPath)) {
        img.folderPath = img.folderPath.replace(oldPath, folder.path);
        img.updatedAt = new Date().toISOString();
      }
    }

    this.save();
    return folder;
  }

  public deleteFolder(id: string): boolean {
    const folder = this.getFolderById(id);
    if (!folder) return false;

    const pathPrefix = folder.path;

    // Delete folder and child folders
    this.data.folders = this.data.folders.filter(
      (f) => f.id !== id && f.path !== pathPrefix && !f.path.startsWith(`${pathPrefix}/`)
    );

    // Delete or trash associated images
    for (const img of this.data.images) {
      if (img.folderId === id || img.folderPath.startsWith(pathPrefix)) {
        img.status = 'trash';
        img.updatedAt = new Date().toISOString();
      }
    }

    this.save();
    return true;
  }

  public resolveImageUrls(img: ImageItem, cleanBase?: string): ImageItem {
    if (!img) return img;
    const finalBaseUrl =
      (this.data.settings.publicImageUrl && this.data.settings.publicImageUrl.trim()) ||
      cleanBase ||
      'http://localhost:3000';
    const cleanBaseUrl = finalBaseUrl.replace(/\/+$/, '');

    const relStorage = img.storagePath || (img.folderPath ? `${img.folderPath}/${img.originalFilename}` : img.originalFilename);
    const relThumb = img.thumbnailPath || (img.folderPath ? `${img.folderPath}/thumbs/${img.originalFilename}.webp` : `thumbs/${img.originalFilename}.webp`);

    const sanitizedStorage = relStorage.replace(/\\/g, '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const sanitizedThumb = relThumb.replace(/\\/g, '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');

    return {
      ...img,
      directUrl: `${cleanBaseUrl}/images/${sanitizedStorage}`,
      thumbnailUrl: `${cleanBaseUrl}/images/${sanitizedThumb}`
    };
  }

  // --- Images ---
  public getImages(
    userId: string,
    options: {
      folderId?: string;
      status?: 'active' | 'trash';
      search?: string;
      mimeType?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    } = {},
    reqBaseUrl?: string
  ): { images: ImageItem[]; total: number; pages: number } {
    const status = options.status || 'active';
    let filtered = this.data.images.filter((img) => img.userId === userId && img.status === status);

    if (options.folderId !== undefined) {
      if (options.folderId === 'root') {
        filtered = filtered.filter((img) => !img.folderId);
      } else if (options.folderId) {
        filtered = filtered.filter((img) => img.folderId === options.folderId);
      }
    }

    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter(
        (img) =>
          img.originalFilename.toLowerCase().includes(q) ||
          img.storedFilename.toLowerCase().includes(q) ||
          img.folderPath.toLowerCase().includes(q)
      );
    }

    if (options.mimeType) {
      filtered = filtered.filter((img) => img.mimeType.toLowerCase().includes(options.mimeType!.toLowerCase()));
    }

    // Sort with natural alphanumeric collation (e.g. iPhone 2 before iPhone 10)
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const sortBy = options.sortBy || 'folder_name';
    const sortOrder = options.sortOrder || 'asc';

    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'folder_name' || sortBy === 'folder_then_name_asc' || sortBy === 'folder_then_name_desc') {
        const folderComp = collator.compare(a.folderPath || '', b.folderPath || '');
        if (folderComp !== 0) {
          comparison = folderComp;
        } else {
          comparison = collator.compare(a.originalFilename, b.originalFilename);
        }
      } else if (sortBy === 'name' || sortBy === 'name_asc' || sortBy === 'name_desc') {
        const nameComp = collator.compare(a.originalFilename, b.originalFilename);
        if (nameComp !== 0) {
          comparison = nameComp;
        } else {
          comparison = collator.compare(a.folderPath || '', b.folderPath || '');
        }
      } else if (sortBy === 'folder' || sortBy === 'folder_asc' || sortBy === 'folder_desc') {
        const folderComp = collator.compare(a.folderPath || '', b.folderPath || '');
        if (folderComp !== 0) {
          comparison = folderComp;
        } else {
          comparison = collator.compare(a.originalFilename, b.originalFilename);
        }
      } else if (sortBy === 'size' || sortBy === 'size_asc' || sortBy === 'size_desc') {
        comparison = a.compressedSize - b.compressedSize;
      } else {
        // Default to createdAt
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        comparison = timeA - timeB;
      }

      // Check if sortOrder should reverse
      const isDescending =
        sortOrder === 'desc' ||
        sortBy.endsWith('_desc') ||
        (sortBy === 'createdAt' && !options.sortOrder);

      return isDescending ? -comparison : comparison;
    });

    const total = filtered.length;
    const page = options.page || 1;
    const limit = options.limit || 50;
    const pages = Math.ceil(total / limit) || 1;

    const paginated = filtered.slice((page - 1) * limit, page * limit);
    const resolved = paginated.map((img) => this.resolveImageUrls(img, reqBaseUrl));

    return { images: resolved, total, pages };
  }

  public getImageById(id: string, reqBaseUrl?: string): ImageItem | undefined {
    const img = this.data.images.find((img) => img.id === id);
    if (!img) return undefined;
    return this.resolveImageUrls(img, reqBaseUrl);
  }

  public getImageByChecksum(userId: string, checksum: string): ImageItem | undefined {
    return this.data.images.find((img) => img.userId === userId && img.checksum === checksum && img.status === 'active');
  }

  public addImage(image: ImageItem): ImageItem {
    const uId = image.userId || 'usr_admin';
    const fPath = (image.folderPath || '').toLowerCase().trim();
    const origName = (image.originalFilename || '').toLowerCase().trim();
    const pathKey = image.storagePath ? image.storagePath.toLowerCase() : '';

    const existingIndex = this.data.images.findIndex((img) => {
      if (img.id === image.id) return true;
      if (pathKey && img.storagePath && img.storagePath.toLowerCase() === pathKey) return true;
      const otherUId = img.userId || 'usr_admin';
      const otherFPath = (img.folderPath || '').toLowerCase().trim();
      const otherOrigName = (img.originalFilename || '').toLowerCase().trim();
      return otherUId === uId && otherFPath === fPath && otherOrigName === origName;
    });

    if (existingIndex !== -1) {
      this.data.images[existingIndex] = { ...this.data.images[existingIndex], ...image };
    } else {
      this.data.images.push(image);
    }
    this.save();
    return image;
  }

  public bulkAddImages(images: ImageItem[]): number {
    if (!images || images.length === 0) return 0;
    
    // Build lookup maps for existing images for fast O(1) matching
    const idMap = new Map<string, number>();
    const pathMap = new Map<string, number>();
    const folderFileMap = new Map<string, number>();

    for (let i = 0; i < this.data.images.length; i++) {
      const img = this.data.images[i];
      if (img.id) idMap.set(img.id, i);
      if (img.storagePath) pathMap.set(img.storagePath.toLowerCase(), i);
      const uId = img.userId || 'usr_admin';
      const fPath = (img.folderPath || '').toLowerCase().trim();
      const origName = (img.originalFilename || '').toLowerCase().trim();
      if (origName) {
        folderFileMap.set(`${uId}///${fPath}///${origName}`, i);
      }
    }

    const toAdd: ImageItem[] = [];
    let updatedCount = 0;

    for (const img of images) {
      const uId = img.userId || 'usr_admin';
      const fPath = (img.folderPath || '').toLowerCase().trim();
      const origName = (img.originalFilename || '').toLowerCase().trim();
      const pathKey = img.storagePath ? img.storagePath.toLowerCase() : '';
      const folderFileKey = origName ? `${uId}///${fPath}///${origName}` : '';

      // Check if image already exists in database
      let matchIdx = -1;
      if (idMap.has(img.id)) {
        matchIdx = idMap.get(img.id)!;
      } else if (pathKey && pathMap.has(pathKey)) {
        matchIdx = pathMap.get(pathKey)!;
      } else if (folderFileKey && folderFileMap.has(folderFileKey)) {
        matchIdx = folderFileMap.get(folderFileKey)!;
      }

      if (matchIdx !== -1) {
        // Update existing record in place to prevent duplicate rows
        this.data.images[matchIdx] = { ...this.data.images[matchIdx], ...img };
        updatedCount++;
      } else {
        // Add new unique image
        const newIdx = this.data.images.length + toAdd.length;
        if (img.id) idMap.set(img.id, newIdx);
        if (pathKey) pathMap.set(pathKey, newIdx);
        if (folderFileKey) folderFileMap.set(folderFileKey, newIdx);
        toAdd.push(img);
      }
    }

    if (toAdd.length > 0) {
      this.data.images.push(...toAdd);
    }
    
    this.flushSync();
    return toAdd.length + updatedCount;
  }

  public updateImage(id: string, updates: Partial<ImageItem>): ImageItem | undefined {
    const img = this.getImageById(id);
    if (!img) return undefined;

    Object.assign(img, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return img;
  }

  public deleteImage(id: string, permanent = false): boolean {
    const index = this.data.images.findIndex((img) => img.id === id);
    if (index === -1) return false;

    if (permanent) {
      this.data.images.splice(index, 1);
    } else {
      this.data.images[index].status = 'trash';
      this.data.images[index].updatedAt = new Date().toISOString();
    }

    this.save();
    return true;
  }

  public restoreImage(id: string): boolean {
    const img = this.getImageById(id);
    if (!img) return false;

    img.status = 'active';
    img.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  public bulkDeleteImages(ids: string[], permanent = false): number {
    let count = 0;
    for (const id of ids) {
      if (this.deleteImage(id, permanent)) count++;
    }
    return count;
  }

  public bulkMoveImages(ids: string[], targetFolderId: string | null, targetFolderPath: string): number {
    let count = 0;
    for (const id of ids) {
      const img = this.getImageById(id);
      if (img) {
        img.folderId = targetFolderId;
        img.folderPath = targetFolderPath;
        img.updatedAt = new Date().toISOString();
        count++;
      }
    }
    this.save();
    return count;
  }

  // --- Stats ---
  public getStorageStats(userId: string): StorageStats {
    const userImages = this.data.images.filter((img) => img.userId === userId && img.status === 'active');
    const userFolders = this.data.folders.filter((f) => f.userId === userId);

    let originalStorageBytes = 0;
    let compressedStorageBytes = 0;
    const imagesByFormat: Record<string, number> = {};

    for (const img of userImages) {
      originalStorageBytes += img.originalSize || 0;
      compressedStorageBytes += img.compressedSize || 0;

      const ext = img.extension.toLowerCase();
      imagesByFormat[ext] = (imagesByFormat[ext] || 0) + 1;
    }

    const storageSavedBytes = Math.max(0, originalStorageBytes - compressedStorageBytes);
    const savedPercentage = originalStorageBytes > 0 ? Number(((storageSavedBytes / originalStorageBytes) * 100).toFixed(1)) : 0;

    const recentUploads = [...userImages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    return {
      totalImages: userImages.length,
      totalFolders: userFolders.length,
      totalStorageBytes: compressedStorageBytes,
      originalStorageBytes,
      compressedStorageBytes,
      storageSavedBytes,
      savedPercentage,
      imagesByFormat,
      recentUploads
    };
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  public updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();
    return this.data.settings;
  }
}

export const db = new Database();
