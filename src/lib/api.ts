import { Folder, ImageItem, StorageStats, AppSettings } from '../types';
import { normalizeImageUrls } from '../utils/url';

const API_BASE = '/api';

export const api = {
  // Auth
  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`);
    return res.json();
  },

  // Stats
  async getStats(): Promise<{ stats: StorageStats }> {
    const res = await fetch(`${API_BASE}/stats`);
    return res.json();
  },

  // Folders
  async getFolders(): Promise<{ folders: Folder[] }> {
    const res = await fetch(`${API_BASE}/folders`);
    return res.json();
  },

  async createFolder(name: string, parentId?: string | null, fullPath?: string): Promise<{ folder: Folder }> {
    const res = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId, path: fullPath })
    });
    return res.json();
  },

  async renameFolder(id: string, name: string): Promise<{ folder: Folder }> {
    const res = await fetch(`${API_BASE}/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return res.json();
  },

  async deleteFolder(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/folders/${id}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  // Images
  async getImages(params: {
    folderId?: string;
    status?: 'active' | 'trash';
    search?: string;
    mimeType?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }): Promise<{ images: ImageItem[]; total: number; pages: number }> {
    const query = new URLSearchParams();
    if (params.folderId !== undefined) query.set('folderId', params.folderId);
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.mimeType) query.set('mimeType', params.mimeType);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.page) query.set('page', params.page.toString());
    if (params.limit) query.set('limit', params.limit.toString());

    const res = await fetch(`${API_BASE}/images?${query.toString()}`);
    const data = await res.json();
    if (data && Array.isArray(data.images)) {
      data.images = data.images.map(normalizeImageUrls);
    }
    return data;
  },

  async uploadImage(
    file: File,
    folderId?: string | null,
    relativePath?: string,
    onProgress?: (progress: number) => void
  ): Promise<{ image: ImageItem; isDuplicate?: boolean }> {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folderId', folderId);
    if (relativePath) formData.append('relativePath', relativePath);

    const res = await fetch(`${API_BASE}/images/upload`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}: Upload failed`;
      try {
        const err = await res.json();
        if (err && err.error) errorMsg = err.error;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    if (data && data.image) {
      data.image = normalizeImageUrls(data.image);
    }
    return data;
  },

  async uploadZip(
    file: File,
    folderId?: string | null,
    folderPrefix?: string,
    onUploadProgress?: (progress: number, loadedBytes: number, totalBytes: number) => void,
    jobId?: string
  ): Promise<{
    message: string;
    jobId?: string;
    totalExtracted: number;
    foldersCreated: number;
    elapsedMs: number;
    images: ImageItem[];
    directUrls: string[];
  }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) formData.append('folderId', folderId);
      if (folderPrefix) formData.append('folderPrefix', folderPrefix);
      if (jobId) formData.append('jobId', jobId);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onUploadProgress) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onUploadProgress(pct, e.loaded, e.total);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data && Array.isArray(data.images)) {
              data.images = data.images.map(normalizeImageUrls);
              data.directUrls = data.images.map((img: ImageItem) => img.directUrl);
            }
            resolve(data);
          } catch (e) {
            reject(new Error('Gagal memproses respon server'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error || `HTTP ${xhr.status}: Gagal mengunggah ZIP`));
          } catch (_) {
            reject(new Error(`HTTP ${xhr.status}: Gagal mengunggah ZIP ke server`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Koneksi jaringan terputus saat mengunggah ZIP ke server'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Waktu unggah ZIP habis (timeout server)'));
      });

      xhr.open('POST', `${API_BASE}/images/upload-zip`);
      xhr.send(formData);
    });
  },

  async cleanupDuplicates(): Promise<{ message: string; removed: number; tempCleaned?: number }> {
    const res = await fetch(`${API_BASE}/images/maintenance/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.json();
  },

  async cleanTempFiles(): Promise<{ message: string; deleted: number }> {
    const res = await fetch(`${API_BASE}/images/maintenance/clean-temp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.json();
  },

  async initZipJob(jobId: string, filename?: string): Promise<{ job: import('../types').ZipJobProgress }> {
    try {
      const res = await fetch(`${API_BASE}/images/zip-jobs/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, filename })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
    return {
      job: {
        id: jobId,
        userId: 'usr_admin',
        filename: filename || 'archive.zip',
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
      }
    };
  },

  listenZipJobProgress(
    jobId: string,
    onUpdate: (job: import('../types').ZipJobProgress) => void,
    onError?: (err: any) => void
  ): () => void {
    let eventSource: EventSource | null = null;
    let pollTimer: any = null;
    let isClosed = false;

    const startPolling = () => {
      if (isClosed || pollTimer) return;
      pollTimer = setInterval(async () => {
        if (isClosed) {
          if (pollTimer) clearInterval(pollTimer);
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/images/zip-jobs/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.job) {
              onUpdate(data.job);
              if (
                data.job.status === 'completed' ||
                data.job.status === 'error' ||
                data.job.status === 'cancelled'
              ) {
                if (pollTimer) clearInterval(pollTimer);
                pollTimer = null;
              }
            }
          }
        } catch (err) {
          if (onError) onError(err);
        }
      }, 700);
    };

    try {
      eventSource = new EventSource(`${API_BASE}/images/zip-jobs/${jobId}/events`);

      eventSource.onmessage = (event) => {
        if (isClosed) return;
        try {
          const data = JSON.parse(event.data);
          if (data && data.id) {
            onUpdate(data);
            if (
              data.status === 'completed' ||
              data.status === 'error' ||
              data.status === 'cancelled'
            ) {
              eventSource?.close();
            }
          }
        } catch (_) {}
      };

      eventSource.onerror = () => {
        if (eventSource) {
          try {
            eventSource.close();
          } catch (_) {}
          eventSource = null;
        }
        startPolling();
      };
    } catch (e) {
      startPolling();
    }

    return () => {
      isClosed = true;
      if (eventSource) {
        try {
          eventSource.close();
        } catch (_) {}
        eventSource = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
  },

  async cancelZipJob(jobId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/images/zip-jobs/${jobId}/cancel`, { method: 'POST' });
      const data = await res.json();
      return data.success;
    } catch (_) {
      return false;
    }
  },

  async renameImage(id: string, originalFilename: string): Promise<{ image: ImageItem }> {
    const res = await fetch(`${API_BASE}/images/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalFilename })
    });
    return res.json();
  },

  async deleteImage(id: string, permanent = false): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/images/${id}?permanent=${permanent}`, {
      method: 'DELETE'
    });
    return res.json();
  },

  async restoreImage(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/images/${id}/restore`, {
      method: 'POST'
    });
    return res.json();
  },

  async bulkDeleteImages(ids: string[], permanent = false): Promise<{ count: number }> {
    const res = await fetch(`${API_BASE}/images/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, permanent })
    });
    return res.json();
  },

  async bulkMoveImages(ids: string[], targetFolderId: string | null): Promise<{ count: number }> {
    const res = await fetch(`${API_BASE}/images/bulk-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, targetFolderId })
    });
    return res.json();
  },

  // Settings
  async getSettings(): Promise<{ settings: AppSettings }> {
    const res = await fetch(`${API_BASE}/settings`);
    return res.json();
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<{ settings: AppSettings }> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return res.json();
  },

  async reindexStorage(): Promise<{ message: string; scanned: number; restored: number; total: number }> {
    const res = await fetch(`${API_BASE}/images/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.json();
  }
};

