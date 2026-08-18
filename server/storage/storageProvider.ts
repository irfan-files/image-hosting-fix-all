import fs from 'fs';
import path from 'path';

export interface IStorageProvider {
  saveFile(relativePath: string, buffer: Buffer): Promise<{ fullPath: string; relativePath: string }>;
  deleteFile(relativePath: string): Promise<boolean>;
  moveFile(oldRelativePath: string, newRelativePath: string): Promise<boolean>;
  fileExists(relativePath: string): Promise<boolean>;
  getPublicUrl(relativePath: string, baseUrl: string): string;
}

export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'storage', 'uploads');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  async saveFile(relativePath: string, buffer: Buffer): Promise<{ fullPath: string; relativePath: string }> {
    const sanitizedRelPath = relativePath.replace(/\\/g, '/').replace(/\.\./g, '');
    const fullPath = path.join(this.baseDir, sanitizedRelPath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, buffer);
    return { fullPath, relativePath: sanitizedRelPath };
  }

  async deleteFile(relativePath: string): Promise<boolean> {
    try {
      const sanitizedRelPath = relativePath.replace(/\\/g, '/').replace(/\.\./g, '');
      const fullPath = path.join(this.baseDir, sanitizedRelPath);
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  async moveFile(oldRelativePath: string, newRelativePath: string): Promise<boolean> {
    try {
      const oldSanitized = oldRelativePath.replace(/\\/g, '/').replace(/\.\./g, '');
      const newSanitized = newRelativePath.replace(/\\/g, '/').replace(/\.\./g, '');

      const oldFullPath = path.join(this.baseDir, oldSanitized);
      const newFullPath = path.join(this.baseDir, newSanitized);

      if (!fs.existsSync(oldFullPath)) {
        return false;
      }

      const newDir = path.dirname(newFullPath);
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }

      await fs.promises.rename(oldFullPath, newFullPath);
      return true;
    } catch (error) {
      console.error('Error moving file:', error);
      return false;
    }
  }

  async fileExists(relativePath: string): Promise<boolean> {
    const sanitizedRelPath = relativePath.replace(/\\/g, '/').replace(/\.\./g, '');
    const fullPath = path.join(this.baseDir, sanitizedRelPath);
    return fs.existsSync(fullPath);
  }

  getPublicUrl(relativePath: string, baseUrl: string): string {
    const sanitizedRelPath = relativePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
    const cleanBase = baseUrl.replace(/\/$/, '');
    return `${cleanBase}/images/${sanitizedRelPath}`;
  }
}

export const defaultStorage = new LocalStorageProvider();
