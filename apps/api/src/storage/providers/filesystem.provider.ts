import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  ObjectReference,
  ObjectStorageGetResult,
  ObjectStorageProvider,
  ObjectStoragePutInput,
  ObjectStorageStatResult
} from '../object-storage.types';

type FilesystemObjectMetadata = {
  contentType: string;
  originalFilename?: string | null | undefined;
  sizeBytes: number;
  sha256: string;
};

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

export class FilesystemObjectStorageProvider implements ObjectStorageProvider {
  readonly provider = 'filesystem' as const;
  private readonly resolvedRoot: string;

  constructor(private readonly rootDir: string) {
    this.resolvedRoot = path.resolve(rootDir);
  }

  private resolveKey(key: string): { key: string; targetPath: string; metadataPath: string } {
    const normalizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalizedKey.split('/');

    if (
      !normalizedKey ||
      normalizedKey.includes('\0') ||
      parts.some((part) => part.length === 0 || part === '.' || part === '..')
    ) {
      throw new Error('Invalid object key');
    }

    const targetPath = path.resolve(this.resolvedRoot, ...parts);
    if (!targetPath.startsWith(this.resolvedRoot + path.sep) && targetPath !== this.resolvedRoot) {
      throw new Error('Invalid object key');
    }

    return {
      key: parts.join('/'),
      targetPath,
      metadataPath: `${targetPath}.metadata.json`
    };
  }

  async putObject(input: ObjectStoragePutInput): Promise<ObjectReference> {
    const resolved = this.resolveKey(input.key);
    const digest = sha256(input.body);
    const metadata: FilesystemObjectMetadata = {
      contentType: input.contentType,
      originalFilename: input.originalFilename ?? null,
      sizeBytes: input.body.byteLength,
      sha256: digest
    };

    await fs.mkdir(path.dirname(resolved.targetPath), { recursive: true });
    await fs.writeFile(resolved.targetPath, input.body);
    await fs.writeFile(resolved.metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    return {
      provider: this.provider,
      root: null,
      key: resolved.key,
      originalFilename: metadata.originalFilename ?? null,
      contentType: metadata.contentType,
      sizeBytes: metadata.sizeBytes,
      sha256: metadata.sha256,
      etag: metadata.sha256
    };
  }

  async getObject(key: string): Promise<ObjectStorageGetResult> {
    const resolved = this.resolveKey(key);
    const body = await fs.readFile(resolved.targetPath);
    const metadata = await this.readMetadata(resolved.metadataPath, body);

    return {
      body,
      contentType: metadata?.contentType ?? null,
      sizeBytes: body.byteLength,
      sha256: metadata?.sha256 ?? sha256(body)
    };
  }

  async statObject(key: string): Promise<ObjectStorageStatResult> {
    const resolved = this.resolveKey(key);
    const body = await fs.readFile(resolved.targetPath);
    const metadata = await this.readMetadata(resolved.metadataPath, body);

    return {
      provider: this.provider,
      root: null,
      key: resolved.key,
      contentType: metadata?.contentType ?? 'application/octet-stream',
      sizeBytes: body.byteLength,
      sha256: metadata?.sha256 ?? sha256(body),
      etag: metadata?.sha256 ?? sha256(body)
    };
  }

  async exists(key: string): Promise<boolean> {
    const resolved = this.resolveKey(key);
    try {
      await fs.access(resolved.targetPath);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const resolved = this.resolveKey(key);
    await Promise.all([
      fs.unlink(resolved.targetPath).catch((err: unknown) => {
        if (!isNotFound(err)) throw err;
      }),
      fs.unlink(resolved.metadataPath).catch((err: unknown) => {
        if (!isNotFound(err)) throw err;
      })
    ]);
  }

  private async readMetadata(metadataPath: string, fallbackBody: Buffer): Promise<FilesystemObjectMetadata | null> {
    try {
      const raw = await fs.readFile(metadataPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<FilesystemObjectMetadata>;
      if (!parsed.contentType || !parsed.sha256 || typeof parsed.sizeBytes !== 'number') {
        return null;
      }
      return {
        contentType: parsed.contentType,
        originalFilename: parsed.originalFilename ?? null,
        sizeBytes: parsed.sizeBytes,
        sha256: parsed.sha256
      };
    } catch (err) {
      if (isNotFound(err)) {
        return {
          contentType: 'application/octet-stream',
          originalFilename: null,
          sizeBytes: fallbackBody.byteLength,
          sha256: sha256(fallbackBody)
        };
      }
      return null;
    }
  }
}
