import { Injectable, Logger } from '@nestjs/common';

import { throwContractHttpError } from '../common/contract-errors';

import type { ObjectReference, ObjectStorageProvider } from './object-storage.types';
import { FilesystemObjectStorageProvider } from './providers/filesystem.provider';
import { S3CompatibleObjectStorageProvider } from './providers/s3-compatible.provider';
import { loadStorageRuntimeConfig } from './storage-config';

type DatabaseStorageDriver = 'filesystem' | 's3Compatible';

function extensionForContentType(contentType: string): string | null {
  const normalized = contentType.trim().toLowerCase();
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  return null;
}

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly provider: ObjectStorageProvider;

  constructor() {
    const config = loadStorageRuntimeConfig();
    this.provider =
      config.provider === 's3Compatible'
        ? new S3CompatibleObjectStorageProvider(config.s3CompatibleEndpoint, config.s3CompatibleBucket)
        : new FilesystemObjectStorageProvider(config.filesystemRoot);
  }

  buildDocumentStorageKey(documentId: string, contentType: string): string {
    const ext = extensionForContentType(contentType);
    if (!ext) {
      throwContractHttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', []);
    }
    return `documents/${documentId}/original.${ext}`;
  }

  getProviderName() {
    return this.provider.provider;
  }

  getDriver(): DatabaseStorageDriver {
    return this.provider.provider;
  }

  async saveUploadedDocumentFile(input: {
    documentId: string;
    contentType: string;
    body: Buffer;
    originalFilename?: string | null;
  }): Promise<{ storageKey: string; objectRef: ObjectReference }> {
    const storageKey = this.buildDocumentStorageKey(input.documentId, input.contentType);

    try {
      const objectRef = await this.provider.putObject({
        key: storageKey,
        body: input.body,
        contentType: input.contentType,
        originalFilename: input.originalFilename
      });
      return { storageKey, objectRef };
    } catch (err) {
      this.logger.error(
        `Storage putObject failed (provider=${this.provider.provider}, key=${storageKey})`,
        err instanceof Error ? err.stack : undefined
      );
      throwContractHttpError(503, 'SERVICE_UNAVAILABLE', 'Storage unavailable', []);
    }
  }

  async getDocumentFile(input: { storageKey: string; expectedContentType: string }): Promise<{ body: Buffer; contentType: string }> {
    try {
      const result = await this.provider.getObject(input.storageKey);
      return {
        body: result.body,
        contentType: result.contentType || input.expectedContentType
      };
    } catch (err) {
      this.logger.error(
        `Storage getObject failed (provider=${this.provider.provider}, key=${input.storageKey})`,
        err instanceof Error ? err.stack : undefined
      );
      throwContractHttpError(404, 'NOT_FOUND', 'Document file not found', []);
    }
  }

  async describeDocumentFile(input: {
    storageKey: string;
    expectedContentType: string;
    originalFilename?: string | null;
  }): Promise<ObjectReference> {
    try {
      const result = await this.provider.statObject(input.storageKey);
      return {
        ...result,
        originalFilename: input.originalFilename ?? null,
        contentType: result.contentType || input.expectedContentType
      };
    } catch (err) {
      this.logger.error(
        `Storage statObject failed (provider=${this.provider.provider}, key=${input.storageKey})`,
        err instanceof Error ? err.stack : undefined
      );
      throwContractHttpError(404, 'NOT_FOUND', 'Document file not found', []);
    }
  }

  async deleteDocumentFile(storageKey: string): Promise<void> {
    try {
      await this.provider.deleteObject(storageKey);
    } catch (err) {
      this.logger.warn(
        `Failed to delete storage object (provider=${this.provider.provider}, key=${storageKey})`,
        err instanceof Error ? err.stack : undefined
      );
    }
  }
}
