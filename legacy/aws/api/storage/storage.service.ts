import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';

import { throwContractHttpError } from '../common/contract-errors';

import { FilesystemStorageAdapter } from './filesystem-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import type { StorageDriver, StorageDriverAdapter } from './storage.types';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value.trim();
  throw new Error(`${name} is required`);
}

function requiredEnvOneOf(names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  throw new Error(`${names.join(' or ')} is required`);
}

function parseStorageDriver(value: string | undefined): StorageDriver {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 's3') return 's3';
  return 'filesystem';
}

function extensionForContentType(contentType: string): string | null {
  const normalized = contentType.trim().toLowerCase();
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  return null;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly adapter: StorageDriverAdapter;

  constructor() {
    this.driver = parseStorageDriver(process.env.STORAGE_DRIVER);

    if (this.driver === 's3') {
      const bucket = requiredEnv('S3_BUCKET');
      const region = requiredEnvOneOf(['S3_REGION', 'AWS_REGION']);
      this.adapter = new S3StorageAdapter(bucket, region);
      return;
    }

    const rootDir = (process.env.STORAGE_FILESYSTEM_ROOT || '/data/balance-storage').trim();
    this.adapter = new FilesystemStorageAdapter(rootDir);
  }

  buildDocumentStorageKey(documentId: string, contentType: string): string {
    const ext = extensionForContentType(contentType);
    if (!ext) {
      throwContractHttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', []);
    }
    return `documents/${documentId}/original.${ext}`;
  }

  getDriver(): StorageDriver {
    return this.driver;
  }

  async saveUploadedDocumentFile(input: {
    documentId: string;
    contentType: string;
    body: Buffer;
  }): Promise<{ storageKey: string }> {
    const storageKey = this.buildDocumentStorageKey(input.documentId, input.contentType);

    try {
      await this.adapter.putObject({
        key: storageKey,
        body: input.body,
        contentType: input.contentType
      });
    } catch (err) {
      this.logger.error(
        `Storage putObject failed (driver=${this.driver}, error=${err instanceof Error ? err.name : 'unknown'})`
      );
      throwContractHttpError(503, 'SERVICE_UNAVAILABLE', 'Storage unavailable', []);
    }

    return { storageKey };
  }

  async getDocumentFile(input: { storageKey: string; expectedContentType: string }): Promise<{ body: Buffer; contentType: string }> {
    try {
      const result = await this.adapter.getObject(input.storageKey);
      return {
        body: result.body,
        contentType: result.contentType || input.expectedContentType
      };
    } catch (err) {
      this.logger.error(
        `Storage getObject failed (driver=${this.driver}, error=${err instanceof Error ? err.name : 'unknown'})`
      );
      throwContractHttpError(404, 'NOT_FOUND', 'Document file not found', []);
    }
  }

  async deleteDocumentFile(storageKey: string): Promise<void> {
    try {
      await this.adapter.deleteObject(storageKey);
    } catch (err) {
      // Storage cleanup is best-effort. Log and continue.
      this.logger.warn(
        `Failed to delete storage object (driver=${this.driver}, error=${err instanceof Error ? err.name : 'unknown'})`
      );
    }
  }
}
