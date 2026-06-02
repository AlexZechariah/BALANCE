import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { StorageDriverAdapter, StoragePutObjectInput } from './storage.types';

export class FilesystemStorageAdapter implements StorageDriverAdapter {
  constructor(private readonly rootDir: string) {}

  private resolveKey(key: string): string {
    const normalizedKey = key.replace(/^\/+/, '');
    const targetPath = path.resolve(this.rootDir, normalizedKey);
    const resolvedRoot = path.resolve(this.rootDir);
    if (!targetPath.startsWith(resolvedRoot + path.sep) && targetPath !== resolvedRoot) {
      throw new Error('Invalid storage key');
    }
    return targetPath;
  }

  async putObject(input: StoragePutObjectInput): Promise<void> {
    const targetPath = this.resolveKey(input.key);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, input.body);
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string | null }> {
    const targetPath = this.resolveKey(key);
    return {
      body: await fs.readFile(targetPath),
      contentType: null
    };
  }

  async deleteObject(key: string): Promise<void> {
    const targetPath = this.resolveKey(key);
    try {
      await fs.unlink(targetPath);
    } catch (err: unknown) {
      // Ignore file-not-found — the object is already gone
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
